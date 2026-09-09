import { Injectable, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Public } from '../shared/auth/decorators.js';
import { WsAuthGuard, WsUnauthorized, type HandshakeLike } from '../shared/auth/ws-auth.guard.js';
import type { Principal } from '../shared/auth/principal.js';
import { RegisterDeviceHandler } from '../contexts/identity/features/register-device/register-device.handler.js';
import { NudgeService, OPS_ROOM, roomForUser } from './nudge.service.js';

/** How long before a token expires the client is told to refresh. */
export const EXPIRY_WARNING_SECONDS = 60;

/** Only the parts of a Socket.IO socket this gateway uses, so a spec can fake one. */
export interface SocketLike {
  id: string;
  handshake: HandshakeLike & { auth?: { token?: unknown; installId?: unknown } };
  data: {
    principal?: Principal;
    entities?: string[];
    expiryWarning?: ReturnType<typeof setTimeout>;
    expiryClose?: ReturnType<typeof setTimeout>;
  };
  join(room: string): unknown;
  emit(event: string, payload?: unknown): unknown;
  disconnect(close?: boolean): unknown;
}

/** The middleware signature Socket.IO's `server.use` takes. */
export type SocketMiddleware = (socket: SocketLike, next: (error?: Error) => void) => void;

export interface ServerLike {
  use(middleware: SocketMiddleware): unknown;
  to(room: string): { emit(event: string, payload: unknown): void };
}

/**
 * The live connection.
 *
 * Authentication happens in the handshake, not per message, and it happens in
 * Socket.IO middleware rather than in `handleConnection`: a rejection from the
 * middleware reaches the client as a real `connect_error` carrying a code, where
 * a disconnect from inside `handleConnection` looks to the client exactly like
 * the network dropping — and a client that cannot tell "your token expired"
 * from "the wifi went" reconnects in a loop with the same dead token.
 *
 * Rooms rather than sockets: `user:<id>` because a member has several devices
 * and a nudge that reached one of them leaves the rest stale, and `ops` for the
 * administrators watching the overview.
 *
 * Service principals are refused. `/ws` carries member traffic; a machine caller
 * has REST and `/internal/*`, and a socket it held open would be a long-lived
 * credential in a process nobody is watching.
 *
 * Backend role only. The worker imports `NudgeService` for its jobs and never
 * attaches a server to it, which is why every emit there is a no-op rather than
 * a crash.
 */
@Injectable()
@WebSocketGateway({
  path: '/ws',
  // Same policy as the REST edge: an empty list means same-origin, which is
  // what running behind the one published port gives you.
  cors: { origin: false, credentials: true },
})
export class SocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SocketGateway.name);

  constructor(
    private readonly auth: WsAuthGuard,
    private readonly nudge: NudgeService,
    private readonly devices: RegisterDeviceHandler,
  ) {}

  afterInit(server: ServerLike): void {
    // What makes every other emit in the application reach anybody. Nothing
    // called this before, because there was no gateway: `NudgeService.attached`
    // was false in both roles and every nudge was silently dropped.
    this.nudge.attach(server);

    server.use((socket, next) => {
      try {
        const { principal, expiresAt } = this.auth.authenticateWithExpiry(socket.handshake);
        socket.data.principal = principal;
        if (expiresAt) this.armExpiry(socket, expiresAt);
        next();
      } catch (error) {
        const reason = error instanceof WsUnauthorized ? error.reason : 'unauthorized';
        const refusal = new Error(reason) as Error & { data?: unknown };
        // Socket.IO puts `data` on the client's `err.data`, which is how the
        // client tells a refresh-and-retry from a sign-in-again.
        refusal.data = { code: reason };
        next(refusal);
      }
    });
  }

  async handleConnection(client: SocketLike): Promise<void> {
    const principal = client.data.principal;
    if (!principal || principal.kind !== 'user') {
      // Unreachable through the middleware above, and checked anyway: an
      // authenticated socket is an invariant of this method, and the cost of
      // being wrong is an unauthenticated connection joining a member's room.
      client.disconnect(true);
      return;
    }

    client.join(roomForUser(principal.id));
    if (principal.role === 'admin') client.join(OPS_ROOM);

    const installId = client.handshake.auth?.installId;
    if (typeof installId === 'string' && installId.length > 0) {
      // The same stamp the sweep reads to decide whether a device has already
      // synced. A connected phone that never updated it would be swept for
      // alerts it had already scheduled itself.
      await this.devices.seen(installId).catch((error: Error) => {
        this.logger.debug(`could not stamp install ${installId}: ${error.message}`);
        return null;
      });
    }
  }

  handleDisconnect(client: SocketLike): void {
    // Both timers, or a socket that closed early keeps a handle alive until its
    // token would have expired - fifteen minutes of leaked timers per reconnect
    // on a phone that is switching networks.
    if (client.data.expiryWarning) clearTimeout(client.data.expiryWarning);
    if (client.data.expiryClose) clearTimeout(client.data.expiryClose);
  }

  /**
   * Optional keepalive. The extension uses it to extend its service worker's
   * life, which is the only reason it exists — a socket does not need pinging.
   */
  @SubscribeMessage('presence.ping')
  @Public()
  presencePing(): { serverTime: string } {
    return { serverTime: new Date().toISOString() };
  }

  /**
   * Which entity names this client wants nudges for.
   *
   * Recorded on the socket and not yet used to filter: the entities arrive with
   * P2, and a filter written now would be a list of names nothing produces.
   * Accepting it from the start means the phone does not need a new protocol
   * version to start asking.
   */
  @SubscribeMessage('sync.subscribe')
  @Public()
  syncSubscribe(
    @MessageBody() body: { entities?: unknown },
    @ConnectedSocket() client: SocketLike,
  ): { ok: true } {
    const entities = Array.isArray(body?.entities)
      ? body.entities.filter((entity): entity is string => typeof entity === 'string')
      : [];
    client.data.entities = entities;
    return { ok: true };
  }

  /**
   * Warns, then closes.
   *
   * The warning is what lets a client refresh without dropping the connection;
   * the close is what stops a socket outliving the credential that opened it.
   * A token already inside the warning window still gets a socket and an
   * immediate warning rather than a refusal — the client has a valid token, and
   * refusing it would make a member who opened the app at the wrong minute
   * unable to connect at all.
   */
  private armExpiry(socket: SocketLike, expiresAt: Date): void {
    const remaining = expiresAt.getTime() - Date.now();
    const warnIn = Math.max(remaining - EXPIRY_WARNING_SECONDS * 1000, 0);

    socket.data.expiryWarning = setTimeout(() => {
      socket.emit('auth.expiring', {
        inSeconds: Math.max(Math.round((expiresAt.getTime() - Date.now()) / 1000), 0),
      });
    }, warnIn);

    socket.data.expiryClose = setTimeout(
      () => {
        // `token_expired` and not a custom disconnect reason: Socket.IO's
        // reason is transport-level and a server cannot set one, so the
        // clients listen for this event. Both the SDK and the phone do.
        socket.emit('token_expired', { code: 'token_expired' });
        socket.disconnect(true);
      },
      Math.max(remaining, 0),
    );

    // Node keeps the process alive for a pending timer. A shutdown waiting on
    // fifteen minutes of socket expiry timers is a deploy that looks hung.
    socket.data.expiryWarning.unref?.();
    socket.data.expiryClose.unref?.();
  }
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { JwtVerifier } from '../shared/auth/jwt.verifier.js';
import { WsAuthGuard } from '../shared/auth/ws-auth.guard.js';
import { NudgeService, OPS_ROOM, roomForUser } from './nudge.service.js';
import {
  EXPIRY_WARNING_SECONDS,
  SocketGateway,
  type ServerLike,
  type SocketLike,
  type SocketMiddleware,
} from './socket.gateway.js';

const SECRET = 'a-test-secret-long-enough';

function tokenFor(
  claims: Record<string, unknown>,
  options: jwt.SignOptions = { expiresIn: '15m' },
): string {
  return jwt.sign(claims, SECRET, options);
}

/** A socket with only what the gateway touches, and a record of what it did. */
function fakeSocket(auth: Record<string, unknown> = {}): SocketLike & {
  rooms: string[];
  emitted: Array<{ event: string; payload: unknown }>;
  disconnected: boolean;
} {
  const rooms: string[] = [];
  const emitted: Array<{ event: string; payload: unknown }> = [];
  return {
    id: 'socket-1',
    handshake: { auth },
    data: {},
    rooms,
    emitted,
    disconnected: false,
    join(room: string) {
      rooms.push(room);
      return undefined;
    },
    emit(event: string, payload?: unknown) {
      emitted.push({ event, payload });
      return undefined;
    },
    disconnect() {
      this.disconnected = true;
      return undefined;
    },
  };
}

function build() {
  const verifier = new JwtVerifier({ JWT_ACCESS_SECRET: SECRET });
  const nudge = new NudgeService();
  const seen = vi.fn(async (_installId: string) => 'device-1');
  const gateway = new SocketGateway(new WsAuthGuard(verifier), nudge, {
    seen,
  } as never);

  let middleware: SocketMiddleware | undefined;
  const server: ServerLike = {
    use(fn) {
      middleware = fn;
      return undefined;
    },
    to() {
      return { emit() {} };
    },
  };
  gateway.afterInit(server);

  /** Runs the handshake middleware and reports what it decided. */
  const handshake = (socket: SocketLike): Error | undefined => {
    let refusal: Error | undefined;
    middleware?.(socket, (error) => {
      refusal = error;
    });
    return refusal;
  };

  return { gateway, nudge, seen, handshake };
}

/**
 * The socket, as a client meets it.
 *
 * P0 marked this gateway done and shipped `nudge.service.ts` and a guard that no
 * module provided — so `NudgeService.attached` was false in both roles, every
 * nudge in the application went nowhere, and all three clients connected to a
 * path that answered nothing. These specs are about the handshake, because the
 * handshake is where a socket is decided: everything after it assumes an
 * authenticated member, and an assumption is only safe if something checks it.
 */
describe('the socket handshake', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('attaches the server, which is what makes every nudge in the application arrive', () => {
    const { nudge } = build();
    expect(nudge.attached).toBe(true);
  });

  it('admits a member and puts them in their own room', async () => {
    const { gateway, handshake } = build();
    const socket = fakeSocket({ token: tokenFor({ sub: 'user-1', role: 'user' }) });

    expect(handshake(socket)).toBeUndefined();
    await gateway.handleConnection(socket);

    expect(socket.rooms).toEqual([roomForUser('user-1')]);
    gateway.handleDisconnect(socket);
  });

  /** An administrator watches the overview; a member must not. */
  it('puts an administrator in the ops room as well, and a member in neither', async () => {
    const { gateway, handshake } = build();

    const admin = fakeSocket({ token: tokenFor({ sub: 'admin-1', role: 'admin' }) });
    handshake(admin);
    await gateway.handleConnection(admin);
    expect(admin.rooms).toEqual([roomForUser('admin-1'), OPS_ROOM]);

    const member = fakeSocket({ token: tokenFor({ sub: 'user-1', role: 'user' }) });
    handshake(member);
    await gateway.handleConnection(member);
    expect(member.rooms).not.toContain(OPS_ROOM);

    gateway.handleDisconnect(admin);
    gateway.handleDisconnect(member);
  });

  it('refuses a socket with no token, with a code the client can branch on', () => {
    const { handshake } = build();

    const refusal = handshake(fakeSocket()) as (Error & { data?: { code?: string } }) | undefined;

    expect(refusal?.message).toBe('unauthorized');
    expect(refusal?.data?.code).toBe('unauthorized');
  });

  /**
   * Told apart from `unauthorized` on purpose. A client that knows the token
   * merely expired refreshes and reconnects; one that reads "unauthorized"
   * signs the member out of an app they are still entitled to use.
   */
  it('distinguishes an expired token from an invalid one', () => {
    const { handshake } = build();

    const expired = handshake(
      fakeSocket({ token: tokenFor({ sub: 'user-1', role: 'user' }, { expiresIn: '-1m' }) }),
    ) as (Error & { data?: { code?: string } }) | undefined;
    expect(expired?.data?.code).toBe('token_expired');

    const garbage = handshake(fakeSocket({ token: 'not-a-token' })) as
      | (Error & { data?: { code?: string } })
      | undefined;
    expect(garbage?.data?.code).toBe('unauthorized');
  });

  /**
   * A machine caller has REST and `/internal/*`. A socket it held open would be
   * a long-lived credential in a process nobody is watching.
   *
   * Driven through a verifier that returns a service principal rather than
   * through a crafted token, because there is no token that produces one:
   * `JwtVerifier.toPrincipal` maps every access token to a member. That makes
   * the refusal a defence in depth rather than the only line, and it is the
   * line that has to hold if a later phase ever issues a service JWT.
   */
  it('refuses a service principal', () => {
    const serviceVerifier = {
      verifyWithExpiry: () => ({
        principal: { kind: 'service', id: 'svc-1', name: 'n8n', scopes: [] },
        expiresAt: null,
      }),
    };
    const gateway = new SocketGateway(
      new WsAuthGuard(serviceVerifier as never),
      new NudgeService(),
      { seen: async () => 'device-1' } as never,
    );
    let middleware: SocketMiddleware | undefined;
    gateway.afterInit({
      use(fn) {
        middleware = fn;
        return undefined;
      },
      to() {
        return { emit() {} };
      },
    });

    let refusal: Error | undefined;
    middleware?.(fakeSocket({ token: 'whatever' }), (error) => {
      refusal = error;
    });

    expect((refusal as (Error & { data?: { code?: string } }) | undefined)?.data?.code).toBe(
      'unauthorized',
    );
  });

  it('stamps the install as seen, which is what the alert sweep reads', async () => {
    const { gateway, seen, handshake } = build();
    const socket = fakeSocket({
      token: tokenFor({ sub: 'user-1', role: 'user' }),
      installId: 'install-abc',
    });

    handshake(socket);
    await gateway.handleConnection(socket);

    expect(seen).toHaveBeenCalledWith('install-abc');
    gateway.handleDisconnect(socket);
  });

  /** The portal has no device, and connecting must not depend on having one. */
  it('connects without an install id', async () => {
    const { gateway, seen, handshake } = build();
    const socket = fakeSocket({ token: tokenFor({ sub: 'user-1', role: 'user' }) });

    handshake(socket);
    await expect(gateway.handleConnection(socket)).resolves.toBeUndefined();

    expect(seen).not.toHaveBeenCalled();
    gateway.handleDisconnect(socket);
  });

  /** A phone with an unreachable store must still get a socket. */
  it('connects even when the device stamp fails', async () => {
    const verifier = new JwtVerifier({ JWT_ACCESS_SECRET: SECRET });
    const gateway = new SocketGateway(new WsAuthGuard(verifier), new NudgeService(), {
      seen: async () => {
        throw new Error('postgres is down');
      },
    } as never);
    let middleware: SocketMiddleware | undefined;
    gateway.afterInit({
      use(fn) {
        middleware = fn;
        return undefined;
      },
      to() {
        return { emit() {} };
      },
    });

    const socket = fakeSocket({
      token: tokenFor({ sub: 'user-1', role: 'user' }),
      installId: 'install-abc',
    });
    middleware?.(socket, () => undefined);

    await expect(gateway.handleConnection(socket)).resolves.toBeUndefined();
    expect(socket.rooms).toEqual([roomForUser('user-1')]);
    gateway.handleDisconnect(socket);
  });
});

describe('the socket and its token expiring', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('warns before the token expires, then closes the socket', () => {
    const { gateway, handshake } = build();
    const socket = fakeSocket({
      token: tokenFor({ sub: 'user-1', role: 'user' }, { expiresIn: '15m' }),
    });

    handshake(socket);
    expect(socket.emitted).toEqual([]);

    // One second past the warning point.
    vi.advanceTimersByTime((15 * 60 - EXPIRY_WARNING_SECONDS + 1) * 1000);
    expect(socket.emitted.map((entry) => entry.event)).toEqual(['auth.expiring']);
    expect(socket.disconnected).toBe(false);

    // A client that did not refresh does not keep an unauthenticated socket.
    vi.advanceTimersByTime(EXPIRY_WARNING_SECONDS * 1000);
    expect(socket.emitted.map((entry) => entry.event)).toEqual(['auth.expiring', 'token_expired']);
    expect(socket.disconnected).toBe(true);

    gateway.handleDisconnect(socket);
  });

  /**
   * A member who opens the app fourteen and a half minutes into a token's life
   * holds a valid credential. Refusing them would be a sign-in screen for
   * nothing; the warning simply arrives at once.
   */
  it('admits a token already inside the warning window and warns immediately', () => {
    const { gateway, handshake } = build();
    const socket = fakeSocket({
      token: tokenFor({ sub: 'user-1', role: 'user' }, { expiresIn: '30s' }),
    });

    expect(handshake(socket)).toBeUndefined();

    vi.advanceTimersByTime(1);
    expect(socket.emitted.map((entry) => entry.event)).toEqual(['auth.expiring']);

    gateway.handleDisconnect(socket);
  });

  /**
   * A phone switching networks reconnects often. A socket that closed early
   * must not leave fifteen minutes of timers behind it each time.
   */
  it('clears both timers when the socket closes early', () => {
    const { gateway, handshake } = build();
    const socket = fakeSocket({
      token: tokenFor({ sub: 'user-1', role: 'user' }, { expiresIn: '15m' }),
    });

    handshake(socket);
    gateway.handleDisconnect(socket);

    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(socket.emitted).toEqual([]);
    expect(socket.disconnected).toBe(false);
  });
});

describe('the socket messages', () => {
  it('answers a presence ping with the server time', () => {
    const { gateway } = build();
    const answer = gateway.presencePing();

    expect(Number.isNaN(Date.parse(answer.serverTime))).toBe(false);
  });

  it('records the entities a client wants nudges for, and tolerates nonsense', () => {
    const { gateway } = build();
    const socket = fakeSocket();

    expect(gateway.syncSubscribe({ entities: ['tasks', 'reminders'] }, socket)).toEqual({
      ok: true,
    });
    expect(socket.data.entities).toEqual(['tasks', 'reminders']);

    gateway.syncSubscribe({ entities: ['tasks', 7, null] as unknown[] }, socket);
    expect(socket.data.entities).toEqual(['tasks']);

    gateway.syncSubscribe({}, socket);
    expect(socket.data.entities).toEqual([]);
  });
});

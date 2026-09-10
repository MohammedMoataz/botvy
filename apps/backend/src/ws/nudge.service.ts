import { Injectable, Logger } from '@nestjs/common';

/** The rooms a socket can be in. */
export const roomForUser = (userId: string): string => `user:${userId}`;
export const OPS_ROOM = 'ops';

/**
 * What the service needs from Socket.IO, narrow enough to fake in a spec.
 *
 * `disconnectSockets` is optional because it is a Socket.IO 4 method and the
 * fakes in the specs predate it: a narrow interface that a fake must implement
 * in full is a narrow interface that makes every spec change when one caller
 * needs one more method. The caller checks for it and says so when it is
 * absent.
 */
export interface SocketBroadcaster {
  to(room: string): { emit(event: string, payload: unknown): void };
  in?(room: string): { disconnectSockets(close?: boolean): void };
}

/**
 * Sends something to a member's own devices, or to the administrators watching
 * the operations screen.
 *
 * Rooms rather than sockets, because a member has several devices and a nudge
 * that reached only the one that happened to be connected first would leave the
 * others stale until they next polled.
 *
 * Every emit is best-effort. A socket that has gone away is the ordinary case,
 * not an error: the phone works offline and re-syncs, so a failed nudge costs a
 * delay, never data.
 */
@Injectable()
export class NudgeService {
  private readonly logger = new Logger(NudgeService.name);
  #server: SocketBroadcaster | null = null;

  attach(server: SocketBroadcaster): void {
    this.#server = server;
  }

  emit(userId: string, event: string, payload: unknown): void {
    this.send(roomForUser(userId), event, payload);
  }

  emitToOps(event: string, payload: unknown): void {
    this.send(OPS_ROOM, event, payload);
  }

  /**
   * Closes every socket a member has open.
   *
   * FR-022: when access is withdrawn, live connections are closed and nothing
   * further is answered. The socket authenticated in the handshake and a JWT
   * cannot be revoked mid-flight — that is what makes it cheap to verify — so
   * without this a banned member keeps a working chat until their access token
   * expires, which is up to fifteen minutes of a coach answering somebody who
   * has been shut out.
   *
   * A frame is sent first, then the close. A client that is merely disconnected
   * reconnects in a loop with the same token; one that has been told why signs
   * out. The same reasoning as `token_expired`.
   */
  disconnect(userId: string, reason: string): void {
    if (!this.#server) return;
    const room = roomForUser(userId);
    try {
      this.#server.to(room).emit('auth.revoked', { code: reason });
      const closable = this.#server.in?.(room);
      if (!closable) {
        // A fake without the method, or a Socket.IO older than 4. Worth a line
        // in the log rather than silence: the member's sockets are still open.
        this.logger.warn(
          `cannot close sockets for ${userId}: the broadcaster has no in()`,
        );
        return;
      }
      closable.disconnectSockets(true);
      this.logger.log(`closed every socket for ${userId} (${reason})`);
    } catch (error) {
      this.logger.warn(
        `could not close sockets for ${userId}: ${(error as Error).message}`,
      );
    }
  }

  private send(room: string, event: string, payload: unknown): void {
    if (!this.#server) {
      // The worker has no socket server. Its heartbeats still call this, and
      // that is not a failure — nobody is watching from inside the worker.
      return;
    }
    try {
      this.#server.to(room).emit(event, payload);
    } catch (error) {
      this.logger.debug(`nudge to ${room} did not reach anyone: ${(error as Error).message}`);
    }
  }

  get attached(): boolean {
    return this.#server !== null;
  }
}

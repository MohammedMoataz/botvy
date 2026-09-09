import { Injectable, Logger } from '@nestjs/common';

/** The rooms a socket can be in. */
export const roomForUser = (userId: string): string => `user:${userId}`;
export const OPS_ROOM = 'ops';

/** What the service needs from Socket.IO, narrow enough to fake in a spec. */
export interface SocketBroadcaster {
  to(room: string): { emit(event: string, payload: unknown): void };
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

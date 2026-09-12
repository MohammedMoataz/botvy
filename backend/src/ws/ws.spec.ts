import { describe, expect, it } from 'vitest';
import { NudgeService, OPS_ROOM, roomForUser, type SocketBroadcaster } from './nudge.service.js';
import { DateScalar, DateTimeScalar } from '../graphql/scalars.js';

function recordingServer() {
  const sent: Array<{ room: string; event: string; payload: unknown }> = [];
  const server: SocketBroadcaster = {
    to(room) {
      return {
        emit(event, payload) {
          sent.push({ room, event, payload });
        },
      };
    },
  };
  return { server, sent };
}

describe('nudges', () => {
  it('reaches every device a member has, by room rather than by socket', () => {
    const { server, sent } = recordingServer();
    const nudge = new NudgeService();
    nudge.attach(server);

    nudge.emit('user-1', 'sync.nudge', { entities: ['tasks'] });

    expect(sent).toEqual([
      { room: roomForUser('user-1'), event: 'sync.nudge', payload: { entities: ['tasks'] } },
    ]);
  });

  it('keeps members apart', () => {
    expect(roomForUser('user-1')).not.toBe(roomForUser('user-2'));
  });

  it('sends operations events to the ops room, not to a member', () => {
    const { server, sent } = recordingServer();
    const nudge = new NudgeService();
    nudge.attach(server);

    nudge.emitToOps('ops.heartbeat', { job: 'outbox.relay' });

    expect(sent[0]?.room).toBe(OPS_ROOM);
  });

  /**
   * The worker has no socket server, and its heartbeats still call this. That
   * is not a failure — nobody is watching from inside the worker.
   */
  it('is a silent no-op with no server attached', () => {
    const nudge = new NudgeService();

    expect(nudge.attached).toBe(false);
    expect(() => nudge.emitToOps('ops.heartbeat', {})).not.toThrow();
  });

  /** A socket that has gone away is the ordinary case, not an error. */
  it('swallows a failure to deliver', () => {
    const nudge = new NudgeService();
    nudge.attach({
      to() {
        return {
          emit() {
            throw new Error('socket closed');
          },
        };
      },
    });

    expect(() => nudge.emit('user-1', 'sync.nudge', {})).not.toThrow();
  });
});

/**
 * `disconnect`: the one door that stays open after access is withdrawn.
 *
 * The socket authenticates in the handshake — that is what makes it cheap to
 * verify, no per-message check — so a socket outlives any decision made after
 * it opened, and a JWT cannot be revoked mid-flight either. Without this a
 * banned member keeps a working chat until their access token expires, which is
 * up to fifteen minutes of the coach answering somebody who has been shut out.
 */
describe('closing a member’s sockets', () => {
  /** A broadcaster that records both halves: what was said, and what was cut. */
  function closableServer() {
    const sent: Array<{ room: string; event: string; payload: unknown }> = [];
    const closed: Array<{ room: string; close: boolean | undefined }> = [];
    const server: SocketBroadcaster = {
      to(room) {
        return {
          emit(event, payload) {
            sent.push({ room, event, payload });
          },
        };
      },
      in(room) {
        return {
          disconnectSockets(close) {
            closed.push({ room, close });
          },
        };
      },
    };
    return { server, sent, closed };
  }

  /**
   * The frame goes first, then the close. That order is the whole difference
   * between a client that signs out and a client that reconnects in a loop with
   * the same dead token — a socket that is merely dropped looks exactly like a
   * flaky network, so the reason has to arrive before the connection does not
   * exist any more. The same reasoning as `token_expired`.
   */
  it('says why, then closes, to the member’s own room', () => {
    const { server, sent, closed } = closableServer();
    const nudge = new NudgeService();
    nudge.attach(server);

    nudge.disconnect('user-1', 'banned');

    expect(sent).toEqual([
      { room: roomForUser('user-1'), event: 'auth.revoked', payload: { code: 'banned' } },
    ]);
    // `true` closes the underlying connection rather than just leaving the
    // rooms, which is what makes the client reconnect-and-fail rather than sit
    // there with a socket that answers nothing.
    expect(closed).toEqual([{ room: roomForUser('user-1'), close: true }]);
  });

  /**
   * A broadcaster with no `in()` is logged, not thrown.
   *
   * `disconnectSockets` is a Socket.IO 4 method and the interface marks it
   * optional, so the absent case is real — an older server, or a fake in a spec
   * that predates it. Throwing here would take down the event handler that
   * reacted to `identity.UserBanned`, and because that runs through the relay
   * the failure would be retried for ever while the ban itself had already been
   * applied. The member's sockets stay open, which is why it is a warning rather
   * than silence.
   */
  it('logs rather than throwing when the broadcaster cannot close anything', () => {
    const { server, sent } = recordingServer();
    const nudge = new NudgeService();
    nudge.attach(server);

    expect(() => nudge.disconnect('user-1', 'banned')).not.toThrow();
    // The member was still told, which is the half that could be delivered.
    expect(sent.map((frame) => frame.event)).toEqual(['auth.revoked']);
  });

  /** No server at all — the worker's ordinary case — is a silent no-op. */
  it('is a no-op with no server attached', () => {
    const nudge = new NudgeService();

    expect(() => nudge.disconnect('user-1', 'banned')).not.toThrow();
  });

  /** A broadcaster that throws is swallowed too: a gone socket is not an error. */
  it('swallows a broadcaster that throws', () => {
    const nudge = new NudgeService();
    nudge.attach({
      to() {
        return {
          emit() {
            throw new Error('server closed');
          },
        };
      },
    });

    expect(() => nudge.disconnect('user-1', 'banned')).not.toThrow();
  });
});

describe('graphql scalars', () => {
  it('serialises an instant as UTC', () => {
    expect(DateTimeScalar.serialize(new Date('2026-09-07T15:00:00.000Z'))).toBe(
      '2026-09-07T15:00:00.000Z',
    );
  });

  it('refuses something that is not an instant', () => {
    expect(() => DateTimeScalar.serialize(42)).toThrow();
  });

  /**
   * A calendar date is not an instant. Answering "which day" with "which
   * moment" is how a plan for Tuesday shows up on Monday evening for anyone
   * west of the server.
   */
  it('keeps a calendar date as a date', () => {
    expect(DateScalar.serialize('2026-09-07')).toBe('2026-09-07');
    expect(() => DateScalar.serialize('2026-09-07T00:00:00Z')).toThrow();
    expect(() => DateScalar.parseValue('yesterday')).toThrow();
  });
});

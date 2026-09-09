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

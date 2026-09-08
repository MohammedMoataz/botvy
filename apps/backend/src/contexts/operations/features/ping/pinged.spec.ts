import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { PINGED_SEEN_LIMIT, PingedHandler } from './pinged.handler.js';

function pinged(eventId: string): DomainEvent {
  return {
    eventId,
    name: 'operations.Pinged',
    context: 'operations',
    aggregate: { type: 'ping', id: 'p-1' },
    userId: 'user-1',
    occurredAt: new Date(),
    payload: { clientId: 'c-1' },
    schemaVersion: 1,
  };
}

function recordingHeartbeat() {
  const stamps: Array<{ job: string; ok: boolean }> = [];
  return {
    stamps,
    async stamp(job: string, ok: boolean) {
      stamps.push({ job, ok });
    },
  };
}

describe('worker ping handler', () => {
  it('stamps the ping heartbeat, which is what makes the path observable', async () => {
    const heartbeat = recordingHeartbeat();

    expect(await new PingedHandler(heartbeat).handle(pinged('e-1'))).toBe('stamped');
    expect(heartbeat.stamps).toEqual([{ job: 'ping', ok: true }]);
  });

  /**
   * Delivery is at-least-once, so this genuinely sees the same event twice —
   * on a relay restart, and on a retried webhook. A repeat is the contract
   * working, not failing.
   */
  it('ignores a repeat of the same event', async () => {
    const heartbeat = recordingHeartbeat();
    const handler = new PingedHandler(heartbeat);

    expect(await handler.handle(pinged('e-1'))).toBe('stamped');
    expect(await handler.handle(pinged('e-1'))).toBe('already-seen');
    expect(heartbeat.stamps).toHaveLength(1);
  });

  it('handles a genuinely different event', async () => {
    const heartbeat = recordingHeartbeat();
    const handler = new PingedHandler(heartbeat);

    await handler.handle(pinged('e-1'));
    await handler.handle(pinged('e-2'));

    expect(heartbeat.stamps).toHaveLength(2);
    expect(handler.seenCount).toBe(2);
  });

  /**
   * The set used to be bounded by a `forget()` that nothing but this spec ever
   * called, so a long-running worker kept every event id it had ever seen. The
   * cap is what bounds it now; the outbox row is the durable record of
   * delivery, so starting over only shortens the window in which a repeat is
   * free.
   */
  it('starts the seen set over rather than growing for ever', async () => {
    const handler = new PingedHandler(recordingHeartbeat());
    for (let i = 0; i < PINGED_SEEN_LIMIT; i += 1) await handler.handle(pinged(`e-${i}`));
    expect(handler.seenCount).toBe(PINGED_SEEN_LIMIT);

    await handler.handle(pinged('one-too-many'));

    expect(handler.seenCount).toBe(1);
  });
});

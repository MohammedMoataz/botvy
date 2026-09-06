import { describe, expect, it } from 'vitest';
import {
  IdentityOutboxRepository,
  type PendingIdentityEvent,
} from '../../contexts/identity/domain/identity-outbox.repository.js';
import { contextOf, type DomainEvent } from '../cqrs/domain-event.js';
import { BACKOFF_LADDER_MS, nextAttemptAfter } from './backoff.js';
import {
  IdentityOutboxForwarder,
  toDomainEvent,
  type OutboxUpsert,
} from './identity-outbox-forwarder.js';
import { WebhookFanout, signPayload, type HttpPost } from './webhook-fanout.js';

function pendingRow(overrides: Partial<PendingIdentityEvent> = {}): PendingIdentityEvent {
  return {
    id: 'evt-1',
    name: 'identity.UserRegistered',
    aggregate: { type: 'user', id: 'user-1' },
    userId: 'user-1',
    payload: { email: 'a@b.test' },
    schemaVersion: 1,
    occurredAt: new Date('2026-09-06T10:00:00.000Z'),
    ...overrides,
  };
}

/** A PostgreSQL side that remembers what was marked, so a crash can be staged. */
class FakeIdentityOutbox extends IdentityOutboxRepository {
  forwardedIds: string[] = [];
  constructor(public rows: PendingIdentityEvent[] = []) {
    super();
  }
  async append(): Promise<void> {}
  async listPending(limit: number): Promise<PendingIdentityEvent[]> {
    return this.rows
      .filter((row) => !this.forwardedIds.includes(row.id))
      .slice(0, limit);
  }
  async markForwarded(ids: string[]): Promise<void> {
    this.forwardedIds.push(...ids);
  }
}

/** A Mongo side that upserts by event id, the way the real collection's unique index does. */
class FakeMongoOutbox implements OutboxUpsert {
  readonly byId = new Map<string, DomainEvent>();
  upsertCalls = 0;
  failNext = false;

  async upsertByEventId(event: DomainEvent): Promise<void> {
    this.upsertCalls += 1;
    if (this.failNext) {
      this.failNext = false;
      throw new Error('mongo unavailable');
    }
    this.byId.set(event.eventId, event);
  }
}

describe('event envelope', () => {
  it('derives context from the name, so the two can never disagree', () => {
    expect(contextOf('identity.UserRegistered')).toBe('identity');
    expect(contextOf('operations.Pinged')).toBe('operations');
  });

  it('refuses a name that is not <context>.<Event>', () => {
    expect(() => contextOf('Pinged')).toThrow(/context/);
    expect(() => contextOf('.Pinged')).toThrow();
  });
});

describe('identity outbox forwarder', () => {
  it('carries a pending row across and marks it forwarded', async () => {
    const postgres = new FakeIdentityOutbox([pendingRow()]);
    const mongo = new FakeMongoOutbox();

    const moved = await new IdentityOutboxForwarder(postgres, mongo).forwardOnce();

    expect(moved).toBe(1);
    expect(mongo.byId.get('evt-1')).toMatchObject({
      name: 'identity.UserRegistered',
      context: 'identity',
      schemaVersion: 1,
    });
    expect(postgres.forwardedIds).toEqual(['evt-1']);
  });

  it("fills the Mongo row's context from the event name", () => {
    expect(toDomainEvent(pendingRow({ name: 'identity.PasswordChanged' }))).toMatchObject({
      name: 'identity.PasswordChanged',
      context: 'identity',
    });
  });

  /**
   * The failure this whole table exists to prevent. Writing to Mongo after the
   * Postgres commit is at-most-once: a crash in the gap loses the event with
   * nothing left to say it was owed.
   */
  it('loses nothing when the forward fails after the Postgres commit', async () => {
    const postgres = new FakeIdentityOutbox([pendingRow()]);
    const mongo = new FakeMongoOutbox();
    mongo.failNext = true;
    const forwarder = new IdentityOutboxForwarder(postgres, mongo);

    await expect(forwarder.forwardOnce()).rejects.toThrow('mongo unavailable');
    expect(postgres.forwardedIds).toEqual([]);

    // The next pass finds the row still pending and carries it.
    await expect(forwarder.forwardOnce()).resolves.toBe(1);
    expect(mongo.byId.has('evt-1')).toBe(true);
  });

  it('is a no-op on a second pass once everything is forwarded', async () => {
    const postgres = new FakeIdentityOutbox([pendingRow(), pendingRow({ id: 'evt-2' })]);
    const mongo = new FakeMongoOutbox();
    const forwarder = new IdentityOutboxForwarder(postgres, mongo);

    expect(await forwarder.forwardOnce()).toBe(2);
    expect(await forwarder.forwardOnce()).toBe(0);
    expect(mongo.upsertCalls).toBe(2);
  });

  /** Delivery is at-least-once; the same id upserting twice must stay one row. */
  it('a repeated event id upserts rather than duplicating', async () => {
    const mongo = new FakeMongoOutbox();
    const row = pendingRow();

    await mongo.upsertByEventId(toDomainEvent(row));
    await mongo.upsertByEventId(toDomainEvent(row));

    expect(mongo.byId.size).toBe(1);
  });
});

describe('retry ladder', () => {
  const now = new Date('2026-09-06T12:00:00.000Z');

  it('climbs one minute, five, thirty, two hours', () => {
    const delays = [1, 2, 3, 4].map((attempts) => {
      const next = nextAttemptAfter(attempts, now);
      return next.at!.getTime() - now.getTime();
    });

    expect(delays).toEqual([...BACKOFF_LADDER_MS]);
  });

  it('parks once the ladder runs out, rather than retrying for ever', () => {
    const next = nextAttemptAfter(BACKOFF_LADDER_MS.length + 1, now);

    expect(next).toEqual({ at: null, parked: true });
  });
});

describe('webhook fanout', () => {
  const event: DomainEvent = {
    eventId: 'evt-9',
    name: 'operations.Pinged',
    context: 'operations',
    aggregate: { type: 'ping', id: 'ping-1' },
    userId: 'user-1',
    occurredAt: new Date('2026-09-06T10:00:00.000Z'),
    payload: { clientId: 'c-1' },
    schemaVersion: 1,
  };

  const subscriptions = [
    { event: 'operations.Pinged', url: 'http://n8n:5678/webhook/botvy/pinged', enabled: true },
    { event: 'operations.Pinged', url: 'http://n8n:5678/webhook/disabled', enabled: false },
    { event: 'identity.UserRegistered', url: 'http://n8n:5678/webhook/other', enabled: true },
  ];

  function recordingPost(): { post: HttpPost; calls: Array<{ url: string; headers: Record<string, string>; body: string }> } {
    const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    return {
      calls,
      post: async (url, body, headers) => {
        calls.push({ url, body, headers });
        return { ok: true, status: 200 };
      },
    };
  }

  it('delivers only to enabled subscriptions for that event', async () => {
    const { post, calls } = recordingPost();

    const outcomes = await new WebhookFanout('a-secret', post).deliver(event, subscriptions);

    expect(calls.map((call) => call.url)).toEqual(['http://n8n:5678/webhook/botvy/pinged']);
    expect(outcomes).toEqual([
      { url: 'http://n8n:5678/webhook/botvy/pinged', ok: true, status: 200 },
    ]);
  });

  /**
   * The subscriber is what makes an effect happen once. It can only do that if
   * every delivery names the event, including a retry of one already sent.
   */
  it('carries the event id and a signature the receiver can verify', async () => {
    const { post, calls } = recordingPost();

    await new WebhookFanout('a-secret', post).deliver(event, subscriptions);

    const headers = calls[0]!.headers;
    expect(headers['x-botvy-event']).toBe('operations.Pinged');
    expect(headers['x-botvy-event-id']).toBe('evt-9');
    expect(headers['x-botvy-signature']).toBe(signPayload('a-secret', calls[0]!.body));
  });

  it('signs with the secret, so another secret does not verify', () => {
    const body = JSON.stringify(event);

    expect(signPayload('a-secret', body)).not.toBe(signPayload('another-secret', body));
    expect(signPayload('a-secret', body)).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('reports a refusing endpoint as failed rather than throwing', async () => {
    const post: HttpPost = async () => ({ ok: false, status: 500 });

    const outcomes = await new WebhookFanout('a-secret', post).deliver(event, subscriptions);

    expect(outcomes[0]).toMatchObject({ ok: false, status: 500 });
  });

  it('reports an unreachable endpoint as failed rather than throwing', async () => {
    const post: HttpPost = async () => {
      throw new Error('ECONNREFUSED');
    };

    const outcomes = await new WebhookFanout('a-secret', post).deliver(event, subscriptions);

    expect(outcomes[0]).toMatchObject({ ok: false, error: 'ECONNREFUSED' });
  });
});

import { describe, expect, it } from 'vitest';
import type { Principal } from '../auth/principal.js';
import { AggregateRoot } from '../persistence/ports/aggregate-root.js';
import { contextOf } from './domain-event.js';
import { isUuid, newId } from './ids.js';
import {
  IdempotencyStore,
  idempotencyId,
  readIdempotencyKey,
  type IdempotencyRecord,
} from './idempotency.js';

class InMemoryIdempotency extends IdempotencyStore {
  readonly rows = new Map<string, IdempotencyRecord>();
  async find(id: string): Promise<IdempotencyRecord | null> {
    return this.rows.get(id) ?? null;
  }
  async remember(record: IdempotencyRecord): Promise<void> {
    this.rows.set(record.id, record);
  }
}

const alice: Principal = { kind: 'user', id: 'user-a', role: 'user' };
const bob: Principal = { kind: 'user', id: 'user-b', role: 'user' };

describe('idempotency keys', () => {
  it('reads the header, ignoring surrounding space and empty values', () => {
    expect(readIdempotencyKey({ 'idempotency-key': ' abc ' })).toBe('abc');
    expect(readIdempotencyKey({ 'idempotency-key': '   ' })).toBeNull();
    expect(readIdempotencyKey({})).toBeNull();
    expect(readIdempotencyKey(undefined)).toBeNull();
  });

  /**
   * The rule the composite key exists for: one member's replayed request must
   * never be able to return another member's answer.
   */
  it('scopes the key by principal, so the same key from two members is two records', async () => {
    const store = new InMemoryIdempotency();
    await store.remember({
      id: idempotencyId(alice, 'same-key'),
      route: 'POST /api/v1/ping',
      status: 200,
      response: { id: 'alice-ping' },
      createdAt: new Date(),
    });

    expect(await store.find(idempotencyId(alice, 'same-key'))).not.toBeNull();
    expect(await store.find(idempotencyId(bob, 'same-key'))).toBeNull();
  });

  it('separates a machine caller from a member holding the same key', () => {
    const service: Principal = { kind: 'service', id: 'svc-1', name: 'n8n', scopes: [] };

    expect(idempotencyId(alice, 'k')).not.toBe(idempotencyId(service, 'k'));
  });

  it('replays the first answer for a repeat', async () => {
    const store = new InMemoryIdempotency();
    const id = idempotencyId(alice, 'k');
    const first = { id: 'ping-1', updatedAt: new Date('2026-09-06T10:00:00Z') };

    await store.remember({ id, route: 'POST /api/v1/ping', status: 200, response: first, createdAt: new Date() });

    expect((await store.find(id))?.response).toEqual(first);
  });
});

describe('client-minted ids', () => {
  it('mints a valid uuid', () => {
    const id = newId();
    expect(isUuid(id)).toBe(true);
  });

  /** v7 sorts by creation time, so an index on the id doubles as a chronological one. */
  it('sorts by creation time', async () => {
    const first = newId();
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = newId();

    expect(first < second).toBe(true);
  });
});

class Thing extends AggregateRoot<string> {
  constructor(
    readonly id: string,
    readonly userId: string,
  ) {
    super();
  }
  doSomething(): void {
    this.raise('operations.Pinged', 'thing', { note: 'hello' });
  }
}

describe('aggregate events', () => {
  it('derives the event context from its name', () => {
    const thing = new Thing('t-1', 'user-1');
    thing.doSomething();

    expect(thing.pendingEvents[0]).toMatchObject({
      name: 'operations.Pinged',
      context: contextOf('operations.Pinged'),
      aggregate: { type: 'thing', id: 't-1' },
      userId: 'user-1',
      schemaVersion: 1,
    });
  });

  /** Pulled exactly once: the repository takes them inside the transaction. */
  it('hands events over once and then has none', () => {
    const thing = new Thing('t-1', 'user-1');
    thing.doSomething();

    expect(thing.pullEvents()).toHaveLength(1);
    expect(thing.pullEvents()).toHaveLength(0);
  });

  it('gives every event its own id', () => {
    const thing = new Thing('t-1', 'user-1');
    thing.doSomething();
    thing.doSomething();

    const [first, second] = thing.pullEvents();
    expect(first!.eventId).not.toBe(second!.eventId);
  });
});

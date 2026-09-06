import { beforeEach, describe, expect, it } from 'vitest';
import type { Principal } from '../../../../shared/auth/principal.js';
import { InMemoryUnitOfWork } from '../../../../shared/persistence/memory/in-memory-unit-of-work.js';
import { InMemoryPingRepository } from '../../infrastructure/in-memory-ping.repository.js';
import { PingHandler } from './ping.handler.js';

const alice: Principal = { kind: 'user', id: 'user-a', role: 'user' };
const bob: Principal = { kind: 'user', id: 'user-b', role: 'user' };

describe('ping slice', () => {
  let uow: InMemoryUnitOfWork;
  let pings: InMemoryPingRepository;
  let handler: PingHandler;

  beforeEach(() => {
    uow = new InMemoryUnitOfWork();
    pings = new InMemoryPingRepository(uow);
    handler = new PingHandler(uow, pings);
  });

  it('creates a ping and raises exactly one event', async () => {
    const ack = await handler.handle({ principal: alice, clientId: 'c-1' });

    expect(ack.id).toBeTruthy();
    expect(ack.updatedAt).toBeInstanceOf(Date);
    expect(uow.events.map((event) => event.name)).toEqual(['operations.Pinged']);
    expect(uow.events[0]).toMatchObject({
      context: 'operations',
      userId: 'user-a',
      aggregate: { type: 'ping' },
    });
  });

  /**
   * The phone creates rows offline and flushes them later, so a dropped
   * connection means a retry. It must not become a second ping, and it must not
   * look like a different outcome either.
   */
  it('is a no-op on a repeat of the same client id, and answers the same id', async () => {
    const first = await handler.handle({ principal: alice, clientId: 'c-1' });
    const second = await handler.handle({ principal: alice, clientId: 'c-1' });

    expect(second.id).toBe(first.id);
    expect(pings.all()).toHaveLength(1);
  });

  it('raises no second event for a repeat', async () => {
    await handler.handle({ principal: alice, clientId: 'c-1' });
    await handler.handle({ principal: alice, clientId: 'c-1' });

    expect(uow.events).toHaveLength(1);
  });

  it('treats a new client id as a new ping', async () => {
    const first = await handler.handle({ principal: alice, clientId: 'c-1' });
    const second = await handler.handle({ principal: alice, clientId: 'c-2' });

    expect(second.id).not.toBe(first.id);
    expect(pings.all()).toHaveLength(2);
    expect(uow.events).toHaveLength(2);
  });

  /**
   * Client ids are scoped per member. One account's ids must never mask
   * another's — that was a real bug in v1 before the index was scoped.
   */
  it('keeps the same client id from two members apart', async () => {
    const hers = await handler.handle({ principal: alice, clientId: 'shared' });
    const his = await handler.handle({ principal: bob, clientId: 'shared' });

    expect(his.id).not.toBe(hers.id);
    expect(pings.all()).toHaveLength(2);
  });

  it('answers the blueprint ack shape, not a view', async () => {
    const ack = await handler.handle({ principal: alice, clientId: 'c-1' });

    expect(Object.keys(ack).sort()).toEqual(['id', 'updatedAt']);
  });

  it('mints ids that sort by creation time', async () => {
    const first = await handler.handle({ principal: alice, clientId: 'c-1' });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await handler.handle({ principal: alice, clientId: 'c-2' });

    expect(first.id < second.id).toBe(true);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import type { DomainEvent } from '../cqrs/domain-event.js';
import { OutboxRelay, type RelayStore } from './outbox-relay.js';
import { WebhookFanout, type HttpPost, type WebhookSubscription } from './webhook-fanout.js';

function event(id: string, name = 'operations.Pinged'): DomainEvent {
  return {
    eventId: id,
    name,
    context: name.split('.')[0]!,
    aggregate: { type: 'ping', id: `agg-${id}` },
    userId: 'user-1',
    occurredAt: new Date('2026-09-07T10:00:00.000Z'),
    payload: {},
    schemaVersion: 1,
  };
}

/** A store that remembers what the relay did to it, and can be told to fail. */
class FakeRelayStore implements RelayStore {
  pending: DomainEvent[] = [];
  streamed: Array<{ event: DomainEvent; token: unknown }> = [];
  delivered: string[] = [];
  failed: Array<{ eventId: string; error: string; nextAttemptAt: Date | null }> = [];
  savedTokens: unknown[] = [];
  resumeToken: unknown = null;

  async drain(limit: number): Promise<DomainEvent[]> {
    const batch = this.pending.slice(0, limit);
    this.pending = this.pending.slice(limit);
    return batch;
  }
  async markDelivered(eventId: string): Promise<void> {
    this.delivered.push(eventId);
  }
  async markFailed(eventId: string, error: string, nextAttemptAt: Date | null): Promise<void> {
    this.failed.push({ eventId, error, nextAttemptAt });
  }
  async loadResumeToken(): Promise<unknown | null> {
    return this.resumeToken;
  }
  async saveResumeToken(token: unknown): Promise<void> {
    this.savedTokens.push(token);
  }
  async *watch(resumeToken: unknown): AsyncGenerator<{ event: DomainEvent; token: unknown }> {
    this.resumeToken = resumeToken;
    for (const item of this.streamed) yield item;
  }
}

const subscriptions: WebhookSubscription[] = [
  { event: 'operations.Pinged', url: 'http://n8n:5678/webhook/botvy/pinged', enabled: true },
];

function relayWith(store: FakeRelayStore, post: HttpPost, published: DomainEvent[] = []) {
  const beats: Array<{ ok: boolean; error?: string }> = [];
  const relay = new OutboxRelay({
    store,
    fanout: new WebhookFanout('a-secret', post),
    async subscriptions() {
      return subscriptions;
    },
    async publish(e) {
      published.push(e);
    },
    async heartbeat(ok, error) {
      beats.push(error === undefined ? { ok } : { ok, error });
    },
  });
  return { relay, beats, published };
}

const deliveringPost: HttpPost = async () => ({ ok: true, status: 200 });

describe('outbox relay', () => {
  let store: FakeRelayStore;

  beforeEach(() => {
    store = new FakeRelayStore();
  });

  /**
   * The reason the events sit in a table rather than on an event bus: a relay
   * that only watched would deliver nothing that happened while it was down.
   */
  it('delivers the backlog that built up while it was stopped', async () => {
    store.pending = [event('e1'), event('e2')];
    const { relay, published } = relayWith(store, deliveringPost);

    expect(await relay.drainBacklog()).toBe(2);
    expect(store.delivered).toEqual(['e1', 'e2']);
    expect(published.map((e) => e.eventId)).toEqual(['e1', 'e2']);
  });

  it('publishes in process before it reaches for the network', async () => {
    const order: string[] = [];
    const post: HttpPost = async () => {
      order.push('webhook');
      return { ok: true, status: 200 };
    };
    const published: DomainEvent[] = [];
    const { relay } = relayWith(
      store,
      post,
      new Proxy(published, {
        get(target, prop) {
          if (prop === 'push') {
            return (...args: DomainEvent[]) => {
              order.push('in-process');
              return Array.prototype.push.apply(target, args);
            };
          }
          return Reflect.get(target, prop);
        },
      }),
    );

    await relay.deliver(event('e1'));

    expect(order).toEqual(['in-process', 'webhook']);
  });

  it('resumes from the stored token rather than replaying the stream', async () => {
    store.resumeToken = { _data: 'saved' };
    store.streamed = [{ event: event('e1'), token: { _data: 'next' } }];
    const { relay } = relayWith(store, deliveringPost);

    await relay.run();

    expect(store.savedTokens).toEqual([{ _data: 'next' }]);
  });

  /** Saving before delivering and then crashing would skip the event entirely. */
  it('saves the resume token only after the event was delivered', async () => {
    store.streamed = [{ event: event('e1'), token: { _data: 'next' } }];
    const { relay } = relayWith(store, deliveringPost);

    await relay.run();

    expect(store.delivered).toEqual(['e1']);
    expect(store.savedTokens).toHaveLength(1);
  });

  it('marks a failing webhook for retry with a backoff, not as delivered', async () => {
    store.pending = [event('e1')];
    const refusing: HttpPost = async () => ({ ok: false, status: 500 });
    const { relay } = relayWith(store, refusing);

    expect(await relay.drainBacklog()).toBe(0);
    expect(store.delivered).toEqual([]);
    expect(store.failed[0]).toMatchObject({ eventId: 'e1' });
    expect(store.failed[0]?.nextAttemptAt).toBeInstanceOf(Date);
  });

  /**
   * A failing subscription is a delivery problem, not a dead relay: the loop is
   * still running and must not report itself as broken, or every webhook
   * outage would look like an outage of the platform.
   */
  it('stays healthy when a subscription fails but the loop is fine', async () => {
    store.pending = [event('e1')];
    const refusing: HttpPost = async () => ({ ok: false, status: 500 });
    const { relay, beats } = relayWith(store, refusing);

    await relay.drainBacklog();

    expect(beats.every((beat) => beat.ok)).toBe(true);
  });

  it('reports itself unhealthy when its own delivery throws', async () => {
    store.pending = [event('e1')];
    const relay = new OutboxRelay({
      store,
      fanout: new WebhookFanout('s', deliveringPost),
      async subscriptions() {
        return subscriptions;
      },
      async publish() {
        throw new Error('handler exploded');
      },
      async heartbeat() {},
    });

    expect(await relay.deliver(event('e1'))).toBe(false);
    expect(store.failed[0]?.error).toBe('handler exploded');
  });

  it('records when the loop last ran, for the worker health check', async () => {
    const { relay } = relayWith(store, deliveringPost);
    const before = relay.lastLoopAt();

    await relay.drainBacklog();

    expect(relay.lastLoopAt().getTime()).toBeGreaterThan(before.getTime());
  });

  it('delivers nothing for an event no subscription matches, and still marks it done', async () => {
    store.pending = [event('e1', 'identity.UserRegistered')];
    const { relay } = relayWith(store, deliveringPost);

    expect(await relay.drainBacklog()).toBe(1);
    expect(store.delivered).toEqual(['e1']);
  });
});

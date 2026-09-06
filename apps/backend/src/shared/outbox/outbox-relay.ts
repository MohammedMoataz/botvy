import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../cqrs/domain-event.js';
import { nextAttemptAfter } from './backoff.js';
import type { WebhookFanout, WebhookSubscription } from './webhook-fanout.js';

/** What the relay needs from the store, narrow enough to fake in a spec. */
export interface RelayStore {
  /** Undelivered events, oldest first. */
  drain(limit: number): Promise<DomainEvent[]>;
  markDelivered(eventId: string): Promise<void>;
  markFailed(eventId: string, error: string, nextAttemptAt: Date | null): Promise<void>;
  loadResumeToken(): Promise<unknown | null>;
  saveResumeToken(token: unknown): Promise<void>;
  /** Yields inserts as they happen, resuming from the token when there is one. */
  watch(resumeToken: unknown | null): AsyncGenerator<{ event: DomainEvent; token: unknown }>;
}

export interface RelayDeps {
  store: RelayStore;
  fanout: WebhookFanout;
  subscriptions(): Promise<WebhookSubscription[]>;
  /** In-process delivery — the CQRS event bus in production. */
  publish(event: DomainEvent): Promise<void>;
  heartbeat(ok: boolean, error?: string): Promise<void>;
}

export const RELAY_DRAIN_BATCH = 200;

/**
 * Carries events out of the outbox: first to in-process handlers, then to
 * whichever automation subscriptions match, then marks the row delivered.
 *
 * It drains what is already waiting before it starts watching. A relay that
 * only watched would deliver nothing that happened while it was down, and the
 * whole reason the events are in a table rather than an event bus is that the
 * table survives the process.
 *
 * The resume token is saved after each event, so a restart continues rather
 * than replaying from the beginning of the stream. Delivery is at-least-once by
 * design: consumers are idempotent on the event id, and every webhook carries
 * that id so a subscriber can discard a repeat.
 */
@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name);
  #stopped = false;
  #lastLoopAt = new Date(0);

  constructor(private readonly deps: RelayDeps) {}

  /** For `/healthz`: has the loop run recently? */
  lastLoopAt(): Date {
    return this.#lastLoopAt;
  }

  stop(): void {
    this.#stopped = true;
  }

  /** Everything already waiting. Returns how many it delivered. */
  async drainBacklog(): Promise<number> {
    const pending = await this.deps.store.drain(RELAY_DRAIN_BATCH);
    let delivered = 0;
    for (const event of pending) {
      if (await this.deliver(event)) delivered += 1;
    }
    this.#lastLoopAt = new Date();
    return delivered;
  }

  /** Drains, then follows the stream until stopped. */
  async run(): Promise<void> {
    this.#stopped = false;
    try {
      await this.drainBacklog();
      const token = await this.deps.store.loadResumeToken();

      for await (const { event, token: next } of this.deps.store.watch(token)) {
        if (this.#stopped) break;
        await this.deliver(event);
        // Saved after delivery. Saving first and crashing would skip the event.
        await this.deps.store.saveResumeToken(next);
        this.#lastLoopAt = new Date();
      }
      await this.deps.heartbeat(true);
    } catch (error) {
      await this.deps.heartbeat(false, (error as Error).message);
      throw error;
    }
  }

  /** One event. Returns whether it came through cleanly. */
  async deliver(event: DomainEvent): Promise<boolean> {
    try {
      // In-process handlers first: they are the platform's own reactions, and a
      // failing webhook must not stop them.
      await this.deps.publish(event);

      const subscriptions = await this.deps.subscriptions();
      const outcomes = await this.deps.fanout.deliver(event, subscriptions);
      const failed = outcomes.filter((outcome) => !outcome.ok);

      if (failed.length > 0) {
        const attempts = 1;
        const next = nextAttemptAfter(attempts);
        const reason = failed.map((outcome) => `${outcome.url}: ${outcome.error}`).join('; ');
        await this.deps.store.markFailed(event.eventId, reason, next.at);
        if (next.parked) {
          this.logger.error(
            `${event.name} (${event.eventId}) parked after exhausting the retry ladder: ${reason}`,
          );
        }
        await this.deps.heartbeat(true);
        return false;
      }

      await this.deps.store.markDelivered(event.eventId);
      await this.deps.heartbeat(true);
      return true;
    } catch (error) {
      const message = (error as Error).message;
      await this.deps.store.markFailed(event.eventId, message, nextAttemptAfter(1).at);
      await this.deps.heartbeat(false, message);
      return false;
    }
  }
}

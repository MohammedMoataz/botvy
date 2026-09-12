import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../cqrs/domain-event.js';
import { nextAttemptAfter } from './backoff.js';
import type { WebhookFanout, WebhookSubscription } from './webhook-fanout.js';

/** What the relay needs from the store, narrow enough to fake in a spec. */
export interface RelayStore {
  /** Undelivered events whose retry time has come, oldest first. */
  drain(limit: number): Promise<DomainEvent[]>;
  markDelivered(eventId: string): Promise<void>;
  /**
   * Records the failure and returns how many attempts have now failed,
   * *including* this one.
   *
   * The count comes back because the caller owns the retry ladder: the relay
   * decides when to try again, the store only remembers. Returning nothing —
   * which this used to do — left the relay guessing, and it guessed 1 every
   * time, so every retry was scheduled a minute out and the rest of the ladder
   * was unreachable.
   */
  recordFailure(eventId: string, error: string): Promise<number>;
  /** When the next attempt is due; `null` parks the event for a person to look at. */
  scheduleRetry(eventId: string, at: Date | null): Promise<void>;
  /**
   * Whether this event has already been delivered.
   *
   * Asked before every delivery, because the backlog drain and the change
   * stream overlap: the drain sends what accumulated during an outage, then the
   * stream resumes from a token that predates it and yields the same rows
   * again. Without this, every restart re-delivered its whole downtime window,
   * and the in-memory idempotency guards on the consuming side are empty at
   * exactly that moment.
   */
  isDelivered(eventId: string): Promise<boolean>;
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
      // The drain and the stream overlap after a restart, so the same row can
      // arrive twice within seconds. Delivery is at-least-once by design, but
      // systematically re-sending a whole downtime window is not the same thing
      // as tolerating the occasional repeat.
      if (await this.deps.store.isDelivered(event.eventId)) return true;

      // In-process handlers first: they are the platform's own reactions, and a
      // failing webhook must not stop them.
      await this.deps.publish(event);

      const subscriptions = await this.deps.subscriptions();
      const outcomes = await this.deps.fanout.deliver(event, subscriptions);
      const failed = outcomes.filter((outcome) => !outcome.ok);

      if (failed.length > 0) {
        const reason = failed.map((outcome) => `${outcome.url}: ${outcome.error}`).join('; ');
        await this.recordAndSchedule(event, reason);
        // Still `ok`, deliberately. This heartbeat answers "is the relay
        // looping", and it is — a subscriber nobody can reach is a delivery
        // problem, and reporting it here would make every n8n hiccup look like
        // an outage of the platform. An exhausted ladder is logged as an error
        // by `recordAndSchedule`; a health signal of its own belongs with the
        // admin overview's ingestion view, not to this counter.
        await this.deps.heartbeat(true);
        return false;
      }

      await this.deps.store.markDelivered(event.eventId);
      await this.deps.heartbeat(true);
      return true;
    } catch (error) {
      const message = (error as Error).message;
      await this.recordAndSchedule(event, message);
      await this.deps.heartbeat(false, message);
      return false;
    }
  }

  /** Counts the failure, then puts the next attempt where the ladder says. */
  private async recordAndSchedule(event: DomainEvent, reason: string): Promise<void> {
    const attempts = await this.deps.store.recordFailure(event.eventId, reason);
    const next = nextAttemptAfter(attempts);
    await this.deps.store.scheduleRetry(event.eventId, next.at);

    if (next.parked) {
      this.logger.error(
        `${event.name} (${event.eventId}) parked after ${attempts} attempts: ${reason}`,
      );
    }
  }
}

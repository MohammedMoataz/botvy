import type { DomainEvent } from '../../../shared/cqrs/domain-event.js';

/** One row awaiting the hop from PostgreSQL into the Mongo outbox. */
export interface PendingIdentityEvent {
  id: string;
  name: string;
  aggregate: { type: string; id: string };
  userId: string | null;
  payload: unknown;
  schemaVersion: number;
  occurredAt: Date;
}

/**
 * Identity's own outbox. It exists because Identity lives on PostgreSQL and the
 * relay reads Mongo: an event written to Mongo after the Postgres commit would
 * be at-most-once, and a crash in the gap loses it with nothing left to say it
 * was owed. Writing it here, in the same transaction as the change, makes the
 * hop at-least-once, which is what every consumer already tolerates.
 *
 * The worker's forwarder is the only thing that reads it, and it does so
 * through this port — the single place the worker touches Identity's store.
 */
export abstract class IdentityOutboxRepository {
  /** Appends within the caller's transaction. */
  abstract append(events: DomainEvent[]): Promise<void>;

  /** Oldest first, so a consumer sees a member's events in the order they happened. */
  abstract listPending(limit: number): Promise<PendingIdentityEvent[]>;

  abstract markForwarded(ids: string[]): Promise<void>;
}

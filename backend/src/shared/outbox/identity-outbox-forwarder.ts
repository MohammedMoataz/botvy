import { Injectable, Logger } from '@nestjs/common';
import {
  IdentityOutboxRepository,
  type PendingIdentityEvent,
} from '../../contexts/identity/domain/identity-outbox.repository.js';
import { contextOf, type DomainEvent } from '../cqrs/domain-event.js';

/**
 * How often the forwarder looks. A constant: it is an implementation detail of
 * at-least-once delivery, and retuning it changes nothing an operator can
 * observe (plan, "Constants and keys").
 */
export const FORWARDER_POLL_MS = 2_000;
export const FORWARDER_BATCH = 200;

/** What the forwarder needs from the Mongo side, kept narrow so it can be faked. */
export interface OutboxUpsert {
  /** Upsert by `eventId`, so a redelivered row is a no-op rather than a duplicate. */
  upsertByEventId(event: DomainEvent): Promise<void>;
}

export const OUTBOX_UPSERT = Symbol('OUTBOX_UPSERT');

/**
 * Carries Identity's events from PostgreSQL into the Mongo outbox, where the
 * relay can see them.
 *
 * This exists because Identity is the one context on another store. Writing its
 * events straight to Mongo after the Postgres commit would be at-most-once: a
 * crash in the gap loses the event and leaves nothing behind to say it was owed.
 * The table plus this loop makes the hop at-least-once instead, which every
 * consumer already tolerates because it is idempotent on `eventId`.
 *
 * It is also the only place the worker touches Identity's store, and it does so
 * through Identity's own port rather than a Prisma client of its own.
 */
@Injectable()
export class IdentityOutboxForwarder {
  private readonly logger = new Logger(IdentityOutboxForwarder.name);
  #timer: NodeJS.Timeout | null = null;
  #running = false;

  constructor(
    private readonly pending: IdentityOutboxRepository,
    private readonly outbox: OutboxUpsert,
  ) {}

  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => {
      void this.forwardOnce().catch((error) => {
        this.logger.error(`identity outbox forward failed: ${(error as Error).message}`);
      });
    }, FORWARDER_POLL_MS);
    this.#timer.unref?.();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  /** One pass. Returns how many rows it carried across. */
  async forwardOnce(): Promise<number> {
    if (this.#running) return 0;
    this.#running = true;
    try {
      const rows = await this.pending.listPending(FORWARDER_BATCH);
      if (rows.length === 0) return 0;

      const forwarded: string[] = [];
      for (const row of rows) {
        await this.outbox.upsertByEventId(toDomainEvent(row));
        forwarded.push(row.id);
      }

      // Marked only after the upsert. Marking first and crashing would lose the
      // event; marking after and crashing merely repeats an upsert that is a
      // no-op by `eventId`.
      await this.pending.markForwarded(forwarded);
      return forwarded.length;
    } finally {
      this.#running = false;
    }
  }
}

/**
 * The row carries no `context` column and needs none: every name is
 * `<context>.<Event>`, so it is derived here. One source for a value cannot
 * drift from itself; two columns holding the same fact can.
 */
export function toDomainEvent(row: PendingIdentityEvent): DomainEvent {
  return {
    eventId: row.id,
    name: row.name,
    context: contextOf(row.name),
    aggregate: row.aggregate,
    userId: row.userId,
    occurredAt: row.occurredAt,
    payload: row.payload,
    schemaVersion: row.schemaVersion,
  };
}

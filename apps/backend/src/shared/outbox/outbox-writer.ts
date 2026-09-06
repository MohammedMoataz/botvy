import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import type { DomainEvent } from '../cqrs/domain-event.js';
import { MongoUnitOfWork } from '../persistence/mongo/mongo-unit-of-work.js';
import type { OutboxInsert } from '../persistence/mongo/mongo-repository.base.js';

/**
 * Appends events to the outbox, in whatever session is in force.
 *
 * Most events get there through a repository's `save`, which is the point: an
 * event and the change that caused it are written together or not at all. This
 * exists for the few writers that have no aggregate of their own — the settings
 * service announcing a change, and the forwarder carrying Identity's events
 * across.
 */
@Injectable()
export class OutboxWriter {
  constructor(private readonly outbox: Model<OutboxInsert>) {}

  async append(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    const session = MongoUnitOfWork.currentSession();
    await this.outbox.insertMany(toRows(events), {
      session: session ?? undefined,
      ordered: true,
    });
  }

  /**
   * Upsert by event id. The forwarder uses this: delivery from PostgreSQL is
   * at-least-once, so the same event can arrive twice and must stay one row.
   */
  async upsertByEventId(event: DomainEvent): Promise<void> {
    const [row] = toRows([event]);
    await this.outbox.updateOne(
      { eventId: event.eventId },
      { $setOnInsert: row },
      { upsert: true },
    );
  }
}

export function toRows(events: DomainEvent[]): OutboxInsert[] {
  return events.map((event) => ({
    eventId: event.eventId,
    name: event.name,
    context: event.context,
    aggregate: event.aggregate,
    userId: event.userId,
    payload: event.payload,
    schemaVersion: event.schemaVersion,
    occurredAt: event.occurredAt,
    deliveredAt: null,
    attempts: 0,
  }));
}

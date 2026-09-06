import type { Model } from 'mongoose';
import type { DomainEvent } from '../../cqrs/domain-event.js';
import type { AggregateRoot } from '../ports/aggregate-root.js';
import { StaleWriteError } from '../ports/errors.js';
import type { Mapper } from '../ports/mapper.js';
import { Repository } from '../ports/repository.js';
import { MongoUnitOfWork } from './mongo-unit-of-work.js';

/** The outbox document this base appends to, in the same session as the save. */
export interface OutboxInsert {
  eventId: string;
  name: string;
  context: string;
  aggregate: { type: string; id: string };
  userId: string | null;
  payload: unknown;
  schemaVersion: number;
  occurredAt: Date;
  deliveredAt: null;
  attempts: number;
}

/**
 * The Mongo half of the repository port. Two things make it worth having a base
 * at all rather than writing each adapter by hand:
 *
 * 1. **The outbox is written in the same session as the document.** Publishing
 *    to the event bus after `save()` returns loses the event if the process
 *    dies in between, and the change is already committed by then.
 * 2. **The optimistic check.** A save whose `updatedAt` is older than the stored
 *    row is a lost update; the filter refuses it rather than overwriting.
 */
export abstract class MongoRepositoryBase<T extends AggregateRoot, Doc> extends Repository<T> {
  protected abstract readonly model: Model<Doc>;
  protected abstract readonly outbox: Model<OutboxInsert>;
  protected abstract readonly mapper: Mapper<T, Doc>;

  async findById(userId: string, id: string): Promise<T | null> {
    const session = MongoUnitOfWork.currentSession();
    const doc = await this.model
      .findOne({ _id: id, userId } as Record<string, unknown>)
      .session(session)
      .lean<Doc>()
      .exec();
    return doc ? this.mapper.toDomain(doc) : null;
  }

  async save(aggregate: T): Promise<void> {
    const session = MongoUnitOfWork.currentSession();
    const doc = this.mapper.toPersistence(aggregate);
    const events = aggregate.pullEvents();

    const result = await this.model
      .updateOne(
        {
          _id: aggregate.id,
          // Either the row is new, or the copy we hold is not older than it.
          $or: [{ updatedAt: { $lte: aggregate.updatedAt } }, { updatedAt: { $exists: false } }],
        } as Record<string, unknown>,
        { $set: doc as Record<string, unknown> },
        { upsert: true, session: session ?? undefined },
      )
      .exec();

    if (result.matchedCount === 0 && result.upsertedCount === 0) {
      throw new StaleWriteError(String(aggregate.id));
    }

    await this.appendToOutbox(events);
  }

  async remove(aggregate: T): Promise<void> {
    const session = MongoUnitOfWork.currentSession();
    const events = aggregate.pullEvents();
    await this.model
      .deleteOne({ _id: aggregate.id, userId: aggregate.userId } as Record<string, unknown>)
      .session(session)
      .exec();
    await this.appendToOutbox(events);
  }

  /**
   * In the same session as the change above. Outside a transaction it still
   * writes, so a repository used from a one-off script is not silently
   * event-less — but every handler path runs inside `UnitOfWork.run`.
   */
  protected async appendToOutbox(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    const session = MongoUnitOfWork.currentSession();
    const rows: OutboxInsert[] = events.map((event) => ({
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
    await this.outbox.insertMany(rows, { session: session ?? undefined, ordered: true });
  }
}

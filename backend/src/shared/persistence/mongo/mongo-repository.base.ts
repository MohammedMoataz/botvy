import type { Model } from 'mongoose';
import type { DomainEvent } from '../../cqrs/domain-event.js';
import type { AggregateRoot } from '../ports/aggregate-root.js';
import { ForeignRowError, StaleWriteError } from '../ports/errors.js';
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
export abstract class MongoRepositoryBase<
  T extends AggregateRoot,
  Doc,
> extends Repository<T> {
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

    /*
     * A field the mapper set to `undefined` is *removed*, not skipped.
     *
     * `$set` writes what it is given and leaves everything else alone, so a
     * mapper that omits a key cannot clear a stored value — it can only fail
     * to overwrite it. That is a subtle difference and it cost a real bug:
     * `Label.tombstone()` drops `nameLower` so the member can reuse the name,
     * the mapper duly omitted the key, and the old value stayed in the
     * document. The partial unique index went on holding the name, so
     * "delete a label and create it again" was refused with a duplicate-name
     * error. Every in-memory spec passed, because there is no `$set` there.
     *
     * So `undefined` now means "unset this", which is the same meaning it has
     * in the domain — `Label.nameLower` returns `undefined` for a tombstone
     * precisely to say the field should not exist.
     */
    const fields = doc as Record<string, unknown>;
    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) unset[key] = '';
      else set[key] = value;
    }

    const update: Record<string, unknown> = { $set: set };
    // Mongo refuses an empty `$unset`, so it is only included when it has work.
    if (Object.keys(unset).length > 0) update.$unset = unset;

    /*
     * `userId` is in the filter, and its absence was a live defect from P2.
     *
     * This is an **upsert**, because a client mints the id and an offline
     * create arrives as a save of a row the server has never seen. Without
     * `userId` in the filter, a `/sync` push naming a row that belongs to
     * *another member* matched it — and `$set` then wrote this aggregate's
     * fields over theirs, `userId` included, silently transferring the row.
     * Reachable for every client-minted-id entity since P2: tasks, labels,
     * reminders, and conversations now. The scoped read cannot see the row, so
     * the adapter has no way to tell that push from an ordinary create;
     * nothing but the unguessability of a UUIDv7 stood in the way, and that is
     * not an access control.
     *
     * With it in the filter, that push matches nothing, tries to insert, and
     * hits the `_id` primary key — which is caught below and reported as a
     * refusal the member's client can act on rather than a 500.
     */
    let result;
    try {
      result = await this.model
        .updateOne(
          {
            _id: aggregate.id,
            userId: aggregate.userId,
            // Either the row is new, or the copy we hold is not older than it.
            $or: [
              { updatedAt: { $lte: aggregate.updatedAt } },
              { updatedAt: { $exists: false } },
            ],
          } as Record<string, unknown>,
          update,
          { upsert: true, session: session ?? undefined },
        )
        .exec();
    } catch (error) {
      /*
       * A duplicate `_id` means the row exists under somebody else's `userId`.
       *
       * 11000 is Mongo's duplicate-key code, and this is the *only* uniqueness
       * an upsert on `_id` can violate: any other unique index on the
       * collection is over fields `$set` is writing, and a conflict there
       * would have been raised by the matched branch too. Narrowed on the code
       * rather than caught broadly, so a genuine write failure still surfaces.
       */
      if ((error as { code?: number }).code === 11_000) {
        throw new ForeignRowError(String(aggregate.id));
      }
      throw error;
    }

    if (result.matchedCount === 0 && result.upsertedCount === 0) {
      throw new StaleWriteError(String(aggregate.id));
    }

    await this.appendToOutbox(events);
  }

  async remove(aggregate: T): Promise<void> {
    const session = MongoUnitOfWork.currentSession();
    const events = aggregate.pullEvents();
    await this.model
      .deleteOne({ _id: aggregate.id, userId: aggregate.userId } as Record<
        string,
        unknown
      >)
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
    await this.outbox.insertMany(rows, {
      session: session ?? undefined,
      ordered: true,
    });
  }
}

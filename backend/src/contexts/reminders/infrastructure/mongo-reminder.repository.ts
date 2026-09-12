import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import {
  MongoRepositoryBase,
  type OutboxInsert,
} from '../../../shared/persistence/mongo/mongo-repository.base.js';
import {
  decodeCursor,
  encodeCursor,
  mongoAfter,
  mongoSort,
  positionOf,
  type SortKey,
} from '../../../shared/persistence/keyset-cursor.js';
import { MongoUnitOfWork } from '../../../shared/persistence/mongo/mongo-unit-of-work.js';
import type { Mapper } from '../../../shared/persistence/ports/mapper.js';
import { Reminder, type ReminderState } from '../domain/reminder.aggregate.js';
import {
  ReminderRepository,
  type ReminderListFilter,
  type ReminderPage,
  type ReminderReadRepository,
  type ReminderView,
} from '../domain/reminder.repository.js';

export interface ReminderDoc extends Omit<ReminderState, 'id'> {
  _id: string;
  schemaVersion: number;
}

const mapper: Mapper<Reminder, ReminderDoc> = {
  toDomain(doc) {
    return Reminder.rehydrate({
      id: doc._id,
      userId: doc.userId,
      title: doc.title,
      remindAt: doc.remindAt,
      leadTimes: doc.leadTimes ?? [],
      status: doc.status ?? 'active',
      snoozedUntil: doc.snoozedUntil ?? null,
      source: doc.source ?? 'app',
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      deletedAt: doc.deletedAt ?? null,
    });
  },
  toPersistence(reminder) {
    return {
      _id: reminder.id,
      userId: reminder.userId,
      title: reminder.title,
      remindAt: reminder.remindAt,
      leadTimes: reminder.leadTimes,
      status: reminder.status,
      snoozedUntil: reminder.snoozedUntil,
      source: reminder.source,
      createdAt: reminder.createdAt,
      updatedAt: reminder.updatedAt,
      deletedAt: reminder.deletedAt,
      schemaVersion: reminder.schemaVersion,
    };
  },
};

@Injectable()
export class MongoReminderRepository extends ReminderRepository {
  readonly #inner: InnerReminderRepository;

  constructor(
    private readonly model: Model<ReminderDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerReminderRepository(model, outbox);
  }

  async findById(userId: string, id: string): Promise<Reminder | null> {
    return this.#inner.findById(userId, id);
  }

  async save(reminder: Reminder): Promise<void> {
    await this.#inner.save(reminder);
  }

  async remove(reminder: Reminder): Promise<void> {
    await this.#inner.remove(reminder);
  }

  /** Tombstones included — on a delta they are the only way a deletion travels. */
  async pullSince(userId: string, since: Date | null): Promise<Reminder[]> {
    const filter: Record<string, unknown> = { userId };
    if (since) filter.updatedAt = { $gt: since };
    const docs = await this.model
      .find(filter)
      .sort({ updatedAt: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<ReminderDoc[]>()
      .exec();
    return docs.map((doc) => mapper.toDomain(doc));
  }

  async purgeTombstonesBefore(before: Date, userId?: string): Promise<number> {
    const filter: Record<string, unknown> = {
      deletedAt: { $ne: null, $lt: before },
    };
    if (userId) filter.userId = userId;
    const result = await this.model
      .deleteMany(filter, {
        session: MongoUnitOfWork.currentSession() ?? undefined,
      })
      .exec();
    return result.deletedCount;
  }

  async removeAllFor(userId: string): Promise<number> {
    const result = await this.model
      .deleteMany(
        { userId },
        { session: MongoUnitOfWork.currentSession() ?? undefined },
      )
      .exec();
    return result.deletedCount;
  }
}

class InnerReminderRepository extends MongoRepositoryBase<
  Reminder,
  ReminderDoc
> {
  protected readonly mapper = mapper;

  constructor(
    protected readonly model: Model<ReminderDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

/**
 * The read side.
 *
 * The lists split on the *effective* moment — a snooze overrides the original —
 * and Mongo has no expression index over "the first non-null of two fields", so
 * the split is expressed as a two-branch `$or` rather than a computed field.
 * That is the honest trade: adding a stored `effectiveAt` would need every
 * snooze, edit and reactivation to maintain it, and one that forgot would put a
 * reminder in the wrong list with nothing to say why.
 */
@Injectable()
export class MongoReminderReadRepository implements ReminderReadRepository {
  constructor(private readonly model: Model<ReminderDoc>) {}

  async page(
    userId: string,
    filter: ReminderListFilter,
  ): Promise<ReminderPage> {
    const keys = REMINDER_SORT_KEYS[filter.view];
    const query: Record<string, unknown> = {
      userId,
      ...reminderPredicateFor(filter),
    };

    // A position in *this* order. The Done view used to sort `updatedAt: -1`
    // while its cursor filtered `updatedAt > x` — a descending order walked
    // with an ascending filter, which returns the wrong page every time.
    if (filter.cursor) {
      const position = decodeCursor(filter.cursor);
      if (position) {
        const after = mongoAfter(keys, position);
        // The upcoming and overdue predicates already use `$or` for the
        // effective-moment split, so the two are combined under `$and` rather
        // than one silently replacing the other — which is exactly what a
        // second assignment to `$or` would do.
        const existing = query.$or;
        if (existing) {
          delete query.$or;
          query.$and = [{ $or: existing }, after];
        } else {
          Object.assign(query, after);
        }
      }
    }

    const docs = await this.model
      .find(query)
      .sort(mongoSort(keys))
      .limit(filter.limit + 1)
      .session(MongoUnitOfWork.currentSession())
      .lean<ReminderDoc[]>()
      .exec();

    const hasMore = docs.length > filter.limit;
    const page = hasMore ? docs.slice(0, filter.limit) : docs;
    const last = page.at(-1);

    return {
      nodes: page.map(toView),
      nextCursor:
        hasMore && last
          ? encodeCursor(
              positionOf(
                keys,
                last as unknown as Record<string, unknown>,
                last._id,
              ),
            )
          : null,
    };
  }

  async byId(userId: string, id: string): Promise<ReminderView | null> {
    const doc = await this.model
      .findOne({ userId, _id: id })
      .session(MongoUnitOfWork.currentSession())
      .lean<ReminderDoc>()
      .exec();
    return doc ? toView(doc) : null;
  }
}

/**
 * "The effective moment is on this side of `now`", as a filter.
 *
 * Two branches because the effective moment is `snoozedUntil` when there is
 * one and `remindAt` otherwise, and both halves have to be stated: a filter
 * that only tested `snoozedUntil` would hide every reminder that has never been
 * snoozed, whose field is null — which is nearly all of them. The same shape of
 * mistake as the phone's `pending_op != 'x'` bug, arriving in the other store.
 */
function effectiveAtIs(
  operator: '$gte' | '$lt',
  now: Date,
): Array<Record<string, unknown>> {
  return [
    { snoozedUntil: { $ne: null, [operator]: now } },
    { snoozedUntil: null, remindAt: { [operator]: now } },
  ];
}

/** The order each view is read in; `mongoSort` appends `_id` as the tiebreak. */
export const REMINDER_SORT_KEYS: Record<ReminderListFilter['view'], SortKey[]> =
  {
    upcoming: [{ field: 'remindAt', direction: 'asc' }],
    overdue: [{ field: 'remindAt', direction: 'asc' }],
    done: [{ field: 'updatedAt', direction: 'desc' }],
    deleted: [{ field: 'deletedAt', direction: 'desc' }],
  };

/**
 * What each view is, as a filter. Exported so the in-memory adapter applies it
 * rather than restating it in its own words.
 *
 * `done` carries cancelled reminders too: the member's question is "what have I
 * dealt with", and deciding against something is dealing with it — the row
 * still says which of the two it was.
 */
export function reminderPredicateFor(
  filter: ReminderListFilter,
): Record<string, unknown> {
  switch (filter.view) {
    case 'upcoming':
      return {
        deletedAt: null,
        status: 'active',
        $or: effectiveAtIs('$gte', filter.now),
      };
    case 'overdue':
      return {
        deletedAt: null,
        status: 'active',
        $or: effectiveAtIs('$lt', filter.now),
      };
    case 'done':
      return { deletedAt: null, status: { $in: ['done', 'cancelled'] } };
    case 'deleted':
      return { deletedAt: { $ne: null } };
  }
}

function toView(doc: ReminderDoc): ReminderView {
  const snoozedUntil = doc.snoozedUntil ?? null;
  return {
    id: doc._id,
    title: doc.title,
    remindAt: doc.remindAt,
    effectiveAt: snoozedUntil ?? doc.remindAt,
    leadTimes: doc.leadTimes ?? [],
    status: doc.status ?? 'active',
    snoozedUntil,
    source: doc.source ?? 'app',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt ?? null,
  };
}

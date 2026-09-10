import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import {
  MongoRepositoryBase,
  type OutboxInsert,
} from '../../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../../shared/persistence/mongo/mongo-unit-of-work.js';
import type { Mapper } from '../../../shared/persistence/ports/mapper.js';
import {
  Checkin,
  checkinId,
  type CheckinState,
} from '../domain/checkin.aggregate.js';
import {
  DailyPlan,
  planId,
  type DailyPlanState,
} from '../domain/daily-plan.aggregate.js';
import {
  RhythmState,
  type RhythmStateData,
} from '../domain/rhythm-state.aggregate.js';
import {
  CheckinRepository,
  DailyPlanRepository,
  RhythmStateRepository,
} from '../domain/rhythm.repositories.js';

/**
 * The rhythm's three collections, on MongoDB.
 *
 * Each adapter is the same two-part shape the rest of the codebase uses: a
 * public class implementing the context's own port, and a private `Inner`
 * subclass of `MongoRepositoryBase` that provides `findById`, `save` and
 * `remove`. The indirection exists because `MongoRepositoryBase` is what writes
 * the domain event into `identity_outbox`'s Mongo counterpart *in the same
 * session as the document* — publishing to the bus after `save()` returns loses
 * the event whenever the process dies in between, and by then the row is
 * already committed. The extra finders each port declares cannot go through the
 * base (its surface is one document at a time), so they read the model
 * directly, always joining `MongoUnitOfWork.currentSession()` so a read inside a
 * transaction sees that transaction's own writes.
 *
 * **`_id` is composed by the aggregate, not by the mapper.** A plan's id is
 * `"<userId>:<date>"` and a check-in's is the same; a rhythm state's is the
 * member's id alone. `DailyPlan`, `Checkin` and `RhythmState` all compute it in
 * their constructors, so every mapper here writes `_id: aggregate.id` and no
 * copy of the key format lives in this file. That is the whole reason the
 * evening touches are idempotent: two ticks that both decide the plan prompt is
 * due write the same `_id` twice, which upserts one document rather than
 * creating two.
 *
 * **Every schema declares `updatedAt`, and it has to.** `MongoRepositoryBase`
 * writes `updatedAt` on every save and filters its optimistic check on it, and
 * Mongoose runs `strict: true` — an upsert naming a path the schema does not
 * declare is rejected outright, with the handler's unit tests all green because
 * there is no schema in memory. `DailyPlanSchema`, `CheckinSchema` and
 * `RhythmStateSchema` were each checked for `updatedAt: { type: Date, required:
 * true }` before this file was trusted; a notification pipeline was dead for a
 * whole phase on exactly this, behind 38 passing unit tests.
 */

export interface DailyPlanDoc extends DailyPlanState {
  _id: string;
  schemaVersion: number;
}

export interface CheckinDoc extends CheckinState {
  _id: string;
  schemaVersion: number;
}

export interface RhythmStateDoc extends RhythmStateData {
  _id: string;
  schemaVersion: number;
}

/**
 * Nothing this mapper writes is ever `undefined`, and that is deliberate.
 *
 * `MongoRepositoryBase` reads `undefined` from a mapper as `$unset` — "remove
 * this path" — which is the right meaning for a field the domain deletes, such
 * as a label's `nameLower`. Nothing in the rhythm has that shape: an
 * unconfirmed plan has `confirmedAt: null`, not a missing `confirmedAt`, and the
 * difference matters because the phone's pull reads these fields positionally
 * and a missing key would arrive as `undefined` where it expects an explicit
 * "not yet". So every nullable field is mapped to `null` — cleared, not
 * removed.
 */
const planMapper: Mapper<DailyPlan, DailyPlanDoc> = {
  toDomain(doc) {
    return DailyPlan.rehydrate({
      userId: doc.userId,
      date: doc.date,
      status: doc.status ?? 'draft',
      autoConfirmed: doc.autoConfirmed ?? false,
      tasks: doc.tasks ?? [],
      // `?? []` and not `doc.meetings`: every plan written before P5 has no
      // such key, and the mapper is the only place that can turn a missing
      // array into an empty one before the aggregate reads it.
      meetings: doc.meetings ?? [],
      training: doc.training ?? null,
      workoutLine: doc.workoutLine ?? null,
      mealLine: doc.mealLine ?? null,
      promptedAt: doc.promptedAt ?? null,
      confirmedAt: doc.confirmedAt ?? null,
      summarisedAt: doc.summarisedAt ?? null,
      briefedAt: doc.briefedAt ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  },
  toPersistence(plan) {
    return {
      _id: plan.id,
      userId: plan.userId,
      date: plan.date,
      status: plan.status,
      autoConfirmed: plan.autoConfirmed,
      tasks: plan.tasks,
      meetings: plan.meetings,
      training: plan.training,
      workoutLine: plan.workoutLine,
      mealLine: plan.mealLine,
      promptedAt: plan.promptedAt,
      confirmedAt: plan.confirmedAt,
      summarisedAt: plan.summarisedAt,
      briefedAt: plan.briefedAt,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      schemaVersion: plan.schemaVersion,
    };
  },
};

const checkinMapper: Mapper<Checkin, CheckinDoc> = {
  toDomain(doc) {
    return Checkin.rehydrate({
      userId: doc.userId,
      date: doc.date,
      // `?? null` and not `?? 0`: a zero mood is a real answer — the worst day
      // a member can report — and collapsing absence onto it would tell the
      // streak arithmetic that somebody who said nothing said they were
      // miserable.
      mood: doc.mood ?? null,
      adhered: doc.adhered ?? null,
      note: doc.note ?? null,
      source: doc.source ?? 'app',
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  },
  toPersistence(checkin) {
    return {
      _id: checkin.id,
      userId: checkin.userId,
      date: checkin.date,
      mood: checkin.mood,
      adhered: checkin.adhered,
      note: checkin.note,
      source: checkin.source,
      createdAt: checkin.createdAt,
      updatedAt: checkin.updatedAt,
      schemaVersion: checkin.schemaVersion,
    };
  },
};

const stateMapper: Mapper<RhythmState, RhythmStateDoc> = {
  toDomain(doc) {
    return RhythmState.rehydrate({
      userId: doc.userId,
      lastPlanPromptDate: doc.lastPlanPromptDate ?? null,
      lastEndOfDayDate: doc.lastEndOfDayDate ?? null,
      lastMorningBriefingDate: doc.lastMorningBriefingDate ?? null,
      awaitingCheckin: doc.awaitingCheckin ?? false,
      awaitingSince: doc.awaitingSince ?? null,
      streak: doc.streak ?? { current: 0, best: 0, lastAdheredDate: null },
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  },
  toPersistence(state) {
    return {
      _id: state.id,
      userId: state.userId,
      lastPlanPromptDate: state.lastPlanPromptDate,
      lastEndOfDayDate: state.lastEndOfDayDate,
      lastMorningBriefingDate: state.lastMorningBriefingDate,
      awaitingCheckin: state.awaitingCheckin,
      awaitingSince: state.awaitingSince,
      streak: state.streak,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      schemaVersion: state.schemaVersion,
    };
  },
};

@Injectable()
export class MongoDailyPlanRepository extends DailyPlanRepository {
  readonly #inner: InnerDailyPlanRepository;

  constructor(
    private readonly model: Model<DailyPlanDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerDailyPlanRepository(model, outbox);
  }

  async findById(userId: string, id: string): Promise<DailyPlan | null> {
    return this.#inner.findById(userId, id);
  }

  async save(plan: DailyPlan): Promise<void> {
    await this.#inner.save(plan);
  }

  async remove(plan: DailyPlan): Promise<void> {
    await this.#inner.remove(plan);
  }

  /**
   * The date-shaped lookup, composed here so no handler holds a copy of the
   * key format. It goes through the base's `findById`, which filters on `_id`
   * *and* `userId` — so a caller that passed somebody else's date gets null
   * rather than somebody else's plan.
   */
  async forDate(userId: string, date: string): Promise<DailyPlan | null> {
    return this.#inner.findById(userId, planId(userId, date));
  }

  /**
   * Inclusive both ends, ordered by the local date ascending.
   *
   * String comparison on `YYYY-MM-DD` *is* chronological comparison, which is
   * the reason the date is stored that way rather than as a `Date`: a range
   * query and an ordering both come out right with no zone in the picture, and
   * the member's day is the member's day whatever the server thinks the hour
   * is.
   *
   * `date` alone is a total order here — `_id` is `"<userId>:<date>"`, so one
   * member cannot have two rows for one date — and the in-memory adapter sorts
   * on exactly the same single key. See the note on ordering in
   * `in-memory-rhythm.repositories.ts`.
   */
  async between(
    userId: string,
    from: string,
    to: string,
  ): Promise<DailyPlan[]> {
    const docs = await this.model
      .find({ userId, date: { $gte: from, $lte: to } })
      .sort({ date: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<DailyPlanDoc[]>()
      .exec();
    return docs.map((doc) => planMapper.toDomain(doc));
  }

  /**
   * The phone's pull. `null` means "everything", which is a first sync.
   *
   * Ordered `updatedAt` then `_id`. The tiebreak is not decoration: the evening
   * touch saves a plan and its state in one transaction, so two rows carrying
   * the same millisecond are ordinary here, and Mongo's order within a tie is
   * unspecified. A cursor advanced to the last row of an unspecified order can
   * skip a row it never saw. There are no tombstones to include because nothing
   * deletes a plan — the collection is one row per member per day, and a day
   * does not stop having happened.
   */
  async changedSince(userId: string, since: Date | null): Promise<DailyPlan[]> {
    const filter: Record<string, unknown> = { userId };
    if (since) filter.updatedAt = { $gt: since };
    const docs = await this.model
      .find(filter)
      .sort({ updatedAt: 1, _id: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<DailyPlanDoc[]>()
      .exec();
    return docs.map((doc) => planMapper.toDomain(doc));
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

class InnerDailyPlanRepository extends MongoRepositoryBase<
  DailyPlan,
  DailyPlanDoc
> {
  protected readonly mapper = planMapper;

  constructor(
    protected readonly model: Model<DailyPlanDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

@Injectable()
export class MongoCheckinRepository extends CheckinRepository {
  readonly #inner: InnerCheckinRepository;

  constructor(
    private readonly model: Model<CheckinDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerCheckinRepository(model, outbox);
  }

  async findById(userId: string, id: string): Promise<Checkin | null> {
    return this.#inner.findById(userId, id);
  }

  async save(checkin: Checkin): Promise<void> {
    await this.#inner.save(checkin);
  }

  async remove(checkin: Checkin): Promise<void> {
    await this.#inner.remove(checkin);
  }

  /**
   * One check-in per member per local date, which is what makes a reply in the
   * chat and a tap on the notification card the same row rather than two
   * competing accounts of the same day.
   */
  async forDate(userId: string, date: string): Promise<Checkin | null> {
    return this.#inner.findById(userId, checkinId(userId, date));
  }

  /** Same ordering rules as the plans; the week strip reads this. */
  async between(userId: string, from: string, to: string): Promise<Checkin[]> {
    const docs = await this.model
      .find({ userId, date: { $gte: from, $lte: to } })
      .sort({ date: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<CheckinDoc[]>()
      .exec();
    return docs.map((doc) => checkinMapper.toDomain(doc));
  }

  async changedSince(userId: string, since: Date | null): Promise<Checkin[]> {
    const filter: Record<string, unknown> = { userId };
    if (since) filter.updatedAt = { $gt: since };
    const docs = await this.model
      .find(filter)
      .sort({ updatedAt: 1, _id: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<CheckinDoc[]>()
      .exec();
    return docs.map((doc) => checkinMapper.toDomain(doc));
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

class InnerCheckinRepository extends MongoRepositoryBase<Checkin, CheckinDoc> {
  protected readonly mapper = checkinMapper;

  constructor(
    protected readonly model: Model<CheckinDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

@Injectable()
export class MongoRhythmStateRepository extends RhythmStateRepository {
  readonly #inner: InnerRhythmStateRepository;

  constructor(
    private readonly model: Model<RhythmStateDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerRhythmStateRepository(model, outbox);
  }

  async findById(userId: string, id: string): Promise<RhythmState | null> {
    return this.#inner.findById(userId, id);
  }

  async save(state: RhythmState): Promise<void> {
    await this.#inner.save(state);
  }

  async remove(state: RhythmState): Promise<void> {
    await this.#inner.remove(state);
  }

  /** `_id` and `userId` are the same value for this aggregate — one row each. */
  async find(userId: string): Promise<RhythmState | null> {
    return this.#inner.findById(userId, userId);
  }

  /**
   * The tick's own read, and the only one in the rhythm that crosses members —
   * hence no `userId` in the filter, which is the exception a reader of this
   * file should be able to see and not have to infer. The caller is a service
   * principal running a job, not a member reading their own rows.
   *
   * Keyset paging on `_id` ascending. An `after` cursor rather than a `skip`
   * because the tick *writes* while it pages: every member it touches gets a
   * claim date, which updates the row, and an offset window over a collection
   * being written to can shift under the cursor and skip somebody's evening
   * entirely. `_id` never changes, so the walk is stable however much the rows
   * move.
   *
   * `_id` is a member's uuid and is never null, so the null-first question that
   * an ascending index raises simply does not arise here — and the in-memory
   * adapter sorts the same single key with a plain string comparison, which
   * agrees with Mongo's byte ordering for the ASCII these ids are made of.
   */
  async page(after: string | null, limit: number): Promise<RhythmState[]> {
    const filter: Record<string, unknown> = {};
    if (after) filter._id = { $gt: after };
    const docs = await this.model
      .find(filter)
      .sort({ _id: 1 })
      .limit(limit)
      .session(MongoUnitOfWork.currentSession())
      .lean<RhythmStateDoc[]>()
      .exec();
    return docs.map((doc) => stateMapper.toDomain(doc));
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

class InnerRhythmStateRepository extends MongoRepositoryBase<
  RhythmState,
  RhythmStateDoc
> {
  protected readonly mapper = stateMapper;

  constructor(
    protected readonly model: Model<RhythmStateDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

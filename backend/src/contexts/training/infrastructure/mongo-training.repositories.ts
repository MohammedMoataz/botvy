import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import type { DomainEvent } from '../../../shared/cqrs/domain-event.js';
import {
  MongoRepositoryBase,
  type OutboxInsert,
} from '../../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../../shared/persistence/mongo/mongo-unit-of-work.js';
import { StaleWriteError } from '../../../shared/persistence/ports/errors.js';
import type { Mapper } from '../../../shared/persistence/ports/mapper.js';
import {
  AthleteProfile,
  type AthleteProfileState,
  type TrainingSlot,
} from '../domain/athlete-profile.aggregate.js';
import { Program, type ProgramState } from '../domain/program.aggregate.js';
import { Session, type SessionState } from '../domain/session.aggregate.js';
import type { Exercise, MediaRef } from '../domain/set-entry.js';
import {
  AthleteProfileRepository,
  ProgramRepository,
  SessionRepository,
  WorkoutRepository,
} from '../domain/training.repositories.js';
import { Workout, type WorkoutState } from '../domain/workout.aggregate.js';

/**
 * The profile's document has **no `id` and no `userId`**: `_id` is the member's
 * id and that is the whole of its identity (data-model §2.6). Every other
 * document here is the ordinary syncable shape — `_id` carries the aggregate's
 * client-minted id and `userId` says who owns it.
 */
export interface AthleteProfileDoc extends Omit<AthleteProfileState, 'userId'> {
  _id: string;
  schemaVersion: number;
}

export interface SessionDoc extends Omit<SessionState, 'id'> {
  _id: string;
  schemaVersion: number;
}

export interface ProgramDoc extends Omit<ProgramState, 'id'> {
  _id: string;
  schemaVersion: number;
}

export interface WorkoutDoc extends Omit<WorkoutState, 'id'> {
  _id: string;
  schemaVersion: number;
}

// --------------------------------------------------------------------- mappers

/**
 * Document to aggregate and back.
 *
 * `toDomain` upcasts by `schemaVersion`, which is what lets a document written
 * by an older build still be read: migrations only go forward, and a row that
 * has not been rewritten yet is upcast on read rather than left unreadable. At
 * version 1 there is nothing to upcast, so the `??` defaults below are doing
 * that job in advance — a field added in a later phase gets its default here
 * and every existing row keeps working.
 *
 * The array defaults are not decoration. Mongoose declares `exercises`, `sets`,
 * `mediaRefs`, `weeks`, `slots` and `tags` with `default: []`, but a document
 * written before a field existed comes back without it, and every aggregate
 * here spreads and `.map`s these arrays without asking. `?? []` is where that
 * is settled, once, rather than in each of the four aggregates.
 */
const athleteProfileMapper: Mapper<AthleteProfile, AthleteProfileDoc> = {
  toDomain(doc) {
    return AthleteProfile.rehydrate({
      // `_id` is the member's id; the aggregate's `id` getter returns `userId`
      // for exactly this reason. See the class note on `AthleteProfile`.
      userId: doc._id,
      sports: doc.sports ?? [],
      slots: (doc.slots ?? []).map(normaliseSlot),
      updatedAt: asDate(doc.updatedAt),
    });
  },
  toPersistence(profile) {
    return {
      _id: profile.userId,
      sports: profile.sports,
      slots: profile.slots,
      updatedAt: profile.updatedAt,
      schemaVersion: profile.schemaVersion,
    };
  },
};

const sessionMapper: Mapper<Session, SessionDoc> = {
  toDomain(doc) {
    return Session.rehydrate({
      id: doc._id,
      userId: doc.userId,
      plannedAt: asDate(doc.plannedAt),
      durationMin: doc.durationMin,
      sport: doc.sport,
      title: doc.title,
      focus: doc.focus ?? null,
      programId: doc.programId ?? null,
      weekIndex: doc.weekIndex ?? null,
      slotId: doc.slotId ?? null,
      suggestionId: doc.suggestionId ?? null,
      exercises: (doc.exercises ?? []).map(normaliseExercise),
      status: doc.status ?? 'planned',
      completedAt: doc.completedAt ? asDate(doc.completedAt) : null,
      notes: doc.notes ?? null,
      createdAt: asDate(doc.createdAt),
      updatedAt: asDate(doc.updatedAt),
      deletedAt: doc.deletedAt ? asDate(doc.deletedAt) : null,
    });
  },
  toPersistence(session) {
    return {
      _id: session.id,
      userId: session.userId,
      plannedAt: session.plannedAt,
      durationMin: session.durationMin,
      sport: session.sport,
      title: session.title,
      focus: session.focus,
      programId: session.programId,
      weekIndex: session.weekIndex,
      slotId: session.slotId,
      suggestionId: session.suggestionId,
      exercises: session.exercises,
      status: session.status,
      completedAt: session.completedAt,
      notes: session.notes,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      deletedAt: session.deletedAt,
      schemaVersion: session.schemaVersion,
    };
  },
};

const programMapper: Mapper<Program, ProgramDoc> = {
  toDomain(doc) {
    return Program.rehydrate({
      id: doc._id,
      userId: doc.userId,
      title: doc.title,
      sport: doc.sport,
      source: doc.source ?? 'user',
      sourceLinkIds: doc.sourceLinkIds ?? [],
      weeks: (doc.weeks ?? []).map((week) => ({
        index: week.index,
        sessions: (week.sessions ?? []).map((template) => ({
          templateId: template.templateId,
          weekday: template.weekday ?? null,
          title: template.title,
          focus: template.focus ?? null,
          exercises: (template.exercises ?? []).map((exercise) => ({
            name: exercise.name,
            notes: exercise.notes ?? null,
            mediaRefs: (exercise.mediaRefs ?? []).map(normaliseMediaRef),
            sets: exercise.sets ?? [],
          })),
        })),
      })),
      status: doc.status ?? 'active',
      // A local date string, never an instant — see `ProgramSchema`. It is left
      // exactly as stored: coercing it to a Date is what principle XI forbids.
      appliedStartDate: doc.appliedStartDate ?? null,
      createdAt: asDate(doc.createdAt),
      updatedAt: asDate(doc.updatedAt),
      deletedAt: doc.deletedAt ? asDate(doc.deletedAt) : null,
    });
  },
  toPersistence(program) {
    return {
      _id: program.id,
      userId: program.userId,
      title: program.title,
      sport: program.sport,
      source: program.source,
      sourceLinkIds: program.sourceLinkIds,
      weeks: program.weeks,
      status: program.status,
      appliedStartDate: program.appliedStartDate,
      createdAt: program.createdAt,
      updatedAt: program.updatedAt,
      deletedAt: program.deletedAt,
      schemaVersion: program.schemaVersion,
    };
  },
};

const workoutMapper: Mapper<Workout, WorkoutDoc> = {
  toDomain(doc) {
    return Workout.rehydrate({
      id: doc._id,
      userId: doc.userId,
      name: doc.name,
      sport: doc.sport,
      exercises: (doc.exercises ?? []).map(normaliseExercise),
      tags: doc.tags ?? [],
      createdAt: asDate(doc.createdAt),
      updatedAt: asDate(doc.updatedAt),
      deletedAt: doc.deletedAt ? asDate(doc.deletedAt) : null,
    });
  },
  toPersistence(workout) {
    return {
      _id: workout.id,
      userId: workout.userId,
      name: workout.name,
      sport: workout.sport,
      exercises: workout.exercises,
      tags: workout.tags,
      createdAt: workout.createdAt,
      updatedAt: workout.updatedAt,
      deletedAt: workout.deletedAt,
      schemaVersion: workout.schemaVersion,
    };
  },
};

function normaliseSlot(slot: TrainingSlot): TrainingSlot {
  return {
    id: slot.id,
    weekday: slot.weekday,
    start: slot.start,
    durationMin: slot.durationMin,
    sport: slot.sport,
    location: slot.location ?? null,
  };
}

/**
 * Both halves of an exercise present, `null` rather than `undefined` where the
 * domain says null.
 *
 * `notes` matters more than it looks: the aggregates compare field by field on
 * every edit, and `undefined !== null` — so a document whose notes were never
 * written would make an edit that changed nothing report `notes` as changed,
 * and raise a `SessionChanged` on a no-op. Meetings' `normaliseLocation` has
 * the same note for the same reason.
 */
function normaliseExercise(exercise: Exercise): Exercise {
  return {
    id: exercise.id,
    name: exercise.name,
    notes: exercise.notes ?? null,
    mediaRefs: (exercise.mediaRefs ?? []).map(normaliseMediaRef),
    sets: exercise.sets ?? [],
  };
}

function normaliseMediaRef(ref: MediaRef): MediaRef {
  return { type: ref.type, url: ref.url, caption: ref.caption ?? null };
}

/**
 * A date out of `lean()` is not reliably a `Date`, and `new Date(...)` on one
 * that already is is a copy rather than a failure — so coercing unconditionally
 * is cheaper than deciding. Planning's and Meetings' adapters say the same.
 */
function asDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

// ----------------------------------------------------------------- the profile

/**
 * The one collection in this context that does **not** go through
 * `MongoRepositoryBase`.
 *
 * The base's every filter is `{ _id, userId }`, and `athlete_profiles` has no
 * `userId` field: `_id` *is* the member's id (data-model §2.6, and
 * `AthleteProfile.id` returns `userId` to say so). So the base's `findById`
 * would match nothing and its upsert would insert a second document under a
 * `userId` path the schema does not declare — which Mongoose's `strict: true`
 * refuses outright, failing the whole write.
 *
 * Dropping the ownership half of that filter is safe here and nowhere else,
 * because **the id it filters on is the ownership**. There is no
 * `ForeignRowError` to raise: a member cannot name somebody else's profile
 * without naming their user id, and every caller gets the id from the
 * authenticated principal rather than from the request body. That is exactly
 * what is *not* true of a client-minted UUIDv7, which is why the base's
 * `userId` clause exists and why this is the only place it is left out.
 *
 * Everything else the base does is kept, and deliberately so:
 *
 *   - **The optimistic `updatedAt` filter.** Two devices editing the weekly
 *     timetable is ordinary, and a lost update there silently drops a training
 *     day. The refusal is the same `StaleWriteError`.
 *   - **The outbox, in the same session as the document.** `SportsChanged` and
 *     `SlotsChanged` both wake the materialiser; publishing after the write
 *     returned would lose them if the process died in between, and by then the
 *     change is committed. The row shape is the base's own — see
 *     `#outbox.publish` below — rather than a second copy of it here.
 */
@Injectable()
export class MongoAthleteProfileRepository extends AthleteProfileRepository {
  readonly #outbox: OutboxAppender;

  constructor(
    private readonly model: Model<AthleteProfileDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#outbox = new OutboxAppender(model, outbox);
  }

  /**
   * The port's `find`, and `Repository.findById` reaches the same lookup.
   *
   * They are one query because the two arguments are one value — the port's own
   * comment explains that `find(userId)` exists so nothing can be tempted to
   * pass a different id and an owner. `findById` is here because
   * `Repository<T>` declares it; it ignores `id` in favour of the owner rather
   * than the other way round, so a caller that got them out of step reads the
   * profile it is entitled to instead of somebody else's.
   */
  async find(userId: string): Promise<AthleteProfile | null> {
    const doc = await this.model
      .findOne({ _id: userId })
      .session(MongoUnitOfWork.currentSession())
      .lean<AthleteProfileDoc>()
      .exec();
    return doc ? athleteProfileMapper.toDomain(doc) : null;
  }

  async findById(
    userId: string,
    _profileId: string,
  ): Promise<AthleteProfile | null> {
    return this.find(userId);
  }

  async save(profile: AthleteProfile): Promise<void> {
    const session = MongoUnitOfWork.currentSession();
    const doc = athleteProfileMapper.toPersistence(profile);
    const events = profile.pullEvents();

    const result = await this.model
      .updateOne(
        {
          _id: profile.userId,
          // Either the row is new, or the copy we hold is not older than it.
          // The base's clause, verbatim, and for the base's reason.
          $or: [
            { updatedAt: { $lte: profile.updatedAt } },
            { updatedAt: { $exists: false } },
          ],
        },
        { $set: doc },
        { upsert: true, session: session ?? undefined },
      )
      .exec();

    if (result.matchedCount === 0 && result.upsertedCount === 0) {
      throw new StaleWriteError(profile.userId);
    }

    await this.#outbox.publish(events);
  }

  async remove(profile: AthleteProfile): Promise<void> {
    const events = profile.pullEvents();
    await this.model
      .deleteOne({ _id: profile.userId })
      .session(MongoUnitOfWork.currentSession())
      .exec();
    await this.#outbox.publish(events);
  }

  /**
   * Every member with at least one slot — the materialiser's input, unscoped
   * because "whose week is worth a pass" is a question about the collection
   * rather than about a member.
   *
   * `slots.0` rather than `slots: { $ne: [] }`: the `$ne` form also matches a
   * document with no `slots` field at all, since a missing field is not equal
   * to `[]` — so a row written before the field existed would be handed to the
   * materialiser as though it had a week. `$exists` on the first element is the
   * only spelling that means "this array has something in it".
   *
   * `distinct` answers it from the primary key without loading a document.
   */
  async memberIdsWithSlots(): Promise<string[]> {
    const ids: unknown[] = await this.model
      .distinct('_id', { 'slots.0': { $exists: true } })
      .session(MongoUnitOfWork.currentSession())
      .exec();
    return ids.map(String);
  }

  /**
   * The member's own profile, by id. There is exactly one, so the count is 0
   * or 1 — the signature is `removeAllFor` because every repository in the
   * product answers the purge with the same shape, and a special one here
   * would make `purge-on-deleted` branch on which collection it is holding.
   */
  async removeAllFor(userId: string): Promise<number> {
    const result = await this.model
      .deleteOne(
        { _id: userId },
        { session: MongoUnitOfWork.currentSession() ?? undefined },
      )
      .exec();
    return result.deletedCount;
  }
}

/**
 * The base class, held only for its `appendToOutbox`.
 *
 * The profile's reads and writes are written by hand above; the outbox row is
 * not, because there is exactly one right shape for it and a second copy is how
 * the two would come to disagree about, say, `attempts`. `appendToOutbox` is
 * `protected`, so a subclass is how it is reached — and this one never calls
 * `findById`, `save` or `remove`, which is why the mapper it is obliged to
 * declare is the real one rather than a stub.
 */
class OutboxAppender extends MongoRepositoryBase<
  AthleteProfile,
  AthleteProfileDoc
> {
  protected readonly mapper = athleteProfileMapper;

  constructor(
    protected readonly model: Model<AthleteProfileDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }

  async publish(events: DomainEvent[]): Promise<void> {
    await this.appendToOutbox(events);
  }
}

// ---------------------------------------------------------------- the sessions

@Injectable()
export class MongoSessionRepository extends SessionRepository {
  readonly #inner: InnerSessionRepository;

  constructor(
    private readonly model: Model<SessionDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerSessionRepository(model, outbox);
  }

  async findById(userId: string, id: string): Promise<Session | null> {
    return this.#inner.findById(userId, id);
  }

  async save(session: Session): Promise<void> {
    await this.#inner.save(session);
  }

  async remove(session: Session): Promise<void> {
    await this.#inner.remove(session);
  }

  /**
   * Tombstones included, and that is the contract rather than an oversight: the
   * client's delete sweep runs only on a full snapshot, so on a *delta* the only
   * way a deletion reaches the phone is as a tombstone row in the pull. Filter
   * them out here and a session deleted on one device stays for ever on every
   * other one.
   */
  async pullSince(userId: string, since: Date | null): Promise<Session[]> {
    const filter: Record<string, unknown> = { userId };
    if (since) filter.updatedAt = { $gt: since };
    return this.#read(filter, { updatedAt: 1 });
  }

  /**
   * The window read behind the week view, the agenda and the rhythm's draft.
   *
   * Live rows only — a tombstoned session is on nobody's calendar — but **every
   * status**, because a skipped session stays in the week (FR-005) and a
   * completed one is the record of the day. That is the difference from
   * Meetings' `forWindow`, which filters to `scheduled`: a meeting's outcome
   * removes it from the diary and a session's does not.
   *
   * A session is placed by its start, so the bounds are inclusive on
   * `plannedAt` and nothing is widened by its duration. Meetings pays for a day
   * of slack because a member's day view has to show the meeting they are
   * sitting in; the callers here window whole local days, where the only row
   * the slack would add is one that started yesterday and is still running —
   * and that row belongs to yesterday, which is where the member will look for
   * it.
   */
  async between(userId: string, from: Date, to: Date): Promise<Session[]> {
    return this.#read(
      { userId, deletedAt: null, plannedAt: { $gte: from, $lte: to } },
      { plannedAt: 1 },
    );
  }

  /** Soonest first, so a limit of one is the next practice. */
  async plannedAfter(
    userId: string,
    after: Date,
    limit: number,
  ): Promise<Session[]> {
    return this.#read(
      { userId, deletedAt: null, status: 'planned', plannedAt: { $gt: after } },
      { plannedAt: 1 },
      limit,
    );
  }

  /**
   * The materialiser's one read: which of the ids it computed are taken.
   *
   * One query for the whole fortnight rather than one per slot per day, which
   * is what makes the pass affordable — `slot-calendar.ts` explains why the ids
   * can be derived rather than looked up.
   *
   * **Tombstones are included**, and that is the answer to the question the
   * caller is actually asking. A deleted session still owns its `_id`, so a
   * materialiser told the id was free would upsert straight over the tombstone
   * and resurrect a session the member removed. "Which already exist" is a
   * question about the ids, not about the live rows.
   */
  async findMany(userId: string, ids: string[]): Promise<Session[]> {
    if (ids.length === 0) return [];
    return this.#read({ userId, _id: { $in: ids } }, { plannedAt: 1 });
  }

  /**
   * Future `planned` sessions belonging to a slot that no longer exists — the
   * reconcile's other half, where the signature *is* the rule.
   *
   * `plannedAt: { $gt: after }` keeps it away from the past, because changing
   * the timetable affects the week ahead and never the record of what happened.
   * `status: 'planned'` keeps it away from anything the member has touched.
   *
   * And `slotId` needs **both** clauses. `$nin` alone would match a session
   * whose `slotId` is `null` — the ones the member made by hand — because null
   * is not in the list of slots the profile still holds, and the reconcile
   * would then delete every hand-made session in the member's future every time
   * they saved the slot editor. `$ne: null` is what excludes them.
   */
  async orphanedPlanned(
    userId: string,
    after: Date,
    keepSlotIds: string[],
  ): Promise<Session[]> {
    return this.#read(
      {
        userId,
        deletedAt: null,
        status: 'planned',
        plannedAt: { $gt: after },
        slotId: { $nin: keepSlotIds, $ne: null },
      },
      { plannedAt: 1 },
    );
  }

  /** Future `planned` sessions, for the zone-change recompute. */
  async futurePlanned(userId: string, after: Date): Promise<Session[]> {
    return this.#read(
      { userId, deletedAt: null, status: 'planned', plannedAt: { $gt: after } },
      { plannedAt: 1 },
    );
  }

  /**
   * The member's most recent sessions, newest first, for the coach's streak.
   *
   * **Every status**, despite the name, and that is the point rather than a
   * loose filter. A streak is a *run*, so the caller needs the row that breaks
   * it: filter to `completed` here and the count becomes "sessions completed
   * ever, capped at the limit", which never breaks and never resets. The same
   * mistake in `currentStreak` is why the check-in streak is derived from rows
   * instead of folded — and it answers sessions rather than days on purpose,
   * because counting days would make every rest day a break.
   *
   * `before` is exclusive and keeps the future out: a `planned` session
   * tomorrow is not an outcome, and a `planned` one in the past is a missed
   * day, which the caller reads as the break it is.
   */
  async recentByStatus(
    userId: string,
    before: Date,
    limit: number,
  ): Promise<Session[]> {
    return this.#read(
      { userId, deletedAt: null, plannedAt: { $lt: before } },
      { plannedAt: -1 },
      limit,
    );
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

  /**
   * Every read above, in one place.
   *
   * Seven reads that differ only in their filter, sort and limit; written out
   * seven times, the `.session(...)` that joins the current transaction is
   * seven chances to forget it — and a read that misses it cannot see the
   * transaction's own writes, which is the failure the materialiser would hit
   * first and understand last.
   */
  async #read(
    filter: Record<string, unknown>,
    sort: Record<string, 1 | -1>,
    limit?: number,
  ): Promise<Session[]> {
    let query = this.model.find(filter).sort(sort);
    if (limit !== undefined) query = query.limit(limit);
    const docs = await query
      .session(MongoUnitOfWork.currentSession())
      .lean<SessionDoc[]>()
      .exec();
    return docs.map((doc) => sessionMapper.toDomain(doc));
  }
}

class InnerSessionRepository extends MongoRepositoryBase<Session, SessionDoc> {
  protected readonly mapper = sessionMapper;

  constructor(
    protected readonly model: Model<SessionDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

// ---------------------------------------------------------------- the programs

@Injectable()
export class MongoProgramRepository extends ProgramRepository {
  readonly #inner: InnerProgramRepository;

  constructor(
    private readonly model: Model<ProgramDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerProgramRepository(model, outbox);
  }

  async findById(userId: string, id: string): Promise<Program | null> {
    return this.#inner.findById(userId, id);
  }

  async save(program: Program): Promise<void> {
    await this.#inner.save(program);
  }

  async remove(program: Program): Promise<void> {
    await this.#inner.remove(program);
  }

  /** Tombstones included; see the note on `MongoSessionRepository.pullSince`. */
  async pullSince(userId: string, since: Date | null): Promise<Program[]> {
    const filter: Record<string, unknown> = { userId };
    if (since) filter.updatedAt = { $gt: since };
    const docs = await this.model
      .find(filter)
      .sort({ updatedAt: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<ProgramDoc[]>()
      .exec();
    return docs.map((doc) => programMapper.toDomain(doc));
  }

  /**
   * The member's library. Archived programs are included on request, because
   * archiving means "stop putting this into my weeks" and not "hide it" — a
   * member re-activating last winter's plan has to be able to find it.
   *
   * Most recently touched first: the `{ userId, updatedAt }` index the
   * migration declares supplies the order, and a library is read newest-first
   * far more often than alphabetically.
   */
  async listFor(
    userId: string,
    options: { includeArchived: boolean },
  ): Promise<Program[]> {
    const filter: Record<string, unknown> = { userId, deletedAt: null };
    if (!options.includeArchived) filter.status = 'active';
    const docs = await this.model
      .find(filter)
      .sort({ updatedAt: -1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<ProgramDoc[]>()
      .exec();
    return docs.map((doc) => programMapper.toDomain(doc));
  }

  /**
   * The one program the materialiser fills from, or null.
   *
   * Four clauses, each a rule. Live and `active`, because a deleted or archived
   * program fills nothing. `appliedStartDate: { $ne: null }` because a program
   * that was never applied has no week to count from — and `$ne: null` excludes
   * a missing field as well as an explicit null, which is what a row written
   * before the field existed carries.
   *
   * Sorted by `appliedStartDate` descending and limited to one rather than
   * refused when there are two: applying a program is what makes it the active
   * one, so a second apply is the member changing their mind, and a store that
   * has drifted into two should still fill a week from the newest. The date is
   * a `YYYY-MM-DD` string, which sorts chronologically as text — that is half
   * of why the field is stored that way. `updatedAt` breaks a same-day tie, so
   * two programs applied this morning give a stable answer instead of
   * whichever the index reached first.
   */
  async activeFor(userId: string): Promise<Program | null> {
    const doc = await this.model
      .findOne({
        userId,
        deletedAt: null,
        status: 'active',
        appliedStartDate: { $ne: null },
      })
      .sort({ appliedStartDate: -1, updatedAt: -1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<ProgramDoc>()
      .exec();
    return doc ? programMapper.toDomain(doc) : null;
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

class InnerProgramRepository extends MongoRepositoryBase<Program, ProgramDoc> {
  protected readonly mapper = programMapper;

  constructor(
    protected readonly model: Model<ProgramDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

// ---------------------------------------------------------------- the workouts

@Injectable()
export class MongoWorkoutRepository extends WorkoutRepository {
  readonly #inner: InnerWorkoutRepository;

  constructor(
    private readonly model: Model<WorkoutDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerWorkoutRepository(model, outbox);
  }

  async findById(userId: string, id: string): Promise<Workout | null> {
    return this.#inner.findById(userId, id);
  }

  async save(workout: Workout): Promise<void> {
    await this.#inner.save(workout);
  }

  async remove(workout: Workout): Promise<void> {
    await this.#inner.remove(workout);
  }

  /** Tombstones included; see the note on `MongoSessionRepository.pullSince`. */
  async pullSince(userId: string, since: Date | null): Promise<Workout[]> {
    const filter: Record<string, unknown> = { userId };
    if (since) filter.updatedAt = { $gt: since };
    const docs = await this.model
      .find(filter)
      .sort({ updatedAt: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<WorkoutDoc[]>()
      .exec();
    return docs.map((doc) => workoutMapper.toDomain(doc));
  }

  /**
   * The library, optionally narrowed to one sport — the `{ userId, sport }`
   * index the migration declares is there for this filter, which is the picker
   * a member opens while logging a gym session and does not want their
   * swimming sets in.
   *
   * The sport is left off the filter entirely when it is not given rather than
   * widened to an `$in` of the known ones: a member's own sport is a string
   * they typed, so an enumeration here would quietly hide their padel workouts.
   */
  async listFor(userId: string, sport?: string): Promise<Workout[]> {
    const filter: Record<string, unknown> = { userId, deletedAt: null };
    if (sport) filter.sport = sport;
    const docs = await this.model
      .find(filter)
      .sort({ updatedAt: -1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<WorkoutDoc[]>()
      .exec();
    return docs.map((doc) => workoutMapper.toDomain(doc));
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

class InnerWorkoutRepository extends MongoRepositoryBase<Workout, WorkoutDoc> {
  protected readonly mapper = workoutMapper;

  constructor(
    protected readonly model: Model<WorkoutDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

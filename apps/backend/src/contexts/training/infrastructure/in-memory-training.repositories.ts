import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/cqrs/domain-event.js';
import type { InMemoryUnitOfWork } from '../../../shared/persistence/memory/in-memory-unit-of-work.js';
import { StaleWriteError } from '../../../shared/persistence/ports/errors.js';
import {
  AthleteProfile,
  type AthleteProfileState,
} from '../domain/athlete-profile.aggregate.js';
import { Program, type ProgramState } from '../domain/program.aggregate.js';
import { Session, type SessionState } from '../domain/session.aggregate.js';
import {
  AthleteProfileRepository,
  ProgramRepository,
  SessionRepository,
  WorkoutRepository,
} from '../domain/training.repositories.js';
import { Workout, type WorkoutState } from '../domain/workout.aggregate.js';

/**
 * The adapters every Training handler spec binds.
 *
 * They are held to the same promises the Mongo ones make, because a handler
 * that passes here and misbehaves against a real database is worse than no test
 * at all:
 *
 * 1. **Events are pulled on save**, so a spec asserting `SessionScheduled`
 *    means something. An adapter that left them on the aggregate would let
 *    every such assertion pass vacuously.
 * 2. **`StaleWriteError` on an older copy**, the same refusal the optimistic
 *    filter gives.
 * 3. **Every read is scoped by `userId`**, keyed by owner rather than merely by
 *    id, so a query that forgets the scope fails here rather than in
 *    production.
 * 4. **Tombstones are in `pullSince` and out of every live read**, which is the
 *    difference the `/sync` protocol rests on: a delta carries a deletion only
 *    as a tombstone row.
 * 5. **`findMany` answers "which ids are taken", tombstones included.** That is
 *    the materialiser's question, and a double that filtered them would let it
 *    pass a spec while resurrecting deleted sessions in production.
 * 6. **`orphanedPlanned` never matches a session with no `slotId`.** The
 *    reconcile deletes what this read returns, so a double that were looser
 *    than the Mongo filter would let a handler pass here and delete every
 *    hand-made future session against a real store.
 *
 * The one refusal that is **not** modelled is `ForeignRowError`. It lives in
 * the Mongo adapter's write *filter* rather than in a check before it, because
 * from inside that adapter a foreign id and a never-before-seen id are
 * identical — so there is nothing here for a double to imitate. See
 * `MongoRepositoryBase.save`, which is where that guard has to be.
 */
@Injectable()
export class InMemoryAthleteProfileRepository extends AthleteProfileRepository {
  /** Keyed by the member's id, because that is this collection's `_id`. */
  readonly rows = new Map<string, AthleteProfileState>();
  readonly events: DomainEvent[] = [];

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows, this.events);
  }

  /**
   * The port's own lookup. `findById` reaches it with the owner rather than the
   * id for the reason the Mongo adapter gives: the two arguments are one value
   * here, and preferring the owner means a caller that got them out of step
   * reads the profile it is entitled to.
   */
  async find(userId: string): Promise<AthleteProfile | null> {
    const row = this.rows.get(userId);
    return row ? AthleteProfile.rehydrate(clone(row)) : null;
  }

  async findById(
    userId: string,
    _profileId: string,
  ): Promise<AthleteProfile | null> {
    return this.find(userId);
  }

  async save(profile: AthleteProfile): Promise<void> {
    const existing = this.rows.get(profile.userId);
    if (existing && existing.updatedAt > profile.updatedAt) {
      throw new StaleWriteError(profile.userId);
    }
    this.#raise(profile.pullEvents());
    this.rows.set(profile.userId, stateOfProfile(profile));
  }

  async remove(profile: AthleteProfile): Promise<void> {
    this.#raise(profile.pullEvents());
    this.rows.delete(profile.userId);
  }

  /** `slots.0 exists`, in the only spelling a Map has for it. */
  async memberIdsWithSlots(): Promise<string[]> {
    return [...this.rows.values()]
      .filter((row) => row.slots.length > 0)
      .map((row) => row.userId);
  }

  async removeAllFor(userId: string): Promise<number> {
    return this.rows.delete(userId) ? 1 : 0;
  }

  #raise(events: DomainEvent[]): void {
    this.uow.collect(events);
    this.events.push(...events);
  }
}

@Injectable()
export class InMemorySessionRepository extends SessionRepository {
  readonly rows = new Map<string, SessionState>();
  readonly events: DomainEvent[] = [];

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows, this.events);
  }

  async findById(userId: string, id: string): Promise<Session | null> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return null;
    return Session.rehydrate(clone(row));
  }

  async save(session: Session): Promise<void> {
    const existing = this.rows.get(session.id);
    if (existing && existing.updatedAt > session.updatedAt) {
      throw new StaleWriteError(session.id);
    }
    this.#raise(session.pullEvents());
    this.rows.set(session.id, stateOfSession(session));
  }

  async remove(session: Session): Promise<void> {
    this.#raise(session.pullEvents());
    this.rows.delete(session.id);
  }

  async pullSince(userId: string, since: Date | null): Promise<Session[]> {
    return this.#read(
      (row) => row.userId === userId && (!since || row.updatedAt > since),
      byUpdatedAtAscending,
    );
  }

  /** Live rows, every status, placed by `plannedAt`. Inclusive bounds. */
  async between(userId: string, from: Date, to: Date): Promise<Session[]> {
    return this.#read(
      (row) =>
        row.userId === userId &&
        row.deletedAt === null &&
        row.plannedAt >= from &&
        row.plannedAt <= to,
      byPlannedAtAscending,
    );
  }

  async plannedAfter(
    userId: string,
    after: Date,
    limit: number,
  ): Promise<Session[]> {
    return this.#read(
      (row) =>
        row.userId === userId &&
        row.deletedAt === null &&
        row.status === 'planned' &&
        row.plannedAt > after,
      byPlannedAtAscending,
      limit,
    );
  }

  /** Tombstones included: the question is which ids are taken. */
  async findMany(userId: string, ids: string[]): Promise<Session[]> {
    if (ids.length === 0) return [];
    const wanted = new Set(ids);
    return this.#read(
      (row) => row.userId === userId && wanted.has(row.id),
      byPlannedAtAscending,
    );
  }

  /**
   * The reconcile's rule, restated. `slotId !== null` is the half that keeps a
   * hand-made session out — without it every session the member created
   * themselves would be orphaned by definition, because no slot claims them.
   */
  async orphanedPlanned(
    userId: string,
    after: Date,
    keepSlotIds: string[],
  ): Promise<Session[]> {
    const keep = new Set(keepSlotIds);
    return this.#read(
      (row) =>
        row.userId === userId &&
        row.deletedAt === null &&
        row.status === 'planned' &&
        row.plannedAt > after &&
        row.slotId !== null &&
        !keep.has(row.slotId),
      byPlannedAtAscending,
    );
  }

  async futurePlanned(userId: string, after: Date): Promise<Session[]> {
    return this.#read(
      (row) =>
        row.userId === userId &&
        row.deletedAt === null &&
        row.status === 'planned' &&
        row.plannedAt > after,
      byPlannedAtAscending,
    );
  }

  /** Newest first, every status, so the caller can see the run break. */
  async recentByStatus(
    userId: string,
    before: Date,
    limit: number,
  ): Promise<Session[]> {
    return this.#read(
      (row) =>
        row.userId === userId &&
        row.deletedAt === null &&
        row.plannedAt < before,
      (a, b) => b.plannedAt.getTime() - a.plannedAt.getTime(),
      limit,
    );
  }

  async purgeTombstonesBefore(before: Date, userId?: string): Promise<number> {
    return purge(this.rows, before, userId);
  }

  async removeAllFor(userId: string): Promise<number> {
    return removeAll(this.rows, userId);
  }

  async #read(
    matches: (row: SessionState) => boolean,
    order: (a: SessionState, b: SessionState) => number,
    limit?: number,
  ): Promise<Session[]> {
    const rows = [...this.rows.values()].filter(matches).sort(order);
    const taken = limit === undefined ? rows : rows.slice(0, limit);
    return taken.map((row) => Session.rehydrate(clone(row)));
  }

  #raise(events: DomainEvent[]): void {
    this.uow.collect(events);
    this.events.push(...events);
  }
}

@Injectable()
export class InMemoryProgramRepository extends ProgramRepository {
  readonly rows = new Map<string, ProgramState>();
  readonly events: DomainEvent[] = [];

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows, this.events);
  }

  async findById(userId: string, id: string): Promise<Program | null> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return null;
    return Program.rehydrate(clone(row));
  }

  async save(program: Program): Promise<void> {
    const existing = this.rows.get(program.id);
    if (existing && existing.updatedAt > program.updatedAt) {
      throw new StaleWriteError(program.id);
    }
    this.#raise(program.pullEvents());
    this.rows.set(program.id, stateOfProgram(program));
  }

  async remove(program: Program): Promise<void> {
    this.#raise(program.pullEvents());
    this.rows.delete(program.id);
  }

  async pullSince(userId: string, since: Date | null): Promise<Program[]> {
    return [...this.rows.values()]
      .filter(
        (row) => row.userId === userId && (!since || row.updatedAt > since),
      )
      .sort(byUpdatedAtAscending)
      .map((row) => Program.rehydrate(clone(row)));
  }

  async listFor(
    userId: string,
    options: { includeArchived: boolean },
  ): Promise<Program[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.userId === userId &&
          row.deletedAt === null &&
          (options.includeArchived || row.status === 'active'),
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((row) => Program.rehydrate(clone(row)));
  }

  /**
   * The most recently applied active, live program, or null.
   *
   * The date is a `YYYY-MM-DD` string on both sides, so a plain string compare
   * is the chronological one — which is half of why the field is stored that
   * way rather than as an instant. `updatedAt` breaks a same-day tie, so two
   * programs applied this morning give the same answer here as against Mongo.
   */
  async activeFor(userId: string): Promise<Program | null> {
    const candidates = [...this.rows.values()]
      .filter(
        (row) =>
          row.userId === userId &&
          row.deletedAt === null &&
          row.status === 'active' &&
          row.appliedStartDate !== null,
      )
      .sort((a, b) => {
        const applied = (b.appliedStartDate ?? '').localeCompare(
          a.appliedStartDate ?? '',
        );
        if (applied !== 0) return applied;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });
    const newest = candidates[0];
    return newest ? Program.rehydrate(clone(newest)) : null;
  }

  async purgeTombstonesBefore(before: Date, userId?: string): Promise<number> {
    return purge(this.rows, before, userId);
  }

  async removeAllFor(userId: string): Promise<number> {
    return removeAll(this.rows, userId);
  }

  #raise(events: DomainEvent[]): void {
    this.uow.collect(events);
    this.events.push(...events);
  }
}

/**
 * The library's store. No aggregate here raises an event —
 * `workout.aggregate.ts` says why: nothing subscribes, so an event raised there
 * would have no consumer. The unit of work is still enlisted, so a rolled-back
 * transaction takes these rows with it, and the `events` array is still handed
 * over on save so the day one *is* raised it is not silently dropped.
 */
@Injectable()
export class InMemoryWorkoutRepository extends WorkoutRepository {
  readonly rows = new Map<string, WorkoutState>();
  readonly events: DomainEvent[] = [];

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows, this.events);
  }

  async findById(userId: string, id: string): Promise<Workout | null> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return null;
    return Workout.rehydrate(clone(row));
  }

  async save(workout: Workout): Promise<void> {
    const existing = this.rows.get(workout.id);
    if (existing && existing.updatedAt > workout.updatedAt) {
      throw new StaleWriteError(workout.id);
    }
    this.#raise(workout.pullEvents());
    this.rows.set(workout.id, stateOfWorkout(workout));
  }

  async remove(workout: Workout): Promise<void> {
    this.#raise(workout.pullEvents());
    this.rows.delete(workout.id);
  }

  async pullSince(userId: string, since: Date | null): Promise<Workout[]> {
    return [...this.rows.values()]
      .filter(
        (row) => row.userId === userId && (!since || row.updatedAt > since),
      )
      .sort(byUpdatedAtAscending)
      .map((row) => Workout.rehydrate(clone(row)));
  }

  async listFor(userId: string, sport?: string): Promise<Workout[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.userId === userId &&
          row.deletedAt === null &&
          (!sport || row.sport === sport),
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((row) => Workout.rehydrate(clone(row)));
  }

  async purgeTombstonesBefore(before: Date, userId?: string): Promise<number> {
    return purge(this.rows, before, userId);
  }

  async removeAllFor(userId: string): Promise<number> {
    return removeAll(this.rows, userId);
  }

  #raise(events: DomainEvent[]): void {
    this.uow.collect(events);
    this.events.push(...events);
  }
}

// -------------------------------------------------------------------- plumbing

/** A syncable row, as far as the two sweeps below need to know. */
interface TombstonedRow {
  userId: string;
  deletedAt: Date | null;
}

/**
 * The nightly sweep, for the three syncable collections.
 *
 * Deleting from a Map while iterating it is defined behaviour — the iterator
 * tolerates removal of the current entry — so no snapshot copy is needed.
 */
function purge<T extends TombstonedRow>(
  rows: Map<string, T>,
  before: Date,
  userId?: string,
): number {
  let purged = 0;
  for (const [id, row] of rows) {
    if (userId && row.userId !== userId) continue;
    if (row.deletedAt && row.deletedAt < before) {
      rows.delete(id);
      purged += 1;
    }
  }
  return purged;
}

function removeAll<T extends TombstonedRow>(
  rows: Map<string, T>,
  userId: string,
): number {
  let removed = 0;
  for (const [id, row] of rows) {
    if (row.userId === userId) {
      rows.delete(id);
      removed += 1;
    }
  }
  return removed;
}

function byUpdatedAtAscending(
  a: { updatedAt: Date },
  b: { updatedAt: Date },
): number {
  return a.updatedAt.getTime() - b.updatedAt.getTime();
}

function byPlannedAtAscending(
  a: { plannedAt: Date },
  b: { plannedAt: Date },
): number {
  return a.plannedAt.getTime() - b.plannedAt.getTime();
}

function stateOfProfile(profile: AthleteProfile): AthleteProfileState {
  return {
    userId: profile.userId,
    sports: profile.sports,
    slots: profile.slots,
    updatedAt: profile.updatedAt,
  };
}

function stateOfSession(session: Session): SessionState {
  return {
    id: session.id,
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
  };
}

function stateOfProgram(program: Program): ProgramState {
  return {
    id: program.id,
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
  };
}

function stateOfWorkout(workout: Workout): WorkoutState {
  return {
    id: workout.id,
    userId: workout.userId,
    name: workout.name,
    sport: workout.sport,
    exercises: workout.exercises,
    tags: workout.tags,
    createdAt: workout.createdAt,
    updatedAt: workout.updatedAt,
    deletedAt: workout.deletedAt,
  };
}

/**
 * A deep copy on the way out, so a handler that mutates what it read cannot
 * change the stored row without saving. `structuredClone` keeps Dates as Dates,
 * which a JSON round trip would not — and these rows are nested three deep
 * (a session's exercises, their sets), so a shallow copy would share the
 * exercise objects and let a set logged on a read copy appear in the store
 * without a save.
 */
function clone<T>(value: T): T {
  return structuredClone(value);
}

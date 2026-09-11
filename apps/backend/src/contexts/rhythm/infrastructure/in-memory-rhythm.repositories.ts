import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/cqrs/domain-event.js';
import type { InMemoryUnitOfWork } from '../../../shared/persistence/memory/in-memory-unit-of-work.js';
import { StaleWriteError } from '../../../shared/persistence/ports/errors.js';
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
 * The three adapters every Rhythm handler spec binds.
 *
 * They make the same three promises the Mongo ones do, and each promise is here
 * because breaking it would let a handler pass its spec and misbehave against a
 * real database:
 *
 * 1. **Events are pulled on save.** An adapter that left them on the aggregate
 *    would let a spec assert "the tick raised `PlanTomorrowPrompted`" and have
 *    the assertion mean nothing, because production publishes from the
 *    repository, not from the handler.
 * 2. **An older copy is refused with `StaleWriteError`.** The Mongo base filters
 *    its upsert on `updatedAt`, and the claim-then-send rhythm depends on that
 *    refusal: two overlapping ticks that both read a state before either wrote
 *    it must not both win.
 * 3. **The finders order rows exactly as the Mongo ones do.** This is the one
 *    worth spelling out, below.
 *
 * ## Ordering, and the null question
 *
 * A previous phase shipped two adapters that disagreed about where `null` sorts
 * and a comment claiming they matched, so the decision here is stated rather
 * than assumed.
 *
 * **No sort key in this context is nullable.** `date` is `YYYY-MM-DD` and
 * `required: true`; `updatedAt` is a `Date` written by every save and
 * `required: true`; `_id` is composed by the aggregate's constructor and is a
 * member id or `"<userId>:<date>"`. The nullable fields — `promptedAt`,
 * `confirmedAt`, `awaitingSince`, `mood`, `adhered`, `streak.lastAdheredDate` —
 * are read but never ordered on. So Mongo's "null sorts first on an ascending
 * index" never comes into play, and the two adapters cannot disagree about it.
 * That is a property of the current ports; anyone adding a finder that sorts a
 * nullable field has to make the choice explicitly and write it down in both
 * files.
 *
 * What the two adapters *do* have to agree on is the comparison and the
 * tiebreak:
 *
 * - **Comparison.** `date` and `_id` are compared as strings. Mongo compares
 *   strings by UTF-8 byte order and JavaScript's `<` compares UTF-16 code
 *   units; the two agree for every character in `YYYY-MM-DD` and in a uuid,
 *   which is all these keys ever hold. `updatedAt` is compared numerically via
 *   `getTime()`, which is what Mongo does with a BSON date.
 * - **Tiebreak.** `between` sorts on `date` alone in both adapters, because one
 *   member cannot have two rows for one date — the `_id` guarantees it — so the
 *   order is already total. `changedSince` sorts `updatedAt` then `_id` in
 *   both, because ties there are ordinary: the evening touch saves a plan and a
 *   state in one transaction, and Mongo leaves the order within a tie
 *   unspecified. A pull cursor advanced to the last row of an unspecified order
 *   can skip a row it never saw.
 * - **`page`** sorts `_id` ascending in both, and filters `_id > after`.
 */

@Injectable()
export class InMemoryDailyPlanRepository extends DailyPlanRepository {
  readonly rows = new Map<string, DailyPlanState>();
  readonly events: DomainEvent[] = [];

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows, this.events);
  }

  async findById(userId: string, id: string): Promise<DailyPlan | null> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return null;
    return DailyPlan.rehydrate(structuredClone(row));
  }

  async save(plan: DailyPlan): Promise<void> {
    const existing = this.rows.get(plan.id);
    if (existing && existing.updatedAt > plan.updatedAt) {
      throw new StaleWriteError(plan.id);
    }
    this.#raise(plan.pullEvents());
    this.rows.set(plan.id, stateOfPlan(plan));
  }

  async remove(plan: DailyPlan): Promise<void> {
    this.#raise(plan.pullEvents());
    this.rows.delete(plan.id);
  }

  /**
   * Through the composed key, exactly as the Mongo adapter does — so a spec
   * that stored a plan under one member's id and asked for it under another's
   * gets null here too, rather than passing in memory and failing in the store.
   */
  async forDate(userId: string, date: string): Promise<DailyPlan | null> {
    return this.findById(userId, planId(userId, date));
  }

  async between(
    userId: string,
    from: string,
    to: string,
  ): Promise<DailyPlan[]> {
    return [...this.rows.values()]
      .filter(
        (row) => row.userId === userId && row.date >= from && row.date <= to,
      )
      .sort((a, b) => compareStrings(a.date, b.date))
      .map((row) => DailyPlan.rehydrate(structuredClone(row)));
  }

  async changedSince(userId: string, since: Date | null): Promise<DailyPlan[]> {
    return [...this.rows.values()]
      .filter(
        (row) => row.userId === userId && (!since || row.updatedAt > since),
      )
      .sort(
        (a, b) =>
          a.updatedAt.getTime() - b.updatedAt.getTime() ||
          compareStrings(planId(a.userId, a.date), planId(b.userId, b.date)),
      )
      .map((row) => DailyPlan.rehydrate(structuredClone(row)));
  }

  async removeAllFor(userId: string): Promise<number> {
    return removeAllFor(this.rows, userId);
  }

  #raise(events: DomainEvent[]): void {
    this.uow.collect(events);
    this.events.push(...events);
  }
}

@Injectable()
export class InMemoryCheckinRepository extends CheckinRepository {
  readonly rows = new Map<string, CheckinState>();
  readonly events: DomainEvent[] = [];

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows, this.events);
  }

  async findById(userId: string, id: string): Promise<Checkin | null> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return null;
    return Checkin.rehydrate(structuredClone(row));
  }

  async save(checkin: Checkin): Promise<void> {
    const existing = this.rows.get(checkin.id);
    if (existing && existing.updatedAt > checkin.updatedAt) {
      throw new StaleWriteError(checkin.id);
    }
    this.#raise(checkin.pullEvents());
    this.rows.set(checkin.id, stateOfCheckin(checkin));
  }

  async remove(checkin: Checkin): Promise<void> {
    this.#raise(checkin.pullEvents());
    this.rows.delete(checkin.id);
  }

  async forDate(userId: string, date: string): Promise<Checkin | null> {
    return this.findById(userId, checkinId(userId, date));
  }

  async between(userId: string, from: string, to: string): Promise<Checkin[]> {
    return [...this.rows.values()]
      .filter(
        (row) => row.userId === userId && row.date >= from && row.date <= to,
      )
      .sort((a, b) => compareStrings(a.date, b.date))
      .map((row) => Checkin.rehydrate(structuredClone(row)));
  }

  async changedSince(userId: string, since: Date | null): Promise<Checkin[]> {
    return [...this.rows.values()]
      .filter(
        (row) => row.userId === userId && (!since || row.updatedAt > since),
      )
      .sort(
        (a, b) =>
          a.updatedAt.getTime() - b.updatedAt.getTime() ||
          compareStrings(
            checkinId(a.userId, a.date),
            checkinId(b.userId, b.date),
          ),
      )
      .map((row) => Checkin.rehydrate(structuredClone(row)));
  }

  async removeAllFor(userId: string): Promise<number> {
    return removeAllFor(this.rows, userId);
  }

  #raise(events: DomainEvent[]): void {
    this.uow.collect(events);
    this.events.push(...events);
  }
}

@Injectable()
export class InMemoryRhythmStateRepository extends RhythmStateRepository {
  readonly rows = new Map<string, RhythmStateData>();
  readonly events: DomainEvent[] = [];

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows, this.events);
  }

  async findById(userId: string, id: string): Promise<RhythmState | null> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return null;
    return RhythmState.rehydrate(structuredClone(row));
  }

  async save(state: RhythmState): Promise<void> {
    const existing = this.rows.get(state.id);
    if (existing && existing.updatedAt > state.updatedAt) {
      throw new StaleWriteError(state.id);
    }
    this.#raise(state.pullEvents());
    this.rows.set(state.id, stateOfRhythm(state));
  }

  async remove(state: RhythmState): Promise<void> {
    this.#raise(state.pullEvents());
    this.rows.delete(state.id);
  }

  async find(userId: string): Promise<RhythmState | null> {
    return this.findById(userId, userId);
  }

  /**
   * The cross-member walk, sorted and filtered on `_id` — the member's id —
   * exactly as the Mongo adapter does. Sorting explicitly rather than relying
   * on `Map` insertion order is the point: insertion order happens to be
   * *seeding* order in a spec, so a page assertion written against it would
   * pass here and return a different page from the store.
   */
  async page(after: string | null, limit: number): Promise<RhythmState[]> {
    return [...this.rows.values()]
      .filter((row) => !after || row.userId > after)
      .sort((a, b) => compareStrings(a.userId, b.userId))
      .slice(0, limit)
      .map((row) => RhythmState.rehydrate(structuredClone(row)));
  }

  async removeAllFor(userId: string): Promise<number> {
    return removeAllFor(this.rows, userId);
  }

  #raise(events: DomainEvent[]): void {
    this.uow.collect(events);
    this.events.push(...events);
  }
}

/**
 * String comparison that matches the store's.
 *
 * Written out rather than `a < b ? -1 : ...` inline in five places, and
 * deliberately *not* `localeCompare`: a locale-aware comparison reorders
 * punctuation and case by language, so `localeCompare` would sort a page of
 * uuids differently from Mongo — and differently again on a machine with a
 * different default locale, which is the kind of test failure nobody can
 * reproduce.
 */
function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function removeAllFor(
  rows: Map<string, { userId: string }>,
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

/*
 * The three snapshot functions below are what the Mongo mappers'
 * `toPersistence` halves are: the aggregate flattened to the row shape, with
 * every field named. They are written out rather than derived from the
 * aggregate's own properties because a spread would silently carry a field the
 * store does not have — and then a handler spec would assert against a value
 * that never survives a real save.
 */

function stateOfPlan(plan: DailyPlan): DailyPlanState {
  return {
    userId: plan.userId,
    date: plan.date,
    status: plan.status,
    autoConfirmed: plan.autoConfirmed,
    tasks: plan.tasks,
    meetings: plan.meetings,
    training: plan.training,
    workoutLine: plan.workoutLine,
    mealReason: plan.mealReason,
    mealLine: plan.mealLine,
    promptedAt: plan.promptedAt,
    confirmedAt: plan.confirmedAt,
    summarisedAt: plan.summarisedAt,
    briefedAt: plan.briefedAt,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

function stateOfCheckin(checkin: Checkin): CheckinState {
  return {
    userId: checkin.userId,
    date: checkin.date,
    mood: checkin.mood,
    adhered: checkin.adhered,
    note: checkin.note,
    source: checkin.source,
    createdAt: checkin.createdAt,
    updatedAt: checkin.updatedAt,
  };
}

function stateOfRhythm(state: RhythmState): RhythmStateData {
  return {
    userId: state.userId,
    lastPlanPromptDate: state.lastPlanPromptDate,
    lastEndOfDayDate: state.lastEndOfDayDate,
    lastMorningBriefingDate: state.lastMorningBriefingDate,
    awaitingCheckin: state.awaitingCheckin,
    awaitingSince: state.awaitingSince,
    streak: state.streak,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

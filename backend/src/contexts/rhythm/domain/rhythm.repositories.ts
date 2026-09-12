import { Repository } from '../../../shared/persistence/ports/repository.js';
import type { Checkin } from './checkin.aggregate.js';
import type { DailyPlan } from './daily-plan.aggregate.js';
import type { RhythmState } from './rhythm-state.aggregate.js';

/**
 * The rhythm's three ports.
 *
 * All three keyed by the member and a local date rather than by an opaque id,
 * which is why none of them extends `SyncableRepository`: nothing here is
 * client-minted and nothing here is created offline. The phone holds a copy and
 * pushes two operations — a confirmation and a check-in — and both are REST
 * commands that name the date, so the sync adapters are pull-shaped with two
 * narrow writes rather than the full row protocol.
 *
 * `findById(userId, id)` from the base still works and is what the framework
 * uses; the date-shaped finders below are what handlers actually call, because
 * a handler that had to compose `"<userId>:<date>"` itself is a handler with a
 * copy of the key format.
 */
export abstract class DailyPlanRepository extends Repository<DailyPlan> {
  abstract forDate(userId: string, date: string): Promise<DailyPlan | null>;

  /** Inclusive both ends. The plans screen and the week strip read this. */
  abstract between(
    userId: string,
    from: string,
    to: string,
  ): Promise<DailyPlan[]>;

  /** Everything changed since a cursor, for the phone's pull. */
  abstract changedSince(userId: string, since: Date | null): Promise<DailyPlan[]>;

  abstract removeAllFor(userId: string): Promise<number>;
}

export abstract class CheckinRepository extends Repository<Checkin> {
  abstract forDate(userId: string, date: string): Promise<Checkin | null>;

  abstract between(
    userId: string,
    from: string,
    to: string,
  ): Promise<Checkin[]>;

  abstract changedSince(userId: string, since: Date | null): Promise<Checkin[]>;

  abstract removeAllFor(userId: string): Promise<number>;
}

export abstract class RhythmStateRepository extends Repository<RhythmState> {
  abstract find(userId: string): Promise<RhythmState | null>;

  /**
   * The tick's own read, and the only one that crosses members.
   *
   * Paged by `userId` because the tick runs over everybody and a five-hundred
   * member installation must not load five hundred rows to decide that nobody
   * is due. The cursor is the last id seen, which is stable under concurrent
   * writes in a way an offset is not — a row updated mid-pass would shift an
   * offset window and skip somebody's evening.
   */
  abstract page(
    after: string | null,
    limit: number,
  ): Promise<RhythmState[]>;

  abstract removeAllFor(userId: string): Promise<number>;
}

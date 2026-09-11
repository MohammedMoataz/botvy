import { Repository } from '../../../shared/persistence/ports/repository.js';
import { SyncableRepository } from '../../../shared/persistence/ports/syncable-repository.js';
import type { AthleteProfile } from './athlete-profile.aggregate.js';
import type { Program } from './program.aggregate.js';
import type { Session } from './session.aggregate.js';
import type { Workout } from './workout.aggregate.js';

/**
 * Training's four collections, as ports.
 *
 * Three are syncable rows; the profile is not, and the difference runs all the
 * way through. `athlete_profiles` is keyed by the member's id — one document,
 * created when they register, never deleted short of the member themselves — so
 * it has no tombstone, no client-minted id and nothing to sweep, and it reaches
 * the phone as a *patch* rather than a row. The blueprint's own coverage table
 * names it as the exception.
 */
export abstract class AthleteProfileRepository extends Repository<AthleteProfile> {
  /**
   * The member's profile, which always exists.
   *
   * `find` rather than `findById(userId, id)` because the two arguments would be
   * the same string, and a signature that invites a caller to pass different
   * ones is a signature that will one day be given different ones.
   *
   * It can still answer null: the profile is written from
   * `identity.UserRegistered` and the relay is eventual, so there is a window
   * after registration in which it does not exist yet. Callers treat that as
   * "no sports, no slots" — see `AthleteProfile.empty` for why an absent
   * profile is not a branch anybody should be writing.
   */
  abstract find(userId: string): Promise<AthleteProfile | null>;

  /** Every member who has at least one slot — the materialiser's input. */
  abstract memberIdsWithSlots(): Promise<string[]>;

  abstract removeAllFor(userId: string): Promise<number>;
}

export abstract class SessionRepository extends SyncableRepository<Session> {
  /**
   * Sessions overlapping a window, by instant.
   *
   * The read behind the week view, the agenda and the rhythm's draft. Live rows
   * only — a tombstoned session is not on anybody's calendar — but **every
   * status**, because a skipped session stays in the week (FR-005) and a
   * completed one is the record of the day.
   */
  abstract between(userId: string, from: Date, to: Date): Promise<Session[]>;

  /**
   * The next `planned` sessions strictly after an instant, soonest first.
   *
   * Limited, because the only caller wants the first one and a member with a
   * year of materialised sessions should not pay for the rest. It takes a limit
   * rather than returning one session so a caller that needs to skip a deleted
   * or unsuitable row can, without a second query.
   */
  abstract plannedAfter(
    userId: string,
    after: Date,
    limit: number,
  ): Promise<Session[]>;

  /**
   * The sessions with these derived ids that already exist.
   *
   * The materialiser's one read: it computes the fortnight's ids from the slots
   * and asks which are already there, so the pass is one query rather than one
   * per slot per day. `slot-calendar.ts` explains why the ids can be computed
   * rather than looked up.
   */
  abstract findMany(userId: string, ids: string[]): Promise<Session[]>;

  /**
   * Future `planned` sessions belonging to a slot that no longer exists.
   *
   * The reconcile's other half, and the signature is the rule: `after` keeps it
   * away from the past, `planned` keeps it away from anything the member has
   * touched, and `slotIds` is what the profile still holds — so a session with
   * no `slotId` at all (one the member made by hand) can never match.
   */
  abstract orphanedPlanned(
    userId: string,
    after: Date,
    keepSlotIds: string[],
  ): Promise<Session[]>;

  /** Future `planned` sessions, for the zone-change recompute. */
  abstract futurePlanned(userId: string, after: Date): Promise<Session[]>;

  /**
   * How many sessions the member has completed in a row, most recent first.
   *
   * Read by the coach's training summary. It answers *sessions* rather than
   * days on purpose: a member who trains three times a week has a streak of
   * three after a week, and counting days would make every rest day a break.
   */
  abstract recentByStatus(
    userId: string,
    before: Date,
    limit: number,
  ): Promise<Session[]>;

  abstract purgeTombstonesBefore(before: Date, userId?: string): Promise<number>;

  abstract removeAllFor(userId: string): Promise<number>;
}

export abstract class ProgramRepository extends SyncableRepository<Program> {
  /** The member's programs; tombstones excluded, archived included on request. */
  abstract listFor(
    userId: string,
    options: { includeArchived: boolean },
  ): Promise<Program[]>;

  /**
   * The one program the materialiser should be filling from, or null.
   *
   * At most one: applying a program is what makes it the active one, so a
   * second apply is the member changing their mind. Which is also why this
   * returns the most recently applied rather than refusing when there are two —
   * a store that has drifted into two should still fill a week, and the newest
   * apply is what the member last asked for.
   */
  abstract activeFor(userId: string): Promise<Program | null>;

  abstract purgeTombstonesBefore(before: Date, userId?: string): Promise<number>;

  abstract removeAllFor(userId: string): Promise<number>;
}

export abstract class WorkoutRepository extends SyncableRepository<Workout> {
  abstract listFor(userId: string, sport?: string): Promise<Workout[]>;

  abstract purgeTombstonesBefore(before: Date, userId?: string): Promise<number>;

  abstract removeAllFor(userId: string): Promise<number>;
}

import { Injectable } from '@nestjs/common';
import { newId } from '../../../shared/cqrs/ids.js';
import {
  resolveConflict,
  type RejectionReason,
  type SyncChange,
} from '../../../shared/persistence/ports/sync-change.js';
import { UnitOfWork } from '../../../shared/persistence/ports/unit-of-work.js';
import type {
  ApplyOutcome,
  SyncableEntity,
  SyncablePatch,
} from '../../sync/domain/syncable-entity.port.js';
import {
  AthleteProfile,
  AthleteProfileRuleError,
  type TrainingSlot,
} from '../domain/athlete-profile.aggregate.js';
import {
  Program,
  ProgramRuleError,
  type ProgramWeek,
} from '../domain/program.aggregate.js';
import {
  Session,
  SessionRuleError,
  type SessionStatus,
} from '../domain/session.aggregate.js';
import type { Exercise, MediaRef, SetEntry } from '../domain/set-entry.js';
import {
  AthleteProfileRepository,
  ProgramRepository,
  SessionRepository,
  WorkoutRepository,
} from '../domain/training.repositories.js';
import { Workout, WorkoutRuleError } from '../domain/workout.aggregate.js';

/**
 * Training's four adapters for the sync facade (FR-012).
 *
 * They live in `infrastructure/` because that is the layer allowed to know
 * another context exists — the ports they implement are the Sync context's. The
 * facade never learns what a session is; it sorts by `applyOrder` and calls
 * `apply`.
 *
 * Three of them are ordinary rows and the fourth is not, and the difference
 * runs all the way through. `athlete_profiles` is one document per member,
 * keyed by the member's own id, with no tombstone and nothing to sweep — so it
 * reaches the phone as a **patch**, which is the exception the blueprint's own
 * coverage table names.
 *
 * ## `applyOrder`: 35, 37, 39 — and one of them encodes a dependency the
 * ## contract states but this implementation does not yet have
 *
 * `contracts/sync.md`'s processing order says "labels before tasks, **programs
 * before sessions**, conversations before messages — parents before children",
 * which is why programs is 35 and sessions 37. Being honest about it matters
 * more than the number: **as written today, no session apply reads a program.**
 * A pushed session carries `programId` and `weekIndex` as opaque values the
 * materialiser wrote, and nothing here resolves them, so reversing the two
 * would break nothing. The order is bought for two other things — a
 * deterministic sequence that reads the way the contract writes it, so nobody
 * "fixes" it in the wrong direction, and a slot for the day a session genuinely
 * does need its program to exist first (P7's accepted suggestion is the
 * candidate).
 *
 * Workouts at 39 depends on nothing at all and nothing depends on it; it is
 * last of the three because that is where the contract's `entities` list puts
 * it. The gaps at 36 and 38 are the same courtesy meetings left at 33: an
 * entity that ever does depend on one of these has a number to sit between.
 *
 * `athlete_profile` is 3 among the *patches*, whose own list runs profile (1),
 * preferences (2). Patches and rows are separate lists in the facade, so the
 * numbers cannot collide — and the profile's time zone landing before a
 * timetable that is expressed in wall-clock times is the reading order, not a
 * requirement: nothing here resolves a slot to an instant.
 */
export const PROGRAM_APPLY_ORDER = 35;
export const SESSION_APPLY_ORDER = 37;
export const WORKOUT_APPLY_ORDER = 39;
export const ATHLETE_PROFILE_APPLY_ORDER = 3;

/** The conflict rule's refusal, in the shape every row-shaped adapter returns. */
function refuse(
  entity: string,
  change: SyncChange,
  reason: RejectionReason,
  server: unknown,
): ApplyOutcome {
  return {
    applied: false,
    rejection: { entity, id: change.id, reason, server },
  };
}

/**
 * What a rejection carries back: the whole server row.
 *
 * The client's obligation on a `stale` is to overwrite its own copy from this
 * and show the member the winner, and it can only do that if the winner is in
 * the response — a rejection that named the conflict without carrying the row
 * would have the phone ask again, get the same refusal, and loop.
 */
function serverRow(
  existing: { updatedAt: Date; deletedAt: Date | null } | null,
): unknown {
  return existing ?? null;
}

/*
 * A note on the one verdict these adapters deliberately do **not** invent.
 *
 * An edit pushed onto a row that is already a tombstone is *accepted* here, the
 * same as it is by Planning's and Meetings' adapters, because `resolveConflict`
 * is the authority on the verdict and it has no clause about `deletedAt` beyond
 * refusing a purge of a live row. This phase drafted an extra `gone` for that
 * case and dropped it: `/sync` is one protocol, and three of eight entities
 * answering a situation differently from the other five is a defect a client
 * author walks into by reasonably assuming uniformity — and `contracts/sync.md`
 * defines `gone` as "the row is not there", where a tombstone *is* there and is
 * recoverable by `restore`.
 *
 * The consequence is real and is written up as `enhancements/E-016`: the edit is
 * accepted onto the tombstone and the next pull overwrites the phone's copy
 * with it, so the member's edit is silently lost. If `gone` is the right answer
 * it is right for every entity, which makes the fix one change to
 * `resolveConflict` and one line in the contract — not one adapter.
 */

// ------------------------------------------------------------------ sessions

/** The fields a client may push on a session row. `contracts/sync.md`. */
interface PushedSession {
  plannedAt?: string | Date;
  durationMin?: number;
  sport?: string;
  title?: string;
  focus?: string | null;
  notes?: string | null;
  exercises?: unknown;
  status?: string;
  completedAt?: string | Date | null;
  slotId?: string | null;
  /**
   * Carried on the wire because `pull` sends them and the phone mirrors them,
   * and **read by nothing on an update**. The materialiser writes them when it
   * fills a session from a program's week template; a client that could restate
   * them would be able to claim a session belongs to a week of a program it
   * does not belong to, and the week view would say so. They are accepted on a
   * *create* only, where there is no stored value to contradict.
   */
  programId?: string | null;
  weekIndex?: number | null;
  /** P7's seam. Written by nothing in this phase, on either side. */
  suggestionId?: string | null;
}

@Injectable()
export class SessionSyncAdapter implements SyncableEntity {
  readonly entity = 'sessions';
  readonly applyOrder = SESSION_APPLY_ORDER;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly sessions: SessionRepository,
    private readonly profiles: AthleteProfileRepository,
  ) {}

  /**
   * Every field the phone's drift table mirrors, **tombstones included**.
   *
   * `pullSince` is the port that includes them, and on a delta a tombstone is
   * the only way a deletion travels: the client's delete sweep runs only
   * against a full snapshot, because treating a delta as the complete set
   * deletes every row that simply did not change.
   *
   * Field by field rather than a spread of the aggregate, so publishing a new
   * field is a decision — a `{ ...session }` would ship `pendingEvents` and
   * every private the class ever grows. `isMissed` is deliberately *not* here:
   * it is a reading of the clock, the phone asks the same question of its own
   * copy, and a stored answer would be one that goes stale between two pulls.
   */
  async pull(userId: string, since: Date | null): Promise<unknown[]> {
    const rows = await this.sessions.pullSince(userId, since);
    return rows.map((session) => ({
      id: session.id,
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
    }));
  }

  async apply(
    userId: string,
    change: SyncChange,
    now: Date,
  ): Promise<ApplyOutcome> {
    // Scoped by owner, so a session belonging to another member is simply not
    // found — and an op naming it is refused `gone`, the same as an id that
    // never existed. Never `stale`: a stale verdict tells the phone to take the
    // server's copy and try again, and there is no copy for it to take.
    const existing = await this.sessions.findById(userId, change.id);

    const verdict = resolveConflict(change, existing, now);
    if (!verdict.accept) {
      return refuse(this.entity, change, verdict.reason, serverRow(existing));
    }

    try {
      return await this.write(userId, change, existing, now);
    } catch (error) {
      /*
       * A domain rule refused the row: no title, a duration longer than any
       * practice, more sets than an exercise may hold.
       *
       * `invalid`, never `stale`. Retrying the same bytes will fail against the
       * same rule for ever, and `stale` is the one verdict that tells the phone
       * to refresh and retry — so a stale verdict here is an infinite loop
       * against a rule that is never going to accept the row. `invalid` tells
       * the client to show it to the member, who is the only one who can fix
       * it.
       *
       * `not_deleted` passes through as itself because it means something
       * different and the client shows it differently. `resolveConflict` has
       * already refused a purge of a live row before `assertPurgeable` is
       * reached; this branch is the backstop, and it is written because the
       * cost of reaching it is not a wrong message but the wrong instruction.
       */
      if (error instanceof SessionRuleError) {
        return refuse(
          this.entity,
          change,
          error.code === 'not_deleted' ? 'not_deleted' : 'invalid',
          serverRow(existing),
        );
      }
      throw error;
    }
  }

  private async write(
    userId: string,
    change: SyncChange,
    existing: Session | null,
    now: Date,
  ): Promise<ApplyOutcome> {
    const fields = change.fields as PushedSession;

    if (!existing) {
      /*
       * A create, or an op the server has no row for that `resolveConflict`
       * accepted — the ordinary offline case: the phone minted the id, so a
       * retried create is a no-op rather than a second session.
       *
       * A pushed `slotId` is checked against the member's timetable, and that
       * check is the one thing here that is not bookkeeping. A slot's session
       * has a *derived* id, so a device holding a stale timetable could push
       * back a session for a slot the member has since removed — the reconcile
       * deleted it, and accepting the push would resurrect it on their week
       * until the next pass noticed. `invalid` rather than `stale`: the slot is
       * gone, no refresh will bring it back, and the phone must stop asking.
       */
      const slotId = typeof fields.slotId === 'string' ? fields.slotId : null;
      if (slotId !== null) {
        const profile = await this.profiles.find(userId);
        if (!profile || profile.slot(slotId) === null) {
          return refuse(this.entity, change, 'invalid', null);
        }
      }

      const session = Session.plan({
        id: change.id,
        userId,
        /*
         * A missing required field is passed through so the aggregate refuses
         * the row, rather than defaulted into something plausible. A session
         * called "Session" at an invented time is a wrong entry on the
         * member's week that they will act on; `title_required` and
         * `bad_duration` exist precisely to refuse it, and reaching the member
         * as `invalid` is how they learn their client sent a broken row.
         */
        title: fields.title ?? '',
        sport: fields.sport ?? '',
        // No guard on the moment itself, so the client's own edit time stands
        // in — a session the member placed is one whose `plannedAt` they sent,
        // and a push without one is already going to be refused on title,
        // sport or duration.
        plannedAt: asDate(fields.plannedAt) ?? change.updatedAt,
        durationMin: fields.durationMin ?? 0,
        focus: fields.focus ?? null,
        notes: fields.notes ?? null,
        programId: fields.programId ?? null,
        weekIndex: fields.weekIndex ?? null,
        slotId,
        suggestionId: fields.suggestionId ?? null,
        exercises: pushedExercises(fields.exercises) ?? [],
        createdAt: change.updatedAt,
      });
      // A session created offline can arrive already completed or skipped. The
      // status is *written*, for the reason `applyPushedStatus` gives.
      applyPushedStatus(session, fields, now);
      await this.uow.run(() => this.sessions.save(session));
      return { applied: true, id: session.id };
    }

    switch (change.op) {
      case 'delete':
        // The status is untouched, here as everywhere. It is the only record of
        // whether the session happened, was called off or was skipped, and the
        // Deleted view exists to show exactly that. Broken twice in this
        // codebase, so `training-sync.spec.ts` asserts it.
        if (!existing.isDeleted) existing.tombstone(now);
        break;
      case 'restore':
        if (existing.isDeleted) existing.restore(now);
        break;
      case 'purge':
        existing.assertPurgeable();
        await this.uow.run(() => this.sessions.remove(existing));
        return { applied: true, id: existing.id };
      default:
        existing.edit(
          {
            title: fields.title,
            sport: fields.sport,
            plannedAt:
              fields.plannedAt === undefined
                ? undefined
                : (asDate(fields.plannedAt) ?? undefined),
            durationMin: fields.durationMin,
            focus: fields.focus,
            notes: fields.notes,
            exercises: pushedExercises(fields.exercises),
          },
          now,
        );
        /*
         * A pushed status is applied as a *write* and nothing else.
         *
         * A client that completed a session offline sends the row with
         * `status: 'completed'`. Calling `complete()` here would raise
         * `training.SessionCompleted` a second time and re-run every side
         * effect that hangs off it — the alert clearing, the streak, the coach's
         * summary — which the phone already applied locally and is pushing the
         * result of. The pushed row *is* the outcome, so it is stored as such:
         * the client is not requesting a transition, it is reporting one that
         * has happened.
         */
        applyPushedStatus(existing, fields, now);
    }

    await this.uow.run(() => this.sessions.save(existing));
    return { applied: true, id: existing.id };
  }
}

/**
 * Copies a pushed status onto the aggregate without re-running the transition.
 *
 * The aggregate's `complete()`, `cancel()` and `skip()` all raise events with
 * consumers, so replaying them here would double whatever those consumers do.
 * This is the one place a session's status is written rather than transitioned.
 *
 * `completedAt` follows the status: cancelled, skipped and planned all mean
 * there is no completion moment, and leaving a stale one would show a skipped
 * session with a time it supposedly happened at.
 */
function applyPushedStatus(
  session: Session,
  fields: { status?: string; completedAt?: string | Date | null },
  now: Date,
): void {
  if (!isSessionStatus(fields.status)) return;
  if (session.status === fields.status) return;

  session.status = fields.status;
  session.completedAt =
    fields.status === 'completed' ? (asDate(fields.completedAt) ?? now) : null;
  session.updatedAt = now;
}

function isSessionStatus(value: unknown): value is SessionStatus {
  return (
    value === 'planned' ||
    value === 'completed' ||
    value === 'cancelled' ||
    value === 'skipped'
  );
}

// ------------------------------------------------------------------ programs

/** The fields a client may push on a program row. */
interface PushedProgram {
  title?: string;
  sport?: string;
  weeks?: unknown;
  status?: string;
  /**
   * Carried on the wire and **read by nothing**.
   *
   * Applying a program is `POST /programs/:id/apply`, and the reason it is a
   * command rather than a field is the warning: the apply gathers the sessions
   * it would overwrite and refuses without `force`. A client that could set
   * this date through `/sync` would apply a program with no warning at all,
   * which is FR-008's requirement bypassed by a field on a row. Same shape as
   * `meetings.authoredTimezone`, for the same kind of reason.
   */
  appliedStartDate?: string | null;
  sourceLinkIds?: string[];
}

@Injectable()
export class ProgramSyncAdapter implements SyncableEntity {
  readonly entity = 'programs';
  readonly applyOrder = PROGRAM_APPLY_ORDER;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly programs: ProgramRepository,
  ) {}

  /** Every mirrored field, tombstones included. See the session pull's note. */
  async pull(userId: string, since: Date | null): Promise<unknown[]> {
    const rows = await this.programs.pullSince(userId, since);
    return rows.map((program) => ({
      id: program.id,
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
    }));
  }

  async apply(
    userId: string,
    change: SyncChange,
    now: Date,
  ): Promise<ApplyOutcome> {
    const existing = await this.programs.findById(userId, change.id);

    const verdict = resolveConflict(change, existing, now);
    if (!verdict.accept) {
      return refuse(this.entity, change, verdict.reason, serverRow(existing));
    }

    const fields = change.fields as PushedProgram;

    try {
      if (!existing) {
        const program = Program.create({
          id: change.id,
          userId,
          title: fields.title ?? '',
          sport: fields.sport ?? '',
          source: 'user',
          sourceLinkIds: fields.sourceLinkIds ?? [],
          weeks: pushedWeeks(fields.weeks) ?? [],
          createdAt: change.updatedAt,
        });
        applyPushedProgramStatus(program, fields, now);
        await this.uow.run(() => this.programs.save(program));
        return { applied: true, id: program.id };
      }

      switch (change.op) {
        case 'delete':
          // `status` untouched: `archived` against `active` is the only record
          // of whether the member had retired the plan before deleting it.
          if (!existing.isDeleted) existing.tombstone(now);
          break;
        case 'restore':
          if (existing.isDeleted) existing.restore(now);
          break;
        case 'purge':
          existing.assertPurgeable();
          await this.uow.run(() => this.programs.remove(existing));
          return { applied: true, id: existing.id };
        default:
          existing.edit(
            {
              title: fields.title,
              sport: fields.sport,
              weeks: pushedWeeks(fields.weeks),
            },
            now,
          );
          applyPushedProgramStatus(existing, fields, now);
      }

      await this.uow.run(() => this.programs.save(existing));
      return { applied: true, id: existing.id };
    } catch (error) {
      if (error instanceof ProgramRuleError) {
        return refuse(
          this.entity,
          change,
          error.code === 'not_deleted' ? 'not_deleted' : 'invalid',
          serverRow(existing),
        );
      }
      throw error;
    }
  }
}

/**
 * A pushed program status, written rather than transitioned.
 *
 * Archiving offline is a real case — the programs screen offers it — and
 * `Program.archive()` raises `training.ProgramArchived`. Replaying that here
 * would announce an archive the phone has already applied, so the status is
 * written and the announcement is left to the device that made the decision.
 * What makes this safe rather than a hole is that the materialiser reads
 * `isFilling` off the *document* on every pass: writing the status is the whole
 * of what archiving has to accomplish, and the event only ever told somebody
 * about it.
 */
function applyPushedProgramStatus(
  program: { status: 'active' | 'archived'; updatedAt: Date },
  fields: { status?: string },
  now: Date,
): void {
  if (fields.status !== 'active' && fields.status !== 'archived') return;
  if (program.status === fields.status) return;

  program.status = fields.status;
  program.updatedAt = now;
}

// ------------------------------------------------------------------ workouts

interface PushedWorkout {
  name?: string;
  sport?: string;
  exercises?: unknown;
  tags?: string[];
}

@Injectable()
export class WorkoutSyncAdapter implements SyncableEntity {
  readonly entity = 'workouts';
  readonly applyOrder = WORKOUT_APPLY_ORDER;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly workouts: WorkoutRepository,
  ) {}

  async pull(userId: string, since: Date | null): Promise<unknown[]> {
    const rows = await this.workouts.pullSince(userId, since);
    return rows.map((workout) => ({
      id: workout.id,
      name: workout.name,
      sport: workout.sport,
      exercises: workout.exercises,
      tags: workout.tags,
      createdAt: workout.createdAt,
      updatedAt: workout.updatedAt,
      deletedAt: workout.deletedAt,
    }));
  }

  async apply(
    userId: string,
    change: SyncChange,
    now: Date,
  ): Promise<ApplyOutcome> {
    const existing = await this.workouts.findById(userId, change.id);

    const verdict = resolveConflict(change, existing, now);
    if (!verdict.accept) {
      return refuse(this.entity, change, verdict.reason, serverRow(existing));
    }

    const fields = change.fields as PushedWorkout;

    try {
      if (!existing) {
        const workout = Workout.create({
          id: change.id,
          userId,
          name: fields.name ?? '',
          sport: fields.sport ?? '',
          exercises: pushedExercises(fields.exercises) ?? [],
          tags: fields.tags ?? [],
          createdAt: change.updatedAt,
        });
        await this.uow.run(() => this.workouts.save(workout));
        return { applied: true, id: workout.id };
      }

      switch (change.op) {
        case 'delete':
          if (!existing.isDeleted) existing.tombstone(now);
          break;
        case 'restore':
          if (existing.isDeleted) existing.restore(now);
          break;
        case 'purge':
          existing.assertPurgeable();
          await this.uow.run(() => this.workouts.remove(existing));
          return { applied: true, id: existing.id };
        default:
          existing.edit(
            {
              name: fields.name,
              sport: fields.sport,
              exercises: pushedExercises(fields.exercises),
              tags: fields.tags,
            },
            now,
          );
      }

      await this.uow.run(() => this.workouts.save(existing));
      return { applied: true, id: existing.id };
    } catch (error) {
      if (error instanceof WorkoutRuleError) {
        return refuse(
          this.entity,
          change,
          error.code === 'not_deleted' ? 'not_deleted' : 'invalid',
          serverRow(existing),
        );
      }
      throw error;
    }
  }
}

// ----------------------------------------------------------- athlete profile

/**
 * The athlete profile, as a **patch** rather than a row.
 *
 * One document per member, keyed by their own id, created when they register
 * and never deleted short of the member themselves — so there is no tombstone,
 * no client-minted id, nothing to sweep, and `pull` answers the document or
 * null rather than an array of one.
 *
 * ## There is no conflict check, and that is the design
 *
 * `contracts/sync.md` exempts this entity outright, and the reason is that
 * **the fields a client may patch and the fields the server's own jobs write
 * are disjoint sets**: the member edits their sports and their timetable, and
 * everything downstream of that — the sessions, the alerts, the week — lives in
 * other collections that the materialiser writes. There is no version being
 * competed for, so there is nothing to lose, and a `baseUpdatedAt` comparison
 * would refuse a perfectly good patch because a background pass had touched
 * the row since the phone last pulled it.
 *
 * Which makes the *reporting* rule as important as the acceptance rule: a stale
 * patch is accepted, and must **never** be reported as `stale`. A stale verdict
 * tells the phone to overwrite its copy and retry, and against a rule that was
 * never going to refuse it the phone would retry for ever. The only refusal
 * this adapter has is `invalid`, for a timetable the aggregate will not accept.
 *
 * ## Why it goes through the aggregate rather than straight to the row
 *
 * `chooseSports` and `setSlots` raise `SportsChanged` and `SlotsChanged`, and
 * the materialiser listens to both. A patch that wrote the fields directly
 * would leave a member who moved their Monday session to Tuesday with a
 * timetable that says Tuesday and a fortnight of sessions that still say
 * Monday, until the nightly pass happened to notice — which is the shape of
 * defect this codebase already knows by name.
 */
@Injectable()
export class AthleteProfilePatchAdapter implements SyncablePatch {
  readonly entity = 'athlete_profile';
  readonly applyOrder = ATHLETE_PROFILE_APPLY_ORDER;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly profiles: AthleteProfileRepository,
  ) {}

  async pull(userId: string): Promise<unknown | null> {
    const profile = await this.profiles.find(userId);
    if (!profile) return null;
    return {
      userId: profile.userId,
      sports: profile.sports,
      slots: profile.slots,
      updatedAt: profile.updatedAt,
    };
  }

  async applyPatch(
    userId: string,
    patch: Record<string, unknown>,
    now: Date,
  ): Promise<ApplyOutcome> {
    /*
     * The allowlist is two fields, and everything else the client sends is
     * dropped rather than refused: a newer app version may know about a field
     * this server does not, and refusing the whole patch would block the fields
     * it *does* know — including a timetable, which the materialiser needs to
     * hear about. The same forward-compatibility choice Profile's two adapters
     * make.
     */
    const sports = Array.isArray(patch.sports)
      ? patch.sports.filter((entry): entry is string => typeof entry === 'string')
      : undefined;
    const slots = pushedSlots(patch.slots);

    if (sports === undefined && slots === undefined) {
      return { applied: true, id: userId };
    }

    /*
     * The profile is written from `identity.UserRegistered` and the relay is
     * eventual, so there is a window after registration in which it does not
     * exist. An empty one is created here rather than refusing the patch: the
     * document is keyed by the member's id, so this and the bootstrap converge
     * on one row whichever of them runs first, and a member who set their
     * sports on the plane should not have that lost to a race.
     */
    const profile =
      (await this.profiles.find(userId)) ?? AthleteProfile.empty(userId, now);

    try {
      if (sports !== undefined) profile.chooseSports(sports, now);
      if (slots !== undefined) profile.setSlots(slots, now);
    } catch (error) {
      /*
       * A timetable the aggregate refuses: a weekday that is not a day, a start
       * that is not a wall-clock time, a session longer than six hours, a slot
       * with no sport, or more slots than a week can hold.
       *
       * `invalid`, and the alternative is worth naming because it is the trap
       * this whole entity is shaped around: `stale` would tell the phone to
       * refresh and re-send, and the same bytes would be refused by the same
       * rule for ever. There is no server row to take instead, and the only
       * person who can fix a bad slot is the member.
       */
      if (error instanceof AthleteProfileRuleError) {
        return {
          applied: false,
          rejection: {
            entity: this.entity,
            id: userId,
            reason: 'invalid',
            server: null,
          },
        };
      }
      throw error;
    }

    // Both mutators answer false for a no-op save, and the events are what the
    // transaction exists for — so an unchanged patch writes nothing rather than
    // walking `updatedAt` forward and waking the materialiser for nothing.
    if (profile.pendingEvents.length === 0) {
      return { applied: true, id: userId };
    }

    await this.uow.run(() => this.profiles.save(profile));
    return { applied: true, id: userId };
  }
}

/**
 * A pushed timetable, or `undefined` when the patch did not mention one.
 *
 * The distinction is the whole reason this is a function: `undefined` means
 * "leave the timetable alone", where an empty array means "I have no training
 * slots", and collapsing them would let a patch that changes only the sports
 * erase the member's week. The entries themselves are passed through as they
 * arrive — the aggregate validates every field, and duplicating those rules
 * here would be two places for them to disagree.
 */
function pushedSlots(value: unknown): TrainingSlot[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => {
    const slot = (entry ?? {}) as Partial<TrainingSlot>;
    return {
      id: typeof slot.id === 'string' ? slot.id : newId(),
      weekday: slot.weekday as number,
      start: slot.start as string,
      durationMin: slot.durationMin as number,
      sport: typeof slot.sport === 'string' ? slot.sport : '',
      location: slot.location ?? null,
    };
  });
}

// --------------------------------------------------------------- wire shapes

/**
 * Exercises as they arrive over JSON, settled into the domain's shape — or
 * `undefined` when the push did not carry any.
 *
 * `undefined` rather than `[]` for a missing key, because on an edit the two
 * are opposite statements: "the patch did not mention exercises" must leave the
 * member's session alone, and "the exercises are now empty" must clear it. A
 * function that returned `[]` for both would blank a session on every push that
 * only moved its time.
 *
 * Shared by sessions and workouts, which hold the same `Exercise` — a second
 * copy is how a set logged in a session would come out shaped differently from
 * the same set saved to the library.
 */
function pushedExercises(value: unknown): Exercise[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => {
    const exercise = (entry ?? {}) as Partial<Exercise>;
    return {
      // An exercise with no id is an exercise the logger cannot name, so one is
      // minted rather than the row refused: the id exists for the editor's sake
      // and a client that has not needed one has done nothing wrong.
      id: typeof exercise.id === 'string' ? exercise.id : newId(),
      name: typeof exercise.name === 'string' ? exercise.name : '',
      notes: exercise.notes ?? null,
      mediaRefs: Array.isArray(exercise.mediaRefs)
        ? exercise.mediaRefs.map((ref: MediaRef) => ({ ...ref }))
        : [],
      sets: Array.isArray(exercise.sets)
        ? exercise.sets.map((set: SetEntry) => ({ ...set, done: set.done === true }))
        : [],
    };
  });
}

/**
 * A program's weeks as they arrive over JSON, or `undefined` for a push that
 * did not mention them — the same three-way rule `pushedExercises` explains.
 *
 * The templates are passed through as they arrive because `validatedWeeks` in
 * the aggregate trims, bounds and refuses every field of them. What this does
 * is guarantee the *shapes* are the ones that code can walk: an array where an
 * array is expected, so a malformed push is an `invalid` rejection from a
 * domain rule rather than a `TypeError` from inside a `.map`.
 */
function pushedWeeks(value: unknown): ProgramWeek[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => {
    const week = (entry ?? {}) as { index?: number; sessions?: unknown };
    return {
      index: week.index as number,
      sessions: Array.isArray(week.sessions)
        ? week.sessions.map((raw) => {
            const template = (raw ?? {}) as Record<string, unknown>;
            return {
              templateId:
                typeof template.templateId === 'string'
                  ? template.templateId
                  : newId(),
              weekday:
                typeof template.weekday === 'number' ? template.weekday : null,
              title: typeof template.title === 'string' ? template.title : '',
              focus: typeof template.focus === 'string' ? template.focus : null,
              exercises: (pushedExercises(template.exercises) ?? []).map(
                (exercise) => ({
                  name: exercise.name,
                  notes: exercise.notes,
                  mediaRefs: exercise.mediaRefs,
                  // A template has targets and nothing else: `actual*` on a
                  // template would be a field that can only ever be null, and
                  // a client that sent one has confused a plan with a record.
                  sets: exercise.sets.map((set) => ({
                    targetReps: set.targetReps ?? null,
                    targetWeightKg: set.targetWeightKg ?? null,
                    targetDurationSec: set.targetDurationSec ?? null,
                    targetDistanceM: set.targetDistanceM ?? null,
                  })),
                }),
              ),
            };
          })
        : [],
    };
  });
}

export function asDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

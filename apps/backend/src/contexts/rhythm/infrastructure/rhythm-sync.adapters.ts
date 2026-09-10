import { Injectable } from '@nestjs/common';
import type {
  ApplyOutcome,
  SyncableEntity,
  SyncablePatch,
} from '../../sync/domain/syncable-entity.port.js';
import type { SyncChange } from '../../../shared/persistence/ports/sync-change.js';
import type { Checkin } from '../domain/checkin.aggregate.js';
import type { DailyPlan } from '../domain/daily-plan.aggregate.js';
import type { RhythmState } from '../domain/rhythm-state.aggregate.js';
import {
  CheckinRepository,
  DailyPlanRepository,
  RhythmStateRepository,
} from '../domain/rhythm.repositories.js';

/**
 * The rhythm's three entities on the phone's round trip — **all three
 * pull-only**.
 *
 * ## Why nothing here accepts a push
 *
 * `contracts/sync.md` originally gave `daily_plans` and `checkins` a push of
 * named commands — `{ op: 'confirm' }`, `{ op: 'record' }` — and that would
 * have needed a third protocol beside the row protocol and the patch protocol,
 * because those ops are not among the five the conflict rule branches on. What
 * a third protocol buys is atomicity across entities in one round trip, and
 * neither of these needs it: confirming a plan adds and removes ids *within the
 * plan* and touches no task, and a check-in is a row of its own. So the two
 * writes are REST commands — `POST /rhythm/plans/:date/confirm`, `/skip`, and
 * `POST /rhythm/checkins` — which is also the path a notification action has to
 * use anyway, and the contract has been corrected to say so.
 *
 * They are still here, and still in `pull`, because the phone holds a copy and
 * renders Home from it with the network off. That is the whole point of them.
 *
 * ## A refusal is `invalid`, never `stale`
 *
 * Three times in this file, and it is the same reasoning each time: `stale`
 * tells the phone to overwrite its copy from `server` and retry. Against a rule
 * that is never going to accept the push, it would retry for ever. `invalid`
 * tells it to stop and surface the problem, which is the truth.
 *
 * `rhythm_state` is the one where it matters most. The three claim dates are
 * the server's entire once-a-day guarantee, and a phone that could write them
 * could suppress or re-fire its own member's evening. Refusing loudly makes
 * that a rule rather than an accident of which fields an adapter happened to
 * read.
 *
 * ## Neither row entity carries a tombstone
 *
 * Neither aggregate has a `deletedAt`, and neither is ever deleted
 * individually — they go only when the account does. So the wire carries no
 * `deletedAt` key, and the client's delete-sweep on a full snapshot must not
 * read a missing plan as a deletion. The `_id` is composite and server-shaped
 * (`"<userId>:<YYYY-MM-DD>"`), which is the one place the phone must *not* mint
 * a UUIDv7: the date is the identity, so two devices confirming the same day
 * converge on one row by construction rather than by conflict resolution.
 */

/** After tasks (20), because a plan's snapshot names task ids. */
export const DAILY_PLAN_APPLY_ORDER = 40;
export const CHECKIN_APPLY_ORDER = 41;
export const RHYTHM_STATE_APPLY_ORDER = 42;

@Injectable()
export class DailyPlanSyncAdapter implements SyncableEntity {
  readonly entity = 'daily_plans';
  readonly applyOrder = DAILY_PLAN_APPLY_ORDER;

  constructor(private readonly plans: DailyPlanRepository) {}

  async pull(userId: string, since: Date | null): Promise<unknown[]> {
    const rows = await this.plans.changedSince(userId, since);
    return rows.map(toPlanWire);
  }

  async apply(
    _userId: string,
    change: SyncChange,
    _now: Date,
  ): Promise<ApplyOutcome> {
    return refuse(this.entity, change.id);
  }
}

@Injectable()
export class CheckinSyncAdapter implements SyncableEntity {
  readonly entity = 'checkins';
  readonly applyOrder = CHECKIN_APPLY_ORDER;

  constructor(private readonly checkins: CheckinRepository) {}

  async pull(userId: string, since: Date | null): Promise<unknown[]> {
    const rows = await this.checkins.changedSince(userId, since);
    return rows.map(toCheckinWire);
  }

  async apply(
    _userId: string,
    change: SyncChange,
    _now: Date,
  ): Promise<ApplyOutcome> {
    return refuse(this.entity, change.id);
  }
}

/**
 * `rhythm_state` is a `SyncablePatch` and not a `SyncableEntity`.
 *
 * One singleton row per member, so `pull` returning the row or null is the
 * honest shape; an array of one would be a lie about it, and the phone would
 * have to unwrap a list that can never hold two. Same protocol as `profile`
 * and `preferences`, and for the same reason.
 */
@Injectable()
export class RhythmStateSyncAdapter implements SyncablePatch {
  readonly entity = 'rhythm_state';
  readonly applyOrder = RHYTHM_STATE_APPLY_ORDER;

  constructor(private readonly states: RhythmStateRepository) {}

  async pull(userId: string): Promise<unknown | null> {
    const state = await this.states.find(userId);
    return state ? toStateWire(state) : null;
  }

  async applyPatch(
    userId: string,
    _patch: Record<string, unknown>,
    _now: Date,
  ): Promise<ApplyOutcome> {
    return refuse(this.entity, userId);
  }
}

/** One refusal, three callers, so the reason cannot drift between them. */
function refuse(entity: string, id: string): ApplyOutcome {
  return {
    applied: false,
    rejection: { entity, id, reason: 'invalid' },
  };
}

/**
 * The wire shapes.
 *
 * Written out field by field rather than spread from the aggregate, so that
 * adding a field to the domain is a deliberate decision to publish it. A
 * `{ ...plan }` here would have shipped `pendingEvents` and every private the
 * class ever grows.
 */
function toPlanWire(plan: DailyPlan): Record<string, unknown> {
  return {
    id: plan.id,
    date: plan.date,
    status: plan.status,
    autoConfirmed: plan.autoConfirmed,
    tasks: plan.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      dueAt: task.dueAt,
      deferCount: task.deferCount,
    })),
    training: plan.training,
    workoutLine: plan.workoutLine,
    mealLine: plan.mealLine,
    promptedAt: plan.promptedAt,
    confirmedAt: plan.confirmedAt,
    summarisedAt: plan.summarisedAt,
    briefedAt: plan.briefedAt,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

function toCheckinWire(checkin: Checkin): Record<string, unknown> {
  return {
    id: checkin.id,
    date: checkin.date,
    /*
     * Both of these are sent explicitly, `null` included, and never omitted.
     *
     * `mood: 0` is a member having a terrible day and an absent mood is an
     * unanswered half of the question — two different facts. And the phone
     * upserts, so an omitted key reads as "unchanged": a member who cleared
     * their mood would keep the old one for ever, on every device.
     */
    mood: checkin.mood,
    adhered: checkin.adhered,
    note: checkin.note,
    source: checkin.source,
    createdAt: checkin.createdAt,
    updatedAt: checkin.updatedAt,
  };
}

function toStateWire(state: RhythmState): Record<string, unknown> {
  return {
    // No `userId`: the response is already scoped to the principal, and
    // `profile` and `preferences` omit it for the same reason.
    lastPlanPromptDate: state.lastPlanPromptDate,
    lastEndOfDayDate: state.lastEndOfDayDate,
    lastMorningBriefingDate: state.lastMorningBriefingDate,
    awaitingCheckin: state.awaitingCheckin,
    awaitingSince: state.awaitingSince,
    streak: {
      current: state.streak.current,
      best: state.streak.best,
      lastAdheredDate: state.streak.lastAdheredDate,
    },
    updatedAt: state.updatedAt,
  };
}

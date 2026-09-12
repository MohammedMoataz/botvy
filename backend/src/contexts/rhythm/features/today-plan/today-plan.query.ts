import { Injectable } from '@nestjs/common';
import { localDate } from '../../../../shared/time/time.js';
import type { DailyPlan, PlanStatus } from '../../domain/daily-plan.aggregate.js';
import { MemberSchedulePort } from '../../domain/rhythm.ports.js';
import { DailyPlanRepository } from '../../domain/rhythm.repositories.js';

/**
 * A task as the plan recorded it, flattened for a screen.
 *
 * The same snapshot the aggregate holds, and deliberately no more: the plan is
 * a record of what the member was shown and agreed to, so a task renamed on
 * Thursday must read as its Tuesday title in Tuesday's plan. A view that went
 * and fetched the live task to "correct" the title would make the plans screen
 * a history that rewrites itself.
 *
 * There is no `status` here, and that is a divergence from the SDL rather than
 * an omission — see the note on `PlanTaskType` in `rhythm.resolver.ts`.
 */
export interface PlanTaskView {
  id: string;
  title: string;
  priority: number;
  dueAt: Date | null;
  deferCount: number;
}

export interface PlanTrainingView {
  sessionId: string;
  title: string;
  sport: string;
  startAt: Date;
}

/**
 * One day's plan, as a screen reads it.
 *
 * A DTO and not the aggregate. `DailyPlan` carries `confirm`, `skip`,
 * `redraft` and `markSummarised`, and handing a caller an object with those on
 * it is handing them a way to auto-confirm somebody's evening from a resolver.
 * A read model is not a write model; the mapping below is the boundary.
 */
export interface DailyPlanView {
  date: string;
  status: PlanStatus;
  autoConfirmed: boolean;
  tasks: PlanTaskView[];
  training: PlanTrainingView | null;
  workoutLine: string | null;
  mealLine: string | null;
  /** A code the client renders in the member's own language (FR-014). */
  mealReason: string | null;
  /** The two halves joined, `"Workout: … | Meals: …"` (FR-008). English. */
  dayLine: string;
  promptedAt: Date | null;
  confirmedAt: Date | null;
  summarisedAt: Date | null;
  briefedAt: Date | null;
}

/**
 * Today's plan, on the member's own clock.
 *
 * ## The member's day is resolved here, from their zone, and never from `TZ`
 *
 * `date` is optional and defaults to the local calendar date where the
 * *member* is, resolved through `shared/time` against the zone
 * `MemberSchedulePort` reports — which is Profile's answer, reached through
 * this context's own port rather than by reading Profile's collection.
 * Constitution XI exists because this was got wrong once already: resolving a
 * user-facing time against the API's own zone shifted every extracted reminder
 * by three hours. A member in Cairo asking at 00:30 gets the day that has just
 * begun where they are; a member in Berlin asking at the same instant gets the
 * day that is still yesterday where they are. Both are right, and neither is
 * what the server's own date would have said.
 *
 * ## A member with no plan gets a plan, not a null
 *
 * The contract types this `DailyPlan!`, non-null, and that is the decision
 * rather than a consequence of it. Answering with a shape beats answering with
 * null because *most* members have no row most of the time: a plan is written
 * by the evening touch, so anybody who registered this morning, anybody whose
 * first evening has not arrived, and anybody on the day a gateway was down has
 * no document for today. Null would put a branch for that case in every client
 * — the Home card, the plans screen, the extension side panel — and the branch
 * that gets forgotten renders a crash or an empty screen with no explanation.
 * An empty plan with `status: 'draft'` renders as "nothing planned yet", which
 * is both true and the same code path as a real empty day.
 *
 * The empty answer is *not* persisted. Writing a row to satisfy a read would
 * create a `draft` the tick would then find and treat as an unanswered
 * proposal, and auto-confirm an empty plan the member was never shown.
 */
@Injectable()
export class TodayPlanQueryHandler {
  constructor(
    private readonly plans: DailyPlanRepository,
    private readonly schedules: MemberSchedulePort,
  ) {}

  async handle(
    userId: string,
    date?: string,
    now: Date = new Date(),
  ): Promise<DailyPlanView> {
    const on = date ?? (await memberLocalDate(this.schedules, userId, now));
    const plan = await this.plans.forDate(userId, on);
    return plan ? planView(plan) : emptyPlanView(on);
  }
}

/**
 * The member's local calendar date, or the server's as a last resort.
 *
 * Shared by the three read slices that need "which day is it where they are"
 * — today's plan, tomorrow's draft and the streak's week — because the
 * alternative is three copies of the fallback rule below, and three copies is
 * how two of them end up disagreeing about what an unknown member's day is.
 *
 * The fallback matters more than it looks. `forUsers` returns rows only for
 * members Profile knows, so an id with no profile — a member deleted between
 * the token being issued and the query arriving, or a seeded admin who never
 * completed one — comes back as an empty array. Throwing there would turn a
 * missing profile into a 500 on the Home screen; `localDate(now, 'UTC')`
 * answers with a defensible day instead. It is only wrong by a few hours for
 * somebody we have no zone for, and the read is still a read.
 */
export async function memberLocalDate(
  schedules: MemberSchedulePort,
  userId: string,
  now: Date,
): Promise<string> {
  const [schedule] = await schedules.forUsers([userId]);
  return localDate(now, schedule?.timezone ?? 'UTC');
}

/**
 * Aggregate to DTO, field by field.
 *
 * Written out rather than spread, for the reason the in-memory adapter's
 * snapshot functions are written out: a spread would carry whatever the
 * aggregate gains next — `id`, or a method — into a response shape the
 * contract does not describe, and nothing would fail until a client noticed.
 */
export function planView(plan: DailyPlan): DailyPlanView {
  return {
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
    training: plan.training
      ? {
          sessionId: plan.training.sessionId,
          title: plan.training.title,
          sport: plan.training.sport,
          startAt: plan.training.startAt,
        }
      : null,
    workoutLine: plan.workoutLine,
    mealLine: plan.mealLine,
    mealReason: plan.mealReason,
    dayLine: plan.dayLine,
    promptedAt: plan.promptedAt,
    confirmedAt: plan.confirmedAt,
    summarisedAt: plan.summarisedAt,
    briefedAt: plan.briefedAt,
  };
}

/**
 * The answer for a date nobody has planned.
 *
 * `status: 'draft'` rather than a fourth status such as `absent`, because the
 * clients already branch on the three the contract names and a value outside
 * the enum would be a schema change for a case that means "nothing has
 * happened yet" — which is exactly what `draft` with no tasks and no
 * `promptedAt` already says. The four timestamps being null is what
 * distinguishes it from a real draft: a proposed plan always has `promptedAt`.
 */
export function emptyPlanView(date: string): DailyPlanView {
  return {
    date,
    status: 'draft',
    autoConfirmed: false,
    tasks: [],
    training: null,
    workoutLine: null,
    mealLine: null,
    mealReason: null,
    // The same sentence a plan with neither half composes, rather than an empty
    // string: a day nobody has planned is still a rest day with no meals yet,
    // and a client showing a blank where the line goes would read as a failure.
    dayLine: 'Workout: rest day | Meals: none planned',
    promptedAt: null,
    confirmedAt: null,
    summarisedAt: null,
    briefedAt: null,
  };
}

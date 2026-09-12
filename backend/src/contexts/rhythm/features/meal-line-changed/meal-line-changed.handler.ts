import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { DailyPlanRepository } from '../../domain/rhythm.repositories.js';

interface MealPlanPayload {
  /** The member's own local date, `YYYY-MM-DD`. Nutrition resolves it. */
  date?: string;
  /** Present on `MealPlanReady`. The names joined; may be null. */
  line?: string | null;
  /** Present on `MealPlanWithheld`. One of Nutrition's three **codes**. */
  reason?: string | null;
}

/**
 * Nutrition's meal line, replaced after the plan was already sent.
 *
 * ## This is not the stale-draft saga the phase declined
 *
 * The resemblance is close enough to be worth naming. The blueprint's
 * `TomorrowDraftSaga` marks a draft stale from `TaskScheduled`,
 * `SessionScheduled` and `MealPlanReady`, and P3 does not build it: the
 * end-of-day branch rebuilds an unanswered draft from live data before it
 * auto-confirms, which reaches the same place with one code path instead of
 * three subscriptions and a flag.
 *
 * That rebuild covers everything that changes *before* the plan is set. It
 * covers nothing that changes after — and meals are the one input that
 * routinely does. A member who regenerates their meals at nine in the morning
 * has already had their briefing hours ago; there is no later touch to rebuild
 * anything, and the plan document is what the Home card reads. Without this
 * handler the card would show yesterday's line against today's food until the
 * next evening.
 *
 * So the division is: Nutrition owns the meal half and announces it, and Rhythm
 * composes the sentence. Rhythm does not read a meal collection and does not
 * ask when a plan was generated — constitution IX and constitution I both, and
 * the event is the only way across in any case, since a Mongo context may not
 * open another's collection.
 *
 * ## Nothing raises these events until P8
 *
 * The producer is Nutrition's, and Nutrition is P8. That is deliberate rather
 * than premature: the catalogue's own lesson is that "an event with consumers
 * and no producer is dead documentation" — `profile.ProfileUpdated` sat listed
 * with its reactions spelled out and no phase raising it, and a member who
 * changed time zone kept every alert on the old wall clock. The inverse is the
 * risk here, so this half is written *and specced against a hand-raised event*,
 * and P8's task is a producer with nothing to wire.
 *
 * ## It creates nothing
 *
 * No plan for that date means the member has never been prompted or briefed for
 * it, and the meal line is a decoration on a plan rather than a reason for one
 * to exist. Proposing a plan from here would invent a `daily_plans` row with no
 * tasks, no prompt and no member decision behind it, which the morning briefing
 * would then find and treat as "a plan exists" — skipping the live rebuild that
 * is the whole point of that branch.
 *
 * ## Idempotent because the relay delivers at least once
 *
 * `DailyPlan.setMealLine` returns whether anything moved, and this handler
 * saves only when it did. So a redelivered event writes no row, bumps no
 * `updatedAt`, and — critically — does not push a phantom change down the
 * phone's sync cursor, which pulls by `updatedAt` and would otherwise re-send
 * the plan on every duplicate.
 */
@Injectable()
export class MealLineChangedHandler {
  private readonly logger = new Logger(MealLineChangedHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly plans: DailyPlanRepository,
  ) {}

  async handle(
    event: DomainEvent,
  ): Promise<'updated' | 'unchanged' | 'no-plan'> {
    const userId = event.userId;
    const payload = (event.payload ?? {}) as MealPlanPayload;
    const date = payload.date;

    if (!userId || !date) {
      this.logger.warn(
        `${event.name} ${event.eventId} carries no userId or date; nothing to update`,
      );
      return 'no-plan';
    }

    const plan = await this.plans.forDate(userId, date);
    if (!plan) return 'no-plan';

    const half = halfFrom(event, payload);
    if (!plan.setMealLine(half.line, half.reason, event.occurredAt)) {
      return 'unchanged';
    }

    await this.uow.run(() => this.plans.save(plan));
    return 'updated';
  }
}

/**
 * The two halves, for either event.
 *
 * ## A code, not a sentence
 *
 * P3 stored `"Meals: none planned — <reason>"` into `mealLine` itself, and that
 * was a rendered **English** sentence written into a row an Arabic-reading
 * member syncs. The reason travels as one of Nutrition's three codes and each
 * surface renders it in its own language (FR-014); the phone, the portal and
 * the coach message all say it differently and two of them say it in two
 * languages.
 *
 * ## A withheld day replaces the line rather than leaving the old one standing
 *
 * Which is the whole reason `MealPlanWithheld` is handled here at all. The
 * alternative — ignore it — leaves yesterday's menu on today's card, and the
 * member shops for food the system is no longer suggesting.
 *
 * Switched on the event *name* rather than on which field is present, because
 * `MealPlanReady` with a genuinely null line has to clear the line **and** the
 * reason rather than be read as a withholding with no reason.
 */
function halfFrom(
  event: DomainEvent,
  payload: MealPlanPayload,
): { line: string | null; reason: string | null } {
  if (event.name.endsWith('MealPlanWithheld')) {
    return { line: null, reason: payload.reason?.trim() || null };
  }
  return { line: payload.line ?? null, reason: null };
}

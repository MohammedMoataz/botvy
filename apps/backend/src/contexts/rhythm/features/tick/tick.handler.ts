import { Injectable, Logger } from '@nestjs/common';
import { HeartbeatService } from '../../../../shared/health/heartbeat.service.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import {
  localDate,
  localHhMm,
  wallClockToUtc,
} from '../../../../shared/time/time.js';
import { nextDate } from '../../domain/adherence.js';
import { DailyPlan } from '../../domain/daily-plan.aggregate.js';
import {
  CoachTranscriptPort,
  MemberSchedulePort,
  PlannedTasksPort,
  type MemberSchedule,
} from '../../domain/rhythm.ports.js';
import type { RhythmState, TouchKind } from '../../domain/rhythm-state.aggregate.js';
import {
  DailyPlanRepository,
  RhythmStateRepository,
} from '../../domain/rhythm.repositories.js';
import {
  endOfDayMessage,
  morningBriefingMessage,
  planPromptMessage,
} from '../../domain/touch-message.js';
import { DraftBuilder } from './draft.builder.js';

/** The job name `/health` and the admin overview read. */
export const RHYTHM_TICK_JOB = 'rhythm.tick';

/**
 * How many members are loaded at once.
 *
 * A constant rather than a registry key, deliberately, and the distinction
 * matters: constitution XII asks that anything an *operator* might retune be a
 * setting, and nobody retunes a page size — it is an implementation detail of
 * how this loop reads its own collection, invisible from outside, with no
 * behaviour attached. Changing it changes how many round trips a pass makes and
 * nothing else. A registry entry would be a knob with no meaning to whoever
 * found it.
 *
 * Exported so `prompt-now`, which walks the same collection the same way when
 * an operator runs a touch for everybody, reads this number rather than
 * carrying a second one that would silently disagree with it.
 */
export const PAGE_SIZE = 200;

/** Exactly the shape `contracts/internal.md` names. n8n logs this response. */
export interface TickResult {
  users: number;
  planPrompts: number;
  endOfDay: number;
  morning: number;
  checkins: number;
  ms: number;
}

/**
 * The per-member clock.
 *
 * n8n pulses every five minutes and this decides, for each member, whether
 * *their* local plan-prompt, end-of-day or morning time has arrived. n8n holds
 * no schedule of its own beyond the pulse — constitution II — because a member
 * in Cairo and one in Berlin want the same 22:00 and it is not the same
 * instant, and encoding that in a cron expression means one cron per zone.
 *
 * ## Claim, then send
 *
 * Every touch writes its claim date *before* the work happens, in its own
 * transaction. That ordering is the whole once-a-day guarantee and it does
 * three jobs at once:
 *
 * - **Once a day.** A five-minute tick finds the date already claimed and does
 *   nothing for the rest of the evening.
 * - **Catch-up.** A gateway that was down at 22:00 and comes back at 22:40
 *   still finds 22:00 in the past and the date unclaimed, so it sends — that
 *   evening, once. Come back the next morning instead and the touch is simply
 *   missed, because the rule is "the time has passed *today*", not "the touch
 *   is owed from some previous day".
 * - **No re-fire after a preference change.** The claim is per date, not per
 *   time, so a member who moves their summary from 22:00 to 21:00 after
 *   tonight's has gone out does not get a second one.
 *
 * A crash between the claim and the send loses one touch. That is the trade,
 * chosen knowingly: the other order — send, then claim — loses nothing and
 * sends the same notification every five minutes until the process survives
 * long enough to write, which is the failure a member would actually notice.
 *
 * ## Nobody's evening is skipped because of somebody else's
 *
 * Each member is processed inside a try/catch. A single member with a corrupt
 * preference or an unreachable meal service must not end the pass and take the
 * other four hundred evenings with it — the tick reports the failure through
 * the heartbeat and carries on. That is the opposite of the usual instinct, and
 * it is right here because the unit of work is one member's day.
 */
@Injectable()
export class TickHandler {
  private readonly logger = new Logger(TickHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly states: RhythmStateRepository,
    private readonly plans: DailyPlanRepository,
    private readonly schedules: MemberSchedulePort,
    private readonly tasks: PlannedTasksPort,
    private readonly transcript: CoachTranscriptPort,
    private readonly drafts: DraftBuilder,
    private readonly settings: SettingsService,
    private readonly heartbeats: HeartbeatService,
  ) {}

  async handle(now: Date = new Date()): Promise<TickResult> {
    const started = Date.now();
    const result: TickResult = {
      users: 0,
      planPrompts: 0,
      endOfDay: 0,
      morning: 0,
      checkins: 0,
      ms: 0,
    };

    try {
      let after: string | null = null;
      for (;;) {
        const page = await this.states.page(after, PAGE_SIZE);
        if (page.length === 0) break;

        // One batched read per page rather than two per member. Five hundred
        // members would otherwise be a thousand round trips, and the
        // performance goal is a pass under ten seconds when nobody is due.
        const schedules = await this.schedules.forUsers(
          page.map((state) => state.userId),
        );
        const byUser = new Map(
          schedules.map((schedule) => [schedule.userId, schedule]),
        );

        for (const state of page) {
          const schedule = byUser.get(state.userId);
          if (!schedule) {
            // Unreachable: the adapter answers for every id asked for, falling
            // back to the installation defaults for a member mid-bootstrap.
            // Checked anyway, because the alternative to a missing schedule is
            // reading `undefined.timezone` and losing the whole page.
            this.logger.warn(`no schedule for ${state.userId}; skipped`);
            continue;
          }

          result.users += 1;
          try {
            await this.forMember(state, schedule, now, result);
          } catch (error) {
            this.logger.error(
              `rhythm tick failed for ${state.userId}: ${(error as Error).message}`,
            );
          }
        }

        after = page[page.length - 1]?.userId ?? null;
        if (page.length < PAGE_SIZE) break;
      }

      result.ms = Date.now() - started;
      await this.heartbeats.stamp(RHYTHM_TICK_JOB, true, undefined, result.ms);
      return result;
    } catch (error) {
      result.ms = Date.now() - started;
      await this.heartbeats.stamp(
        RHYTHM_TICK_JOB,
        false,
        (error as Error).message,
        result.ms,
      );
      throw error;
    }
  }

  /** One member's three questions, in the order their day runs. */
  private async forMember(
    state: RhythmState,
    schedule: MemberSchedule,
    now: Date,
    result: TickResult,
  ): Promise<void> {
    const zone = schedule.timezone;
    const today = localDate(now, zone);
    const hhmm = localHhMm(now, zone);

    /*
     * A note on daylight saving, because it needs none of its own code.
     *
     * On a spring-forward day the member's 02:30 never happens. The rule here
     * is "the member's clock now reads at or past their chosen time", so at
     * 03:00 — the first minute that exists — `'03:00' >= '02:30'` is true and
     * the touch fires once, at the first valid moment. On an autumn day the
     * hour repeats and the claim date is what stops the touch firing in both
     * copies of it. Both acceptance scenarios are satisfied by the comparison
     * itself; a DST branch here would be a branch with nothing to do.
     */

    if (this.isDue(state, 'plan', schedule.planTomorrowTime, today, hhmm)) {
      await this.planPrompt(state, schedule, today, now);
      result.planPrompts += 1;
    }

    if (this.isDue(state, 'end_of_day', schedule.endOfDayTime, today, hhmm)) {
      const asked = await this.endOfDay(state, schedule, today, now);
      result.endOfDay += 1;
      if (asked) result.checkins += 1;
    }

    if (
      this.isDue(state, 'morning', schedule.morningBriefingTime, today, hhmm)
    ) {
      await this.morning(state, schedule, today, now);
      result.morning += 1;
    }
  }

  private isDue(
    state: RhythmState,
    kind: TouchKind,
    at: string,
    today: string,
    hhmm: string,
  ): boolean {
    return hhmm >= at && state.isDue(kind, today);
  }

  // ------------------------------------------------------------- the touches

  /*
   * The three touches are `public` and take a `force` flag, and both of those
   * are for `prompt-now` — the operator's "Run" button, which sends a touch
   * regardless of the time of day or of whether today's is already claimed.
   *
   * The alternative was a second copy of each touch inside that handler, and
   * that is the trade being refused here: the end-of-day branch alone rebuilds
   * a draft, decides whether to auto-confirm, respects a member's own
   * confirmation, opens the check-in window and composes a sentence from five
   * inputs. A second copy would agree with this one on the day it was written
   * and drift on the first change to either, and the way that drift shows up is
   * an operator pressing Run to reproduce a member's complaint and being sent a
   * *different* message from the one the member received — which is the one
   * situation where the two must be identical.
   *
   * `force` changes exactly one thing: whether an already-claimed date is a
   * reason to stop. The claim itself is still written, still before the work,
   * and still in its own transaction, so the normal path's claim-then-send
   * ordering — the whole once-a-day and catch-up guarantee — is untouched, and
   * a forced send still leaves the date claimed so the five-minute tick does
   * not send a second copy an hour later.
   */

  /**
   * The evening prompt: propose tomorrow and ask.
   *
   * The draft is stored as tomorrow's plan with `status: draft`, which is what
   * makes the end-of-day branch able to tell "the member never answered" from
   * "the member confirmed" — a proposal held only in a message would leave the
   * summary nothing to auto-confirm.
   */
  async planPrompt(
    state: RhythmState,
    schedule: MemberSchedule,
    today: string,
    now: Date,
    force = false,
  ): Promise<void> {
    const userId = state.userId;
    const tomorrow = nextDate(today);

    const claimed = state.claimPlanPrompt(today, now);
    if (!claimed && !force) return;
    if (claimed) await this.uow.run(() => this.states.save(state));

    const draft = await this.drafts.build(userId, tomorrow, now);
    const existing = await this.plans.forDate(userId, tomorrow);

    // A plan may already exist for tomorrow — the member could have confirmed
    // one from the app this afternoon. Redrafting refuses to touch an answered
    // plan, so their selection survives being prompted about.
    const plan =
      existing ??
      DailyPlan.propose({
        userId,
        date: tomorrow,
        tasks: draft.tasks,
        training: draft.training,
        mealLine: draft.mealLine,
        at: now,
      });
    if (existing) {
      existing.redraft({ ...draft, at: now });
    }

    plan.markPrompted(now);
    await this.uow.run(() => this.plans.save(plan));

    await this.transcript.append({
      userId,
      kind: 'coach',
      touch: 'evening_prompt',
      content: planPromptMessage(plan, schedule.timezone),
      at: now,
    });
  }

  /**
   * The end-of-day touch: set tomorrow, then say what it holds.
   *
   * Rebuilding an unanswered draft from live data before auto-confirming it is
   * the whole reason this phase does not build the blueprint's stale-marking
   * saga: a task created at 21:30 is in the plan that is set at 22:00, by one
   * code path instead of three event subscriptions and a flag. The prompt a
   * member read at 21:00 can be an hour out of date; the summary they receive
   * at 22:00 names the current contents, so what they are *told* is always
   * true.
   *
   * Returns whether the check-in question was asked.
   */
  async endOfDay(
    state: RhythmState,
    schedule: MemberSchedule,
    today: string,
    now: Date,
    force = false,
  ): Promise<boolean> {
    const userId = state.userId;
    const tomorrow = nextDate(today);

    const claimed = state.claimEndOfDay(today, now);
    if (!claimed && !force) return false;
    if (claimed) await this.uow.run(() => this.states.save(state));

    const draft = await this.drafts.build(userId, tomorrow, now);
    let plan = await this.plans.forDate(userId, tomorrow);

    if (!plan) {
      // Nothing was ever proposed — the member registered after their prompt
      // time, or the prompt failed. The plan is still set, because the morning
      // briefing has to have something to read.
      plan = DailyPlan.propose({
        userId,
        date: tomorrow,
        tasks: draft.tasks,
        training: draft.training,
        mealLine: draft.mealLine,
        at: now,
      });
    }

    if (plan.isUnanswered) {
      plan.redraft({ ...draft, at: now });
      plan.confirm({ tasks: plan.tasks, autoConfirmed: true, at: now });
    }
    // A confirmed plan is left exactly as the member left it, and a *skipped*
    // one stays skipped: the status is the record of what they decided, and
    // overwriting it would be the system disagreeing with them about their own
    // evening.

    const checkinAsked = schedule.checkinEnabled;
    if (checkinAsked) state.awaitCheckin(now);

    plan.markSummarised(now, checkinAsked);

    await this.uow.run(async () => {
      await this.plans.save(plan!);
      if (checkinAsked) await this.states.save(state);
    });

    await this.transcript.append({
      userId,
      kind: 'coach',
      content: endOfDayMessage(plan, schedule.timezone, checkinAsked),
      // The discriminator says what the member should *do*, so a summary that
      // carries the check-in question is a `checkin_question` — a connected
      // client routing on `end_of_day_summary` would show it as read-only news
      // and the question would go unanswered.
      touch: checkinAsked ? 'checkin_question' : 'end_of_day_summary',
      at: now,
    });

    return checkinAsked;
  }

  /**
   * The morning briefing: today, as it stands.
   *
   * Built from live data when no plan was confirmed, which is the spec's own
   * requirement — a member who ignores every evening still gets told what their
   * day holds. The tasks come from Planning at *this* moment, so a task
   * completed overnight is not listed as still to do.
   */
  async morning(
    state: RhythmState,
    schedule: MemberSchedule,
    today: string,
    now: Date,
    force = false,
  ): Promise<void> {
    const userId = state.userId;

    const claimed = state.claimMorning(today, now);
    if (!claimed && !force) return;
    if (claimed) await this.uow.run(() => this.states.save(state));

    let plan = await this.plans.forDate(userId, today);

    if (!plan || plan.status === 'skipped') {
      // No confirmed plan, or one the member declined to make. Either way the
      // briefing is about what is actually due, and `carryOverBefore` is
      // omitted: today's briefing is about today, not about yesterday's debts.
      const draft = await this.drafts.build(userId, today);
      plan =
        plan ??
        DailyPlan.propose({
          userId,
          date: today,
          tasks: draft.tasks,
          training: draft.training,
          mealLine: draft.mealLine,
          at: now,
        });
      plan.redraft({ ...draft, at: now });
    } else {
      /*
       * A confirmed plan still needs its snapshot checked against reality, or
       * a task completed overnight is read out as outstanding.
       *
       * **Asked as "which of these are still open", not rebuilt from the draft
       * builder** — which is what this did, and it dropped the member's own
       * choices. `DraftBuilder.build` applies `rhythm.draftTopN` and, without a
       * `carryOverBefore`, omits carried-over tasks entirely; filtering a
       * confirmed plan against its output therefore threw away everything past
       * the top five and every task carried from yesterday. A member who
       * confirmed eight tasks was read four of them, and the plan they had
       * edited by hand was quietly replaced by whatever the algorithm currently
       * preferred.
       *
       * `openBefore` is the right question: still open, and with a moment at or
       * before the end of the member's day. No cap, no draft logic, and
       * anything overdue that they chose to carry is included — which is the
       * point of having carried it.
       */
      const endOfToday = wallClockToUtc(
        `${nextDate(today)}T00:00`,
        schedule.timezone,
      );
      const stillOpen = endOfToday
        ? await this.tasks.openBefore(userId, endOfToday)
        : [];
      const open = new Set(stillOpen.map((task) => task.id));
      plan.tasks = plan.tasks.filter((task) => open.has(task.id));
    }

    plan.markBriefed(now);
    await this.uow.run(() => this.plans.save(plan!));

    await this.transcript.append({
      userId,
      kind: 'coach',
      touch: 'morning_briefing',
      content: morningBriefingMessage(plan, schedule.timezone),
      at: now,
    });
  }

  /**
   * Close a check-in window that has run out.
   *
   * Exposed for the tick's own housekeeping and for the reply-capture guard,
   * which needs the same rule and must not carry a second copy of it. The
   * window length is an operator setting, read here rather than in the domain
   * function that applies it — a domain function that fetched a setting could
   * not be called from a spec without a store.
   */
  async expireStaleCheckin(state: RhythmState, now: Date): Promise<boolean> {
    if (!state.awaitingCheckin) return false;
    const hours = await this.settings.get('rhythm.checkinWindowHours');
    const since = state.awaitingSince?.getTime() ?? 0;
    if (now.getTime() - since < hours * 3_600_000) return false;
    state.resolveCheckin(now);
    await this.uow.run(() => this.states.save(state));
    return true;
  }
}

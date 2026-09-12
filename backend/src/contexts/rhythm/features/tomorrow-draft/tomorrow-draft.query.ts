import { Injectable } from '@nestjs/common';
import { nextDate } from '../../domain/adherence.js';
import { MemberSchedulePort } from '../../domain/rhythm.ports.js';
import { DailyPlanRepository } from '../../domain/rhythm.repositories.js';
import {
  emptyPlanView,
  memberLocalDate,
  planView,
  type DailyPlanView,
} from '../today-plan/today-plan.query.js';

/**
 * Tomorrow's plan, whatever state it is in.
 *
 * A separate slice from `todayPlan` rather than `todayPlan(date: tomorrow)`,
 * because the contract names it separately and the two are read by different
 * screens for different reasons: Home reads today to draw the day, and the
 * "plan tomorrow" card reads this to decide whether there is a proposal
 * awaiting an answer. A client that had to compute tomorrow's date itself
 * would be a client computing a member's midnight on a handset, which is the
 * one calculation that must stay on the server side of `MemberSchedulePort`.
 *
 * "Draft" is the name, not the filter. This answers with the plan for tomorrow
 * whether it is still a draft, already confirmed, or skipped — the card needs
 * `status` to know which of those it is, and filtering to `draft` here would
 * make a confirmed plan indistinguishable from no plan at all, so the card
 * would offer to plan a day the member had already settled.
 *
 * ## Tomorrow is the day after the member's today, computed by the calendar
 *
 * Through `nextDate` on the local date string, not by adding 24 hours to an
 * instant. A spring-forward local day is 23 hours long, so `now + 86_400_000`
 * lands back inside today in a zone that shifted overnight, and the card would
 * offer to plan the day that is already ending.
 */
@Injectable()
export class TomorrowDraftQueryHandler {
  constructor(
    private readonly plans: DailyPlanRepository,
    private readonly schedules: MemberSchedulePort,
  ) {}

  async handle(userId: string, now: Date = new Date()): Promise<DailyPlanView> {
    const tomorrow = nextDate(
      await memberLocalDate(this.schedules, userId, now),
    );
    const plan = await this.plans.forDate(userId, tomorrow);

    // Same reasoning as `todayPlan`: the contract is non-null, and this is the
    // *common* case rather than an edge — before the evening prompt fires there
    // is no document for tomorrow at all, which is most of every day. The card
    // reads an empty plan with a null `promptedAt` as "not proposed yet".
    return plan ? planView(plan) : emptyPlanView(tomorrow);
  }
}

import { Injectable } from '@nestjs/common';
import { DailyPlanRepository } from '../../domain/rhythm.repositories.js';
import {
  planView,
  type DailyPlanView,
} from '../today-plan/today-plan.query.js';

/**
 * A range of days, for the plans screen and the week strip.
 *
 * ## No zone lookup, and that is the difference from `todayPlan`
 *
 * Both ends arrive as `YYYY-MM-DD` — the client asking already knows which
 * days it means, because it drew the calendar the member tapped. Resolving a
 * zone here for symmetry would be a read of Profile on every scroll to answer
 * a question nobody asked: "which days" and "which day is it now" are
 * different questions, and only the second needs a clock. `todayPlan` needs
 * one precisely because its argument is optional.
 *
 * ## Inclusive at both ends, and the sparse answer is the honest one
 *
 * `plans('2026-09-01', '2026-09-07')` returns both the 1st and the 7th.
 * `DailyPlanRepository.between` is documented inclusive and both adapters
 * implement it as `date >= from && date <= to`; a half-open range here would
 * silently drop the last day of every month view.
 *
 * What comes back is only the days that *have* a plan, in date order. Padding
 * the gaps with empty plans would be the wrong call here even though
 * `todayPlan` does exactly that, and the asymmetry is deliberate: a single-day
 * read has one shape the caller must render, so a null forces a branch on
 * every client. A range read is already a list the caller iterates, and the
 * difference between "no evening happened" and "an empty evening happened"
 * is the whole content of a history screen. Filling the gaps would draw a
 * confirmed empty plan for every day before the member joined.
 */
@Injectable()
export class PlansQueryHandler {
  constructor(private readonly plans: DailyPlanRepository) {}

  async handle(
    userId: string,
    from: string,
    to: string,
  ): Promise<DailyPlanView[]> {
    const rows = await this.plans.between(userId, from, to);
    return rows.map(planView);
  }
}

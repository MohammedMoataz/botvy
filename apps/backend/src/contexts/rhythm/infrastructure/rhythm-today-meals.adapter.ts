import { Injectable } from '@nestjs/common';
import { RegenerateTodayHandler } from '../../nutrition/features/regenerate-today/regenerate-today.handler.js';
import { TodayMealsPort, type MealHalf } from '../domain/rhythm.ports.js';

/**
 * The plan's meal half — **P8 replaced the stub, and it was one line**.
 *
 * `NoMealsYet` returned null from P3 to P8 and promised that the phase owning
 * meals would swap the binding without the rhythm moving. Nothing in the rhythm
 * moved: the tick, the draft builder and the three touch sentences have been
 * calling a port all along. What did change is the port's *shape* — a half plus
 * a reason rather than a bare string — because the reason has to reach the
 * member's screen in their own language, which a rendered sentence cannot do.
 *
 * ## It asks a handler, not a query, and that is on purpose
 *
 * `ensure` chooses the day's meals when nothing has chosen them yet, and the
 * evening touch is the moment at which that should happen: a member who has
 * never opened the Nutrition screen still gets food in their briefing, and no
 * nightly job runs over every member on the installation to make it so. The
 * write is Nutrition's decision, argued in `RegenerateTodayHandler` — this
 * adapter only names which question the rhythm is asking.
 *
 * ## A past date answers empty rather than choosing
 *
 * Which the rhythm never asks for, and it matters anyway: `ensure` refuses to
 * build a day behind the member's own today, so a plan rebuilt for a past date
 * — an operator's forced prompt, a replay — cannot rewrite what that day said
 * (FR-011).
 */
@Injectable()
export class NutritionTodayMeals extends TodayMealsPort {
  constructor(private readonly days: RegenerateTodayHandler) {
    super();
  }

  async lineFor(userId: string, date: string): Promise<MealHalf> {
    const half = await this.days.ensure(userId, date);
    return { line: half.line, reason: half.reason };
  }
}

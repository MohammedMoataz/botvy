import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { PlanStatus } from '../../domain/daily-plan.aggregate.js';
import { DailyPlanRepository } from '../../domain/rhythm.repositories.js';
import { PlanNotFound } from '../confirm-plan/confirm-plan.handler.js';

/**
 * Not tonight.
 *
 * Its own slice rather than a flag on `confirm-plan`, because the two are
 * different decisions rather than two values of one: confirming re-reads the
 * member's selection from Planning and stores a snapshot, and skipping stores
 * nothing at all. A shared entry point would carry the whole snapshot path for
 * a request that has no ids in it.
 *
 * `PlanNotFound` is imported from the sibling rather than declared twice, so
 * the controller has one class to translate into a 404 and cannot map one of
 * them and forget the other.
 *
 * ## The drafted contents survive the skip
 *
 * `DailyPlan.skip` keeps the tasks and the training slot and moves only the
 * status, and this handler does not touch them either. The status is the record
 * of what the member decided, and the end-of-day summary still names tomorrow's
 * training from a skipped plan — telling somebody who skipped planning that
 * they have a session at seven is useful, and skipping the plan is not a
 * request to be kept in the dark. Clearing the tasks here would also make a
 * skipped day indistinguishable from an empty one.
 *
 * ## Skipping twice
 *
 * Left idempotent in effect rather than guarded, for the same reason confirming
 * twice is: the status is already `skipped`, `skip` writes it again, and the
 * second `rhythm.PlanSkipped` is safe because consumers are idempotent on
 * `eventId`. A refusal would be a 409 for a member whose phone retried a
 * request that had in fact succeeded.
 */
@Injectable()
export class SkipPlanHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly plans: DailyPlanRepository,
  ) {}

  async handle(
    input: { userId: string; date: string },
    now: Date = new Date(),
  ): Promise<{ date: string; status: PlanStatus }> {
    const plan = await this.plans.forDate(input.userId, input.date);
    if (!plan) throw new PlanNotFound(input.userId, input.date);

    plan.skip(now);
    await this.uow.run(() => this.plans.save(plan));

    return { date: plan.date, status: plan.status };
  }
}

import { Injectable } from '@nestjs/common';
import type { PlanTraining } from '../domain/daily-plan.aggregate.js';
import { NextSessionPort } from '../domain/rhythm.ports.js';

/**
 * Tomorrow's training session — **stubbed until P6 (Training)**.
 *
 * P6 is the phase that owns sessions, and it replaces this binding with an
 * adapter over its own `NextSessionQuery` handler: one line in
 * `rhythm.module.ts`, and every call site here is already correct. Nothing else
 * in the rhythm changes, which is the entire reason this file exists.
 *
 * ## Why a null-returning stub beats a branch in the tick
 *
 * The alternative is an optional dependency and a question inside the tick's
 * loop body: "has Training been built yet?" That question has three costs and
 * no benefit.
 *
 * It would still be there in P9. Nobody deletes a defensive branch once it is
 * written, because deleting it requires being sure it can no longer be false,
 * and the way to be sure is to trace every module — so it stays, and by P9 the
 * tick's loop body carries a question about a context that has existed for
 * three phases.
 *
 * It moves a wiring decision into a hot loop. Whether Training exists is a fact
 * about the module graph, settled once at boot; asking it per member per
 * five-minute pass is asking a constant five hundred times, and the answer
 * cannot differ between two members.
 *
 * And it would be the second place that knows the plan renders without a
 * training slot. The plan already does: the sentence a member reads is built
 * from what is present rather than from a fixed template with a hole in it, and
 * `DailyPlan` treats `training: null` as an ordinary state — `confirm({
 * training: false })` is how a member says there is none tomorrow, so "no
 * session" is a value the aggregate handles rather than an absence the caller
 * has to work around. A stub returning that same value asks nothing new of
 * anybody.
 *
 * The port is bound rather than left unbound because Nest would refuse to boot
 * without it (`UnknownDependenciesException`), and rightly: an unsatisfied
 * dependency is not the same statement as "the answer is nothing yet".
 */
@Injectable()
export class NoTrainingYet extends NextSessionPort {
  async forDate(_userId: string, _date: string): Promise<PlanTraining | null> {
    return null;
  }
}

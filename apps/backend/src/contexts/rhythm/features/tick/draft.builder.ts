import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import type { PlanTask, PlanTraining } from '../../domain/daily-plan.aggregate.js';
import {
  NextSessionPort,
  PlannedTasksPort,
  TodayMealsPort,
} from '../../domain/rhythm.ports.js';

export interface Draft {
  tasks: PlanTask[];
  training: PlanTraining | null;
  mealLine: string | null;
}

/**
 * What a day's proposal is made of.
 *
 * Its own class rather than a method on the tick, because it is called from
 * three places with three different meanings — the evening prompt proposes it,
 * the end-of-day touch *rebuilds* it so a task created at 21:30 is in the plan
 * that is set at 22:00, and the morning branch builds today's from live data
 * when nobody confirmed anything. One builder means those three agree about
 * what "the plan" is; three inline versions is how the summary comes to name a
 * different set from the briefing.
 *
 * ## Where the numbers come from
 *
 * `settings.rhythm.draftTopN` decides how many due tasks the proposal names.
 * A hard-coded five would be a bug by constitution XII: it is exactly the sort
 * of knob an operator retunes once they have watched real members ignore a list
 * of twelve.
 *
 * ## Carry-overs are added in full, and not capped
 *
 * The top-N applies to what is due *tomorrow*. Tasks still open from today are
 * added beside them however many there are, because they are the ones the
 * member has already failed to do — hiding the fourth one is how a task becomes
 * invisible for a week while its carried-over count climbs.
 */
@Injectable()
export class DraftBuilder {
  constructor(
    private readonly tasks: PlannedTasksPort,
    private readonly sessions: NextSessionPort,
    private readonly meals: TodayMealsPort,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Build the proposal for one local date.
   *
   * `carryOverBefore` is the instant "still open" is measured against — the
   * tick knows what time it is, and passing it in is what keeps this class from
   * calling `new Date()` and becoming untestable. Omitting it skips the
   * carry-over list entirely, which is what the morning branch wants: today's
   * briefing is about today, not about yesterday's debts.
   */
  async build(
    userId: string,
    date: string,
    carryOverBefore?: Date,
  ): Promise<Draft> {
    const topN = await this.settings.get('rhythm.draftTopN');

    const [due, training, mealLine] = await Promise.all([
      this.tasks.dueOn(userId, date),
      this.sessions.forDate(userId, date),
      this.meals.lineFor(userId, date),
    ]);

    const chosen = byPriorityThenTime(due).slice(0, topN);

    // The carry-over read is separate rather than part of the `Promise.all`
    // above because it is conditional, and a promise created to be discarded
    // is a query run for nothing on every morning briefing.
    const carried = carryOverBefore
      ? await this.tasks.openBefore(userId, carryOverBefore)
      : [];

    return {
      tasks: dedupeById([...chosen, ...carried]),
      training,
      mealLine,
    };
  }
}

/**
 * Priority first, then the earlier moment.
 *
 * P1 is the highest, so priority sorts ascending — a `b - a` here would put the
 * member's least important task at the top of every evening. Tasks with no time
 * sort last within their priority: an all-day task is not more urgent than one
 * due at nine, and Mongo's own ascending index would put its null first, so the
 * ordering is stated here rather than inherited from whichever adapter answered.
 */
export function byPriorityThenTime(tasks: PlanTask[]): PlanTask[] {
  return [...tasks].sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority;
    const a = left.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const b = right.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (a !== b) return a - b;
    // A stable tie-break, so two tasks at the same minute do not swap places
    // between the prompt at 21:00 and the summary at 22:00 and read as a
    // different plan.
    return left.id.localeCompare(right.id);
  });
}

/**
 * A task can be both due tomorrow and still open today — a repeating task
 * whose previous occurrence was missed is exactly that. Listing it twice would
 * put it in the plan twice and roll it over twice, incrementing `deferCount`
 * by two for one carried day.
 */
function dedupeById(tasks: PlanTask[]): PlanTask[] {
  const seen = new Set<string>();
  const unique: PlanTask[] = [];
  for (const task of tasks) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    unique.push(task);
  }
  return unique;
}

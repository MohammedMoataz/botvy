import { Injectable } from '@nestjs/common';
import type { TaskView } from '../../planning/domain/task-read.repository.js';
import { TasksDueQueryHandler } from '../../planning/features/tasks-due-query/tasks-due.query.js';
import type { PlanTask } from '../domain/daily-plan.aggregate.js';
import { PlannedTasksPort } from '../domain/rhythm.ports.js';

/**
 * The tasks an evening draft is built from — bound to Planning.
 *
 * Same seam as the schedule adapter, and the same rule: this is the one layer
 * allowed to import another context, and it binds to a `*.query.ts` handler,
 * which is Planning's published surface. P2 declared `dueOn` and `openBefore`
 * on that handler *for this caller* — the alternative, a port wired straight to
 * `tasks`, is how two contexts end up holding a key to one collection and the
 * shape of that collection can never be changed again without breaking a phase
 * nobody was looking at.
 *
 * Both methods let Planning resolve the day. `dueOn` takes a `YYYY-MM-DD`
 * string rather than a pair of instants precisely so the definition of
 * "tomorrow" stays in one place: a caller that computed the boundaries itself
 * would have had to decide whose midnight it meant, and it is the server's
 * midnight that once shifted every extracted reminder by three hours.
 * `openBefore` takes an instant, because "still open as of right now" genuinely
 * is one and the tick knows what time it is.
 *
 * ## The mapping is the whole point of this file
 *
 * `TaskView` has eighteen fields — notes, labels, recurrence text, an all-day
 * flag, a status, tombstone timestamps. `PlanTask` has five. Narrowing here
 * rather than passing the view through is what stops Planning's read model
 * becoming part of the rhythm's vocabulary: a `daily_plans` document is a
 * *snapshot of what the member was shown and agreed to*, so a task renamed or
 * deleted tomorrow does not rewrite last Tuesday's plan, and a plan that stored
 * a whole `TaskView` would be storing thirteen fields that go stale with no
 * event that could refresh them.
 *
 * `priority` widens from Planning's `1 | 2 | 3 | 4` to a plain `number`, which
 * is the direction that is safe: the rhythm only ever sorts on it and compares
 * it, and a P5 introduced in Planning would flow through here rather than
 * failing to compile in a context that has no opinion about how many priorities
 * there are.
 *
 * `deferCount` is carried because the evening prompt displays it — "moved twice
 * already" is the sentence that makes a member deal with a task instead of
 * deferring it a third time — and it is the one field here whose value comes
 * from Planning's rollover rather than from the member.
 */
@Injectable()
export class PlanningPlannedTasks extends PlannedTasksPort {
  constructor(private readonly tasks: TasksDueQueryHandler) {
    super();
  }

  async dueOn(userId: string, date: string): Promise<PlanTask[]> {
    const views = await this.tasks.dueOn(userId, date);
    return views.map(toPlanTask);
  }

  async openBefore(userId: string, before: Date): Promise<PlanTask[]> {
    const views = await this.tasks.openBefore(userId, before);
    return views.map(toPlanTask);
  }
}

/**
 * Eighteen fields down to five.
 *
 * `dueAt` stays nullable: a task with no time is a real task — "buy milk, some
 * time tomorrow" — and the draft builder sorts those after the timed ones
 * rather than pretending they are due at midnight.
 */
function toPlanTask(view: TaskView): PlanTask {
  return {
    id: view.id,
    title: view.title,
    priority: view.priority,
    dueAt: view.dueAt,
    deferCount: view.deferCount,
  };
}

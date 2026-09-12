import { Injectable, Logger } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { PlanStatus, PlanTask } from '../../domain/daily-plan.aggregate.js';
import { PlannedTasksPort } from '../../domain/rhythm.ports.js';
import { DailyPlanRepository } from '../../domain/rhythm.repositories.js';
import { byPriorityThenTime } from '../tick/draft.builder.js';

/**
 * There is no plan for that date.
 *
 * Its own class rather than a `null` return, because the two callers want
 * different things from the fact: the controller turns it into a 404, and a
 * spec asserting "confirming a date nobody proposed is refused" needs something
 * to assert on that is not the absence of a side effect.
 */
export class PlanNotFound extends Error {
  readonly code = 'plan_not_found';
  constructor(userId: string, date: string) {
    super(`No plan for ${userId} on ${date}.`);
    this.name = 'PlanNotFound';
  }
}

export interface ConfirmPlanInput {
  userId: string;
  /** The member's own local date, `YYYY-MM-DD`. Never the server's. */
  date: string;
  taskIds: string[];
  /** `false` clears the training slot the draft proposed; `undefined` leaves it. */
  training?: boolean;
}

export interface ConfirmedPlan {
  date: string;
  status: PlanStatus;
  taskIds: string[];
  training: boolean;
  autoConfirmed: boolean;
}

/**
 * The member answers the evening prompt: these tasks, and yes or no to training.
 *
 * ## The client sends ids; the titles are read fresh from Planning
 *
 * `rest-commands.md` gives the body as `{ taskIds, training? }` and this
 * handler takes it literally. The plan stores a *snapshot* — title, priority,
 * `dueAt`, `deferCount` — because a task renamed on Thursday must not rewrite
 * Tuesday's plan, and the temptation is therefore to let the client send the
 * snapshot it is already holding on screen. That would be a hole with a
 * member's name on it: the snapshot is what they are later shown as "what you
 * agreed to", so accepting a client-supplied title lets a client write
 * arbitrary text into its own plan and have Botvy read it back as its own
 * words. Ids in, snapshot re-read through `PlannedTasksPort`.
 *
 * It is also simply more correct. The draft a member is answering can be an
 * hour old — the prompt goes out at 21:00 and the sheet may be opened at 21:50
 * — so re-reading means a task retitled or re-prioritised in between is stored
 * as it is now rather than as it was displayed.
 *
 * ## The candidate pool is exactly the draft's pool
 *
 * Tasks due on that date, plus the still-open carry-overs: the same pair of
 * reads `DraftBuilder` makes. Not `DraftBuilder` itself, deliberately — that
 * applies `settings.rhythm.draftTopN`, and a cap belongs on what Botvy
 * *proposes*, never on what a member chooses. Running the member's selection
 * through a top-five would silently drop their sixth task.
 *
 * ## An id outside the pool is dropped, not refused
 *
 * A 400 for one stale id would fail the whole confirmation and lose the other
 * three tasks with it, and the member would be looking at a sheet that was
 * accurate when it was drawn — a task completed or deleted in the intervening
 * hour is an ordinary thing, not a client bug. Dropping is also what makes an
 * id belonging to somebody else a non-event: the pool is read for this
 * `userId`, so a foreign id is simply not in it and cannot enter the plan.
 *
 * ## Confirming twice
 *
 * Idempotent in effect rather than by a guard. The pool is re-read, the same
 * ids resolve to the same snapshot, and `confirm` writes the same values, so
 * the second call leaves the document where the first did. A second
 * `rhythm.PlanConfirmed` is raised, and that is correct rather than merely
 * tolerated: consumers are idempotent on `eventId`, and refusing an
 * already-confirmed plan would break the member who edits their selection twice
 * before bed.
 */
@Injectable()
export class ConfirmPlanHandler {
  private readonly logger = new Logger(ConfirmPlanHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly plans: DailyPlanRepository,
    private readonly tasks: PlannedTasksPort,
  ) {}

  async handle(
    input: ConfirmPlanInput,
    now: Date = new Date(),
  ): Promise<ConfirmedPlan> {
    const plan = await this.plans.forDate(input.userId, input.date);
    if (!plan) throw new PlanNotFound(input.userId, input.date);

    const chosen = await this.snapshot(
      input.userId,
      input.date,
      input.taskIds,
      now,
    );

    const dropped = input.taskIds.length - chosen.length;
    if (dropped > 0) {
      this.logger.log(
        `${input.userId} confirmed ${input.date} with ${dropped} id(s) no longer theirs or no longer open`,
      );
    }

    plan.confirm({ tasks: chosen, training: input.training, at: now });
    await this.uow.run(() => this.plans.save(plan));

    return {
      date: plan.date,
      status: plan.status,
      taskIds: plan.tasks.map((task) => task.id),
      training: plan.training !== null,
      autoConfirmed: plan.autoConfirmed,
    };
  }

  /**
   * The chosen ids, as Planning describes them right now.
   *
   * Ordered by `byPriorityThenTime` rather than by the order the ids arrived,
   * so the summary the member reads at 22:00 lists the same tasks in the same
   * order as the prompt they answered at 21:00 — a list that reshuffles between
   * two messages reads as a different plan.
   */
  private async snapshot(
    userId: string,
    date: string,
    taskIds: string[],
    now: Date,
  ): Promise<PlanTask[]> {
    if (taskIds.length === 0) return [];

    const [due, carried] = await Promise.all([
      this.tasks.dueOn(userId, date),
      this.tasks.openBefore(userId, now),
    ]);

    // A task can be both due on that date and still open from today — a
    // repeating task whose previous occurrence was missed is exactly that — so
    // the pool is keyed by id. Without it the member's one selection would
    // enter the plan twice and be rolled over twice, incrementing `deferCount`
    // by two for one carried day.
    const pool = new Map<string, PlanTask>();
    for (const task of [...due, ...carried]) {
      if (!pool.has(task.id)) pool.set(task.id, task);
    }

    const wanted = new Set(taskIds);
    return byPriorityThenTime(
      [...pool.values()].filter((task) => wanted.has(task.id)),
    );
  }
}

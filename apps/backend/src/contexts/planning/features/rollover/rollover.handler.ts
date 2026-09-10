import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { TaskRepository } from '../../domain/task.repository.js';

export interface RolloverResult {
  moved: string[];
  /** Ids asked for that this member does not own, or that are no longer open. */
  skipped: string[];
}

/**
 * A set of tasks carried to another day, at the daily rhythm's request.
 *
 * It exists as its own slice because P3 needs to move a list in one transaction
 * — the evening prompt offers "carry these four over" and the member says yes
 * once — where a loop of individual defer calls would be four transactions with
 * four chances to half-succeed.
 *
 * What it very deliberately does *not* do is move `dueAt` itself. It calls the
 * same `defer` method on the same aggregate that the member's own swipe calls,
 * so `deferCount`, `deferredFrom` and `TaskDeferred` come out identical
 * whichever hand moved the task. The count is a property of deferring, not of
 * the nightly job; a rollover that wrote the date directly would leave the
 * evening prompt unable to say "carried over ×3" about the very tasks it had
 * spent a week carrying over.
 */
@Injectable()
export class RolloverHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tasks: TaskRepository,
  ) {}

  async handle(
    userId: string,
    ids: string[],
    toDate: Date,
    at: Date = new Date(),
  ): Promise<RolloverResult> {
    if (ids.length === 0) return { moved: [], skipped: [] };

    const found = await this.tasks.findMany(userId, ids);
    const byId = new Map(found.map((task) => [task.id, task]));

    const moved: string[] = [];
    const skipped: string[] = [];

    await this.uow.run(async () => {
      for (const id of ids) {
        const task = byId.get(id);
        // An id this member no longer has open is skipped rather than refused:
        // the rhythm builds its list from a draft that may be an hour old, and
        // one task completed in between should not abandon the other three.
        if (!task || task.isDeleted || task.status !== 'open') {
          skipped.push(id);
          continue;
        }
        task.defer(toDate, at);
        await this.tasks.save(task);
        moved.push(id);
      }
    });

    return { moved, skipped };
  }
}

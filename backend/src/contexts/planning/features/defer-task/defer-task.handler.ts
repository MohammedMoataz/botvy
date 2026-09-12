import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { TaskRepository } from '../../domain/task.repository.js';
import { TaskNotFound } from '../update-task/update-task.handler.js';

/**
 * "Not today."
 *
 * Distinct from an edit that happens to move `dueAt`, and the distinction is
 * the count. Deferring records that the member pushed this task rather than
 * doing it, and how many times — which is what lets the evening prompt say
 * "this has been carried over three times", the sentence that makes somebody
 * either do the thing or admit they are not going to.
 *
 * The nightly rollover comes through the same aggregate method, so a task the
 * rhythm carried over is counted identically to one the member pushed. That is
 * deliberate: from the member's point of view both are the task not getting
 * done, and a count that only recorded the manual ones would flatter them.
 */
@Injectable()
export class DeferTaskHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tasks: TaskRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    toDate: Date,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date; deferCount: number }> {
    const task = await this.tasks.findById(userId, id);
    if (!task) throw new TaskNotFound(id);

    task.defer(toDate, at);
    await this.uow.run(() => this.tasks.save(task));
    return { updatedAt: task.updatedAt, deferCount: task.deferCount };
  }
}

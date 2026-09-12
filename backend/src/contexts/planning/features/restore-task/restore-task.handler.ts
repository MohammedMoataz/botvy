import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { TaskRepository } from '../../domain/task.repository.js';
import { TaskNotFound } from '../update-task/update-task.handler.js';

/**
 * Back from the Deleted view, with its status exactly as it was.
 *
 * Restoring a completed task gives back a completed task. That reads oddly
 * until you consider the alternative: a restore that reopened everything would
 * make the Deleted view a trap, because recovering something you had finished
 * would silently put it back on your list of things to do.
 */
@Injectable()
export class RestoreTaskHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tasks: TaskRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date }> {
    const task = await this.tasks.findById(userId, id);
    if (!task) throw new TaskNotFound(id);
    if (!task.isDeleted) return { updatedAt: task.updatedAt };

    task.restore(at);
    await this.uow.run(() => this.tasks.save(task));
    return { updatedAt: task.updatedAt };
  }
}

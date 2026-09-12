import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { TaskRepository } from '../../domain/task.repository.js';
import { TaskNotFound } from '../update-task/update-task.handler.js';

/**
 * Un-ticked.
 *
 * Raises `TaskScheduled` rather than an event of its own, because that is the
 * event whose meaning is "this task now wants its alerts planned" — and a
 * reopened task does. Adding a `TaskReopened` name whose only handler did
 * exactly what the `TaskScheduled` handler already does would be two names for
 * one reaction, which is how an event catalogue starts to lie.
 */
@Injectable()
export class ReopenTaskHandler {
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

    task.reopen(at);
    await this.uow.run(() => this.tasks.save(task));
    return { updatedAt: task.updatedAt };
  }
}

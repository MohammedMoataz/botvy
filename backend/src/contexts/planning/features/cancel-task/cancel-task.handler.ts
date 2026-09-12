import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { TaskRepository } from '../../domain/task.repository.js';
import { TaskNotFound } from '../update-task/update-task.handler.js';

/**
 * Not going to happen.
 *
 * A third status rather than a delete, because "I decided against this" is a
 * different fact from "I did it" and from "get it off my screen". The member
 * can see in the Deleted view which of their removed tasks they had cancelled,
 * which is only possible because neither cancelling nor deleting overwrites the
 * other's field.
 */
@Injectable()
export class CancelTaskHandler {
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

    task.cancel(at);
    await this.uow.run(() => this.tasks.save(task));
    return { updatedAt: task.updatedAt };
  }
}

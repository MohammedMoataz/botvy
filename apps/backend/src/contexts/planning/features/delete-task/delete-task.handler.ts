import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { TaskRepository } from '../../domain/task.repository.js';
import { TaskNotFound } from '../update-task/update-task.handler.js';

/**
 * Off the member's screen, and **nothing else**.
 *
 * A tombstone rather than a row removal, for two independent reasons that
 * happen to want the same thing:
 *
 * - *Sync.* A delta pull lists what changed; a row that simply vanished would
 *   never appear in one, so the deletion would reach no other device. The
 *   tombstone is how a delete travels.
 * - *The member.* The Deleted view exists so somebody can find the thing they
 *   removed by accident, and see whether they had actually finished it.
 *
 * Which is why the status is untouched. It is the only record of whether the
 * task was completed, cancelled or never dealt with, and a delete that "tidied"
 * it would destroy the only copy of that fact — the Deleted view would then be
 * a list of tasks with nothing to say about any of them.
 */
@Injectable()
export class DeleteTaskHandler {
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

    // Already a tombstone: answer with what is there rather than moving the
    // deletion time. A repeated delete from a retrying client must not keep
    // pushing the purge horizon further out.
    if (task.isDeleted) return { updatedAt: task.updatedAt };

    task.tombstone(at);
    await this.uow.run(() => this.tasks.save(task));
    return { updatedAt: task.updatedAt };
  }
}

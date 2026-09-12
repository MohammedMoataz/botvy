import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { LabelRepository } from '../../domain/label.repository.js';
import { TaskRepository } from '../../domain/task.repository.js';
import { TaskNotFound } from '../update-task/update-task.handler.js';

/**
 * Erased. Two ways in, and they are different operations wearing one name.
 *
 * `handle` is the member emptying their own Deleted view, one row at a time. It
 * is guarded: a purge of something that is not a tombstone is refused, because
 * erasing a live row is data loss dressed as housekeeping and a client asking
 * for it has a bug.
 *
 * `purgeTombstones` is the command the notification sweep dispatches over the
 * `CommandBus`. The sweep used to delete these rows itself, reaching into two
 * other contexts' collections to do it; it now asks, and this is the handler
 * that answers for Planning's own two. The count it returns is what the sweep
 * reports as `purged` — a number about rows this context deleted, reported by
 * the context that deleted them.
 */
@Injectable()
export class PurgeTaskHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tasks: TaskRepository,
    private readonly labels: LabelRepository,
  ) {}

  async handle(userId: string, id: string): Promise<void> {
    const task = await this.tasks.findById(userId, id);
    if (!task) throw new TaskNotFound(id);

    // Throws `TaskRuleError('not_deleted')`, which the sync facade turns into
    // the `not_deleted` rejection and the controller into a 409. One rule, one
    // vocabulary, whichever door the request came through.
    task.assertPurgeable();
    await this.uow.run(() => this.tasks.remove(task));
  }

  /**
   * Everything tombstoned before the horizon, across both of this context's
   * collections. Unscoped when the sweep is doing its nightly pass; scoped when
   * one member is being cleaned up.
   */
  async purgeTombstones(before: Date, userId?: string): Promise<number> {
    return this.uow.run(async () => {
      const tasks = await this.tasks.purgeTombstonesBefore(before, userId);
      const labels = await this.labels.purgeTombstonesBefore(before, userId);
      return tasks + labels;
    });
  }
}

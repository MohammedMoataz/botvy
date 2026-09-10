import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { LabelRepository } from '../../domain/label.repository.js';
import { TaskRepository } from '../../domain/task.repository.js';

/**
 * Removes every task and label a deleted member had.
 *
 * Reacts to `identity.UserDeleted`, which crosses two stores — Identity is on
 * PostgreSQL and this context is on MongoDB, so no transaction can span them
 * and the event is the only way across.
 *
 * **Hard deletes, not tombstones.** Everywhere else in this context a delete
 * is a tombstone, because a tombstone is how a deletion reaches the member's
 * other devices and because the Deleted view exists to show them what they
 * removed. Neither reason survives the account going away: there is no device
 * left to tell, and no member left to show. "Deleted" here has to mean gone.
 *
 * Idempotent, because the relay delivers at least once: two deliveries collapse
 * to one purge and the second reports nothing rather than failing.
 */
@Injectable()
export class PlanningPurgeOnDeletedHandler {
  private readonly logger = new Logger(PlanningPurgeOnDeletedHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly tasks: TaskRepository,
    private readonly labels: LabelRepository,
  ) {}

  async handle(event: DomainEvent): Promise<'purged' | 'nothing-to-do'> {
    const userId = event.userId;
    if (!userId) {
      this.logger.warn(
        `${event.name} ${event.eventId} carries no userId; nothing to purge`,
      );
      return 'nothing-to-do';
    }

    const [tasks, labels] = await this.uow.run(async () => {
      // Tasks before labels, mirroring the sync facade's apply order for the
      // same reason: a task carries a snapshot of its label. Nothing observes
      // the intermediate state inside one transaction, but a future reader
      // looking for the dependency direction should find one answer, not two.
      const removedTasks = await this.tasks.removeAllFor(userId);
      const removedLabels = await this.labels.removeAllFor(userId);
      return [removedTasks, removedLabels];
    });

    if (tasks === 0 && labels === 0) return 'nothing-to-do';

    this.logger.log(
      `purged ${tasks} task(s) and ${labels} label(s) for ${userId}`,
    );
    return 'purged';
  }
}

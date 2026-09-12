import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { ReminderRepository } from '../../domain/reminder.repository.js';

/**
 * Removes every reminder a deleted member had, tombstones included.
 *
 * Hard deletes for the same reason as Planning's: a tombstone exists to reach
 * the member's other devices and to fill their Deleted view, and an account
 * that is gone has neither. Leaving them would also leave rows the tombstone
 * purge never reaches, because that sweep is scoped by a horizon rather than by
 * whether the member still exists.
 *
 * Idempotent on re-delivery.
 */
@Injectable()
export class RemindersPurgeOnDeletedHandler {
  private readonly logger = new Logger(RemindersPurgeOnDeletedHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly reminders: ReminderRepository,
  ) {}

  async handle(event: DomainEvent): Promise<'purged' | 'nothing-to-do'> {
    const userId = event.userId;
    if (!userId) {
      this.logger.warn(
        `${event.name} ${event.eventId} carries no userId; nothing to purge`,
      );
      return 'nothing-to-do';
    }

    const removed = await this.uow.run(() =>
      this.reminders.removeAllFor(userId),
    );
    if (removed === 0) return 'nothing-to-do';

    this.logger.log(`purged ${removed} reminder(s) for ${userId}`);
    return 'purged';
  }
}

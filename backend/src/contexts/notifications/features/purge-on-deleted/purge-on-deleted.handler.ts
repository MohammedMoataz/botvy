import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { AlertRepository } from '../../domain/alert.repository.js';

/**
 * Removes every alert planned for a deleted member.
 *
 * The most urgent of the four purge handlers, because this is the one whose
 * omission would *do* something rather than merely leave rows behind: an alert
 * that survives the account is an alert the sweep will happily deliver, so a
 * member who deleted their account would keep receiving notifications from it.
 * The push token is Identity's and goes with the account, so in practice the
 * send would fail — but relying on a failure elsewhere to prevent a
 * notification is not a design, it is a coincidence.
 *
 * Sent alerts go too, which is the one place this context deletes history. A
 * sent alert is the record that the member was told something, and that record
 * is *about* a member who has asked to be forgotten.
 *
 * Idempotent on re-delivery.
 */
@Injectable()
export class NotificationsPurgeOnDeletedHandler {
  private readonly logger = new Logger(NotificationsPurgeOnDeletedHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly alerts: AlertRepository,
  ) {}

  async handle(event: DomainEvent): Promise<'purged' | 'nothing-to-do'> {
    const userId = event.userId;
    if (!userId) {
      this.logger.warn(
        `${event.name} ${event.eventId} carries no userId; nothing to purge`,
      );
      return 'nothing-to-do';
    }

    const removed = await this.uow.run(() => this.alerts.removeAllFor(userId));
    if (removed === 0) return 'nothing-to-do';

    this.logger.log(`purged ${removed} alert(s) for ${userId}`);
    return 'purged';
  }
}

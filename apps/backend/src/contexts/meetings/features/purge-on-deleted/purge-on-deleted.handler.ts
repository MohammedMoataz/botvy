import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import {
  CalendarEventRepository,
  MeetingRepository,
} from '../../domain/meetings.repositories.js';

/**
 * Removes every meeting and personal event a deleted member had.
 *
 * Reacts to `identity.UserDeleted`, which crosses two stores — Identity is on
 * PostgreSQL and this context is on MongoDB, so no transaction can span them and
 * the event is the only way across.
 *
 * **Hard deletes, not tombstones.** Everywhere else in this context a delete is
 * a tombstone, because a tombstone is how a deletion reaches the member's other
 * devices and because the Deleted view exists to show them what they removed.
 * Neither reason survives the account going away: there is no device left to
 * tell, and no member left to show. "Deleted" here has to mean gone.
 *
 * Idempotent, because the relay delivers at least once: two deliveries collapse
 * to one purge and the second reports nothing rather than failing.
 */
@Injectable()
export class MeetingsPurgeOnDeletedHandler {
  private readonly logger = new Logger(MeetingsPurgeOnDeletedHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly meetings: MeetingRepository,
    private readonly events: CalendarEventRepository,
  ) {}

  async handle(event: DomainEvent): Promise<'purged' | 'nothing-to-do'> {
    const userId = event.userId;
    if (!userId) {
      this.logger.warn(
        `${event.name} ${event.eventId} carries no userId; nothing to purge`,
      );
      return 'nothing-to-do';
    }

    const [meetings, calendarEvents] = await this.uow.run(async () => {
      const removedMeetings = await this.meetings.removeAllFor(userId);
      const removedEvents = await this.events.removeAllFor(userId);
      return [removedMeetings, removedEvents];
    });

    if (meetings === 0 && calendarEvents === 0) return 'nothing-to-do';

    this.logger.log(
      `purged ${meetings} meeting(s) and ${calendarEvents} calendar event(s) for ${userId}`,
    );
    return 'purged';
  }
}

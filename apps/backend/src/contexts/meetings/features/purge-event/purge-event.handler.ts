import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { CalendarEventRepository } from '../../domain/meetings.repositories.js';
import { CalendarEventNotFound } from '../update-event/update-event.handler.js';

/**
 * A personal event erased, one row at a time, by the member.
 *
 * Guarded the same way a meeting's purge is: a purge of a live row is refused
 * with `CalendarEventRuleError('not_deleted')`, a 409 at the edge. The horizon
 * sweep's half of the job lives in `PurgeMeetingHandler.purgeTombstones`, which
 * covers both of this context's collections in one transaction — so there is one
 * caller for the sweep to bind rather than two that could drift apart.
 */
@Injectable()
export class PurgeCalendarEventHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly events: CalendarEventRepository,
  ) {}

  async handle(userId: string, id: string): Promise<void> {
    const event = await this.events.findById(userId, id);
    if (!event) throw new CalendarEventNotFound(id);

    event.assertPurgeable();
    await this.uow.run(() => this.events.remove(event));
  }
}

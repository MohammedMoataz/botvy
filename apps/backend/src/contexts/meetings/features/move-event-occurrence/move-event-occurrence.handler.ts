import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { CalendarEventRepository } from '../../domain/meetings.repositories.js';
import { CalendarEventNotFound } from '../update-event/update-event.handler.js';

/**
 * One occurrence of a repeating event moved (FR-011).
 *
 * No length on the override, unlike a meeting's move: an event's window is
 * `startAt` to `endAt` and the expander derives its length from that, so the
 * moved occurrence keeps the series' own span. A member who wants a different
 * span for one date is describing a different event.
 */
@Injectable()
export class MoveCalendarEventOccurrenceHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly events: CalendarEventRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    originalStart: Date,
    startAt: Date,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date }> {
    const event = await this.events.findById(userId, id);
    if (!event) throw new CalendarEventNotFound(id);

    event.moveOccurrence(originalStart, startAt, at);
    await this.uow.run(() => this.events.save(event));
    return { updatedAt: event.updatedAt };
  }
}

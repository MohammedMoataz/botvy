import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { CalendarEventRepository } from '../../domain/meetings.repositories.js';
import { CalendarEventNotFound } from '../update-event/update-event.handler.js';

/**
 * "Not this year." (FR-011)
 *
 * A repeating personal event behaves exactly as a repeating meeting does, which
 * is why this handler is four lines around the same `skipInRule` the meeting's
 * skip uses. One implementation of the exception model, two aggregates that
 * hold it — a second copy is how a birthday skipped one year would come out
 * differently from a meeting skipped one week.
 */
@Injectable()
export class SkipCalendarEventOccurrenceHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly events: CalendarEventRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    originalStart: Date,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date }> {
    const event = await this.events.findById(userId, id);
    if (!event) throw new CalendarEventNotFound(id);

    event.skipOccurrence(originalStart, at);
    await this.uow.run(() => this.events.save(event));
    return { updatedAt: event.updatedAt };
  }
}

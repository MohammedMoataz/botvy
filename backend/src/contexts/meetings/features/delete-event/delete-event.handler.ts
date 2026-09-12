import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { CalendarEventRepository } from '../../domain/meetings.repositories.js';
import { CalendarEventNotFound } from '../update-event/update-event.handler.js';

/**
 * A personal event off the member's screen, undoably (FR-013).
 *
 * A tombstone, for the same two reasons a meeting's delete is one: a deletion
 * only travels to another device as a tombstone, and the undo window is the
 * platform's. An event has no status to leave alone, which is the whole of the
 * difference from a meeting's delete.
 */
@Injectable()
export class DeleteCalendarEventHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly events: CalendarEventRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date }> {
    const event = await this.events.findById(userId, id);
    if (!event) throw new CalendarEventNotFound(id);

    // A retried delete must not push the purge horizon further out.
    if (event.isDeleted) return { updatedAt: event.updatedAt };

    event.tombstone(at);
    await this.uow.run(() => this.events.save(event));
    return { updatedAt: event.updatedAt };
  }
}

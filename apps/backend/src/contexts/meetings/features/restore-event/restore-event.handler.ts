import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { CalendarEventRepository } from '../../domain/meetings.repositories.js';
import { CalendarEventNotFound } from '../update-event/update-event.handler.js';

/** Back from the Deleted view. Nothing else about the event changes. */
@Injectable()
export class RestoreCalendarEventHandler {
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
    if (!event.isDeleted) return { updatedAt: event.updatedAt };

    event.restore(at);
    await this.uow.run(() => this.events.save(event));
    return { updatedAt: event.updatedAt };
  }
}

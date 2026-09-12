import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { CalendarEventPatch } from '../../domain/calendar-event.aggregate.js';
import { CalendarEventRepository } from '../../domain/meetings.repositories.js';

export class CalendarEventNotFound extends Error {
  constructor(id: string) {
    super(`no calendar event ${id}`);
  }
}

/**
 * An edit to a personal event.
 *
 * No `force` and no orphan check, which is the one place an event's series edit
 * differs from a meeting's — and it is a difference in the *aggregate*, not
 * here: `CalendarEvent.edit` replaces the recurrence outright. Whether that
 * should warn about an orphaned override the way a meeting does is a question
 * for the phase that gives events a repeat picker; this slice does not answer
 * it on the aggregate's behalf.
 */
@Injectable()
export class UpdateCalendarEventHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly events: CalendarEventRepository,
    private readonly member: MemberContextPort,
  ) {}

  async handle(
    userId: string,
    id: string,
    patch: CalendarEventPatch,
  ): Promise<{ changed: string[]; updatedAt: Date }> {
    const event = await this.events.findById(userId, id);
    if (!event) throw new CalendarEventNotFound(id);

    const { timezone } = await this.member.clock(userId);
    const changed = event.edit(patch, timezone);

    if (changed.length > 0) {
      await this.uow.run(() => this.events.save(event));
    }
    return { changed, updatedAt: event.updatedAt };
  }
}

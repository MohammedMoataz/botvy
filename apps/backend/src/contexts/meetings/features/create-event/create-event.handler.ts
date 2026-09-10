import { Injectable } from '@nestjs/common';
import { isUuid } from '../../../../shared/cqrs/ids.js';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { CalendarEvent } from '../../domain/calendar-event.aggregate.js';
import { CalendarEventRepository } from '../../domain/meetings.repositories.js';
import type { MeetingRecurrence } from '../../domain/recurrence-expander.js';

export class InvalidCalendarEventId extends Error {
  constructor(id: string) {
    super(
      `"${id}" is not a UUID. The client mints the id, and it has to be a UUIDv7.`,
    );
  }
}

export interface CreateCalendarEventCommand {
  id: string;
  title: string;
  notes?: string | null;
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  color?: string | null;
  recurrence?: MeetingRecurrence | null;
}

export interface CreateCalendarEventResult {
  id: string;
  updatedAt: Date;
  replayed: boolean;
}

/**
 * A birthday, a holiday, a block of focus time (FR-011).
 *
 * Idempotent on the client-minted id for the same reason a meeting is: the
 * phone creates events offline and a retried push must be a no-op rather than a
 * second birthday.
 *
 * No default length and no default warnings here, unlike a meeting. An event
 * carries a window the member gave — `startAt` to `endAt`, or a whole day — and
 * produces no notifications at all (FR-011 lists a title, a time, a colour and
 * a repeat, and no reminders), so there is nothing for a lead time to be
 * subtracted from.
 */
@Injectable()
export class CreateCalendarEventHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly events: CalendarEventRepository,
    private readonly member: MemberContextPort,
  ) {}

  async handle(
    userId: string,
    command: CreateCalendarEventCommand,
  ): Promise<CreateCalendarEventResult> {
    if (!isUuid(command.id)) throw new InvalidCalendarEventId(command.id);

    const existing = await this.events.findById(userId, command.id);
    if (existing) {
      return { id: existing.id, updatedAt: existing.updatedAt, replayed: true };
    }

    // Kept as `authoredTimezone`, so a repeating event's wall clock survives
    // the member moving. An event is never pinned to a place: a birthday is a
    // date rather than an instant, and pinning it would put a member's own
    // birthday on the wrong day the first time they flew.
    const { timezone } = await this.member.clock(userId);

    const now = new Date();
    const event = CalendarEvent.create({
      id: command.id,
      userId,
      title: command.title,
      notes: command.notes ?? null,
      startAt: command.startAt,
      endAt: command.endAt,
      allDay: command.allDay ?? false,
      color: command.color ?? null,
      recurrence: command.recurrence ?? null,
      createdAt: now,
      timezone,
    });

    // Inside a unit of work even though this aggregate raises nothing, because
    // the transaction is what the repository contract is written against — and
    // the day an event does raise something, no call site has to change.
    await this.uow.run(() => this.events.save(event));
    return { id: event.id, updatedAt: event.updatedAt, replayed: false };
  }
}

import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/cqrs/domain-event.js';
import type { InMemoryUnitOfWork } from '../../../shared/persistence/memory/in-memory-unit-of-work.js';
import { StaleWriteError } from '../../../shared/persistence/ports/errors.js';
import {
  CalendarEvent,
  type CalendarEventState,
} from '../domain/calendar-event.aggregate.js';
import { Meeting, type MeetingState } from '../domain/meeting.aggregate.js';
import {
  CalendarEventRepository,
  MeetingRepository,
} from '../domain/meetings.repositories.js';

/**
 * A day, in milliseconds. The Mongo adapter's `WINDOW_SLACK_MS`, restated
 * because the number is the *contract* of `forWindow` rather than a detail of
 * either store: a meeting already under way when the window opens is in the
 * window, whichever adapter answers.
 *
 * Two copies of a constant is a real risk and it is the lesser one here. The
 * alternative is one adapter importing the other's internals, which is how the
 * in-memory store comes to be a wrapper around the Mongo one and stops being a
 * second opinion. What keeps them honest is the predicate below being stated
 * once and a spec asserting the *behaviour* — a meeting under way at the
 * window's open is returned — against whichever adapter is bound.
 */
const WINDOW_SLACK_MS = 86_400_000;

/**
 * The adapters every Meetings handler spec binds.
 *
 * They are held to the same promises the Mongo ones make, because a handler
 * that passes here and misbehaves against a real database is worse than no
 * test at all:
 *
 * 1. **Events are pulled on save**, so a spec asserting `MeetingScheduled`
 *    means something. An adapter that left them on the aggregate would let
 *    every such assertion pass vacuously.
 * 2. **`StaleWriteError` on an older copy**, the same refusal the optimistic
 *    filter gives.
 * 3. **Every read is scoped by `userId`**, keyed by owner rather than merely by
 *    id, so a query that forgets the scope fails here rather than in
 *    production.
 * 4. **`forWindow` returns every series plus the one-offs in range**, slack
 *    included. That one is worth naming: it is the filter the whole calendar
 *    reads through, and an in-memory copy that answered "everything" would
 *    make a handler spec pass against rows Mongo would not return — which is
 *    precisely how the expander would come to be trusted with a set it never
 *    sees in production.
 */
@Injectable()
export class InMemoryMeetingRepository extends MeetingRepository {
  readonly rows = new Map<string, MeetingState>();
  readonly events: DomainEvent[] = [];

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows, this.events);
  }

  async findById(userId: string, id: string): Promise<Meeting | null> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return null;
    return Meeting.rehydrate(clone(row));
  }

  async save(meeting: Meeting): Promise<void> {
    const existing = this.rows.get(meeting.id);
    if (existing && existing.updatedAt > meeting.updatedAt) {
      throw new StaleWriteError(meeting.id);
    }
    this.#raise(meeting.pullEvents());
    this.rows.set(meeting.id, stateOfMeeting(meeting));
  }

  async remove(meeting: Meeting): Promise<void> {
    this.#raise(meeting.pullEvents());
    this.rows.delete(meeting.id);
  }

  async pullSince(userId: string, since: Date | null): Promise<Meeting[]> {
    return [...this.rows.values()]
      .filter(
        (row) => row.userId === userId && (!since || row.updatedAt > since),
      )
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .map((row) => Meeting.rehydrate(clone(row)));
  }

  async forWindow(userId: string, from: Date, to: Date): Promise<Meeting[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.userId === userId &&
          row.deletedAt === null &&
          row.status === 'scheduled' &&
          touchesWindow(row.recurrence !== null, row.startAt, from, to),
      )
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
      .map((row) => Meeting.rehydrate(clone(row)));
  }

  async listFor(
    userId: string,
    options: { includeCompleted: boolean },
  ): Promise<Meeting[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.userId === userId &&
          row.deletedAt === null &&
          (options.includeCompleted || row.status === 'scheduled'),
      )
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
      .map((row) => Meeting.rehydrate(clone(row)));
  }

  async memberIdsWithMeetings(): Promise<string[]> {
    const ids = new Set<string>();
    for (const row of this.rows.values()) {
      if (row.deletedAt === null) ids.add(row.userId);
    }
    return [...ids];
  }

  async purgeTombstonesBefore(before: Date, userId?: string): Promise<number> {
    let purged = 0;
    // Deleting from a Map while iterating it is defined behaviour — the
    // iterator tolerates removal of the current entry — so no snapshot copy is
    // needed here or in the loops like it below.
    for (const [id, row] of this.rows) {
      if (userId && row.userId !== userId) continue;
      if (row.deletedAt && row.deletedAt < before) {
        this.rows.delete(id);
        purged += 1;
      }
    }
    return purged;
  }

  async removeAllFor(userId: string): Promise<number> {
    let removed = 0;
    for (const [id, row] of this.rows) {
      if (row.userId === userId) {
        this.rows.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  #raise(events: DomainEvent[]): void {
    this.uow.collect(events);
    this.events.push(...events);
  }
}

/**
 * A personal event's store. No `events` array, because the aggregate raises
 * none — `CalendarEvent.edit` says why: nothing subscribes, so an event raised
 * there would have no consumer. The unit of work is still enlisted, so a
 * rolled-back transaction takes these rows with it.
 */
@Injectable()
export class InMemoryCalendarEventRepository extends CalendarEventRepository {
  readonly rows = new Map<string, CalendarEventState>();
  readonly events: DomainEvent[] = [];

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows, this.events);
  }

  async findById(userId: string, id: string): Promise<CalendarEvent | null> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return null;
    return CalendarEvent.rehydrate(clone(row));
  }

  async save(event: CalendarEvent): Promise<void> {
    const existing = this.rows.get(event.id);
    if (existing && existing.updatedAt > event.updatedAt) {
      throw new StaleWriteError(event.id);
    }
    this.#raise(event.pullEvents());
    this.rows.set(event.id, stateOfEvent(event));
  }

  async remove(event: CalendarEvent): Promise<void> {
    this.#raise(event.pullEvents());
    this.rows.delete(event.id);
  }

  async pullSince(
    userId: string,
    since: Date | null,
  ): Promise<CalendarEvent[]> {
    return [...this.rows.values()]
      .filter(
        (row) => row.userId === userId && (!since || row.updatedAt > since),
      )
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .map((row) => CalendarEvent.rehydrate(clone(row)));
  }

  async forWindow(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<CalendarEvent[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.userId === userId &&
          row.deletedAt === null &&
          touchesWindow(row.recurrence !== null, row.startAt, from, to),
      )
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
      .map((row) => CalendarEvent.rehydrate(clone(row)));
  }

  async purgeTombstonesBefore(before: Date, userId?: string): Promise<number> {
    let purged = 0;
    for (const [id, row] of this.rows) {
      if (userId && row.userId !== userId) continue;
      if (row.deletedAt && row.deletedAt < before) {
        this.rows.delete(id);
        purged += 1;
      }
    }
    return purged;
  }

  async removeAllFor(userId: string): Promise<number> {
    let removed = 0;
    for (const [id, row] of this.rows) {
      if (row.userId === userId) {
        this.rows.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  #raise(events: DomainEvent[]): void {
    this.uow.collect(events);
    this.events.push(...events);
  }
}

/**
 * The `$or` both stores read through, in one predicate.
 *
 * A repeating row always qualifies — its `startAt` is where the series began
 * and says nothing about where its occurrences fall, so only the expander can
 * decide. A one-off qualifies on its own start, with a day of slack on the
 * lower bound so one already under way when the window opens is loaded.
 */
function touchesWindow(
  repeats: boolean,
  startAt: Date,
  from: Date,
  to: Date,
): boolean {
  if (repeats) return true;
  return (
    startAt.getTime() >= from.getTime() - WINDOW_SLACK_MS &&
    startAt.getTime() <= to.getTime()
  );
}

function stateOfMeeting(meeting: Meeting): MeetingState {
  return {
    id: meeting.id,
    userId: meeting.userId,
    title: meeting.title,
    description: meeting.description,
    startAt: meeting.startAt,
    durationMin: meeting.durationMin,
    allDay: meeting.allDay,
    lockTimezone: meeting.lockTimezone,
    authoredTimezone: meeting.authoredTimezone,
    location: meeting.location,
    prepNotes: meeting.prepNotes,
    prepMinutes: meeting.prepMinutes,
    reminderOffsets: meeting.reminderOffsets,
    recurrence: meeting.recurrence,
    status: meeting.status,
    completedAt: meeting.completedAt,
    source: meeting.source,
    createdAt: meeting.createdAt,
    updatedAt: meeting.updatedAt,
    deletedAt: meeting.deletedAt,
  };
}

function stateOfEvent(event: CalendarEvent): CalendarEventState {
  return {
    id: event.id,
    userId: event.userId,
    title: event.title,
    notes: event.notes,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
    color: event.color,
    recurrence: event.recurrence,
    authoredTimezone: event.authoredTimezone,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    deletedAt: event.deletedAt,
  };
}

/**
 * A deep copy on the way out, so a handler that mutates what it read cannot
 * change the stored row without saving. `structuredClone` keeps Dates as Dates,
 * which a JSON round trip would not — and that matters more here than
 * anywhere else in the product, because `recurrence.overrides` is keyed by a
 * `Date` compared with `getTime()`.
 */
function clone<T>(value: T): T {
  return structuredClone(value);
}

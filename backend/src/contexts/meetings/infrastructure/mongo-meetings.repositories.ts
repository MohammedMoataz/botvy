import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import {
  MongoRepositoryBase,
  type OutboxInsert,
} from '../../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../../shared/persistence/mongo/mongo-unit-of-work.js';
import type { Mapper } from '../../../shared/persistence/ports/mapper.js';
import {
  CalendarEvent,
  type CalendarEventState,
} from '../domain/calendar-event.aggregate.js';
import { Meeting, type MeetingState } from '../domain/meeting.aggregate.js';
import {
  CalendarEventRepository,
  MeetingRepository,
} from '../domain/meetings.repositories.js';
import type {
  MeetingLocation,
  MeetingRecurrence,
  OccurrenceOverride,
} from '../domain/recurrence-expander.js';

export interface MeetingDoc extends Omit<MeetingState, 'id'> {
  _id: string;
  schemaVersion: number;
}

export interface CalendarEventDoc extends Omit<CalendarEventState, 'id'> {
  _id: string;
  schemaVersion: number;
}

/**
 * A day, in milliseconds, subtracted from the lower bound of every window read.
 *
 * A meeting that started at 09:30 and runs ninety minutes is *happening* at
 * 10:00, so a window opening at 10:00 has to load it — and `startAt` is before
 * the bound, so a plain `$gte: from` would miss it and the member's day view
 * would open with the meeting they are sitting in missing from it. A day of
 * slack covers every duration the aggregate permits (`MAX_DURATION_MIN` is
 * eight hours) and the expander then discards whatever does not overlap, so
 * the slack costs a few rows read and never a wrong answer.
 */
const WINDOW_SLACK_MS = 86_400_000;

/**
 * Document to aggregate and back.
 *
 * `toDomain` upcasts by `schemaVersion`, which is what lets a document written
 * by an older build still be read: migrations only go forward, and a row that
 * has not been rewritten yet is upcast on read rather than left unreadable. At
 * version 1 there is nothing to upcast, so the `??` defaults below are doing
 * that job in advance — a field added in a later phase gets its default here
 * and every existing row keeps working.
 */
const meetingMapper: Mapper<Meeting, MeetingDoc> = {
  toDomain(doc) {
    return Meeting.rehydrate({
      id: doc._id,
      userId: doc.userId,
      title: doc.title,
      description: doc.description ?? null,
      startAt: doc.startAt,
      durationMin: doc.durationMin ?? 30,
      allDay: doc.allDay ?? false,
      lockTimezone: doc.lockTimezone ?? null,
      authoredTimezone: doc.authoredTimezone,
      location: normaliseLocation(doc.location),
      prepNotes: doc.prepNotes ?? null,
      prepMinutes: doc.prepMinutes ?? 0,
      reminderOffsets: doc.reminderOffsets ?? [],
      recurrence: normaliseRecurrence(doc.recurrence),
      status: doc.status ?? 'scheduled',
      completedAt: doc.completedAt ?? null,
      source: doc.source ?? 'app',
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      deletedAt: doc.deletedAt ?? null,
    });
  },
  toPersistence(meeting) {
    return {
      _id: meeting.id,
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
      schemaVersion: meeting.schemaVersion,
    };
  },
};

const calendarEventMapper: Mapper<CalendarEvent, CalendarEventDoc> = {
  toDomain(doc) {
    return CalendarEvent.rehydrate({
      id: doc._id,
      userId: doc.userId,
      title: doc.title,
      notes: doc.notes ?? null,
      startAt: doc.startAt,
      endAt: doc.endAt,
      allDay: doc.allDay ?? false,
      color: doc.color ?? null,
      recurrence: normaliseRecurrence(doc.recurrence),
      authoredTimezone: doc.authoredTimezone,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      deletedAt: doc.deletedAt ?? null,
    });
  },
  toPersistence(event) {
    return {
      _id: event.id,
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
      schemaVersion: event.schemaVersion,
    };
  },
};

/**
 * The stored repeat, settled into the shape the expander assumes.
 *
 * Two things need settling and both have bitten this codebase in the shape
 * Planning's `normaliseRecurrence` records. The arrays come back missing rather
 * than empty when nothing was ever written to them, and the aggregate spreads
 * them without asking; and a date inside an array of subdocuments is **not**
 * reliably a `Date` on the way out — `lean()` hands back whatever the driver
 * made of it, and `new Date(...)` on an already-`Date` value is a copy rather
 * than a failure, so coercing unconditionally is cheaper than deciding.
 *
 * That second half is not defensive padding. `overrides` is keyed by
 * `originalStart` and the key is compared with `getTime()` in `moveInRule`,
 * `skipInRule` and `orphanedOverrides`; a string there does not throw, it
 * silently matches nothing — so the member's moved occurrence would reappear
 * at the rule's own moment and moving it again would append a second override
 * rather than updating the first.
 */
function normaliseRecurrence(
  recurrence: MeetingRecurrence | null | undefined,
): MeetingRecurrence | null {
  if (!recurrence) return null;
  return {
    dtstart: asDate(recurrence.dtstart),
    rrule: recurrence.rrule,
    exdates: (recurrence.exdates ?? []).map(asDate),
    overrides: (recurrence.overrides ?? []).map(normaliseOverride),
  };
}

function normaliseOverride(override: OccurrenceOverride): OccurrenceOverride {
  return {
    ...override,
    originalStart: asDate(override.originalStart),
    startAt: override.startAt ? asDate(override.startAt) : null,
  };
}

function asDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Both halves present as keys, `null` when empty.
 *
 * The aggregate compares `location.onlineLink` and `location.address` field by
 * field on every edit, and `undefined !== null` — so a document whose address
 * was never written would make an edit that set nothing report `location` as
 * changed, and raise `MeetingChanged` on a no-op.
 */
function normaliseLocation(
  location: MeetingLocation | null | undefined,
): MeetingLocation {
  return {
    onlineLink: location?.onlineLink ?? null,
    address: location?.address ?? null,
  };
}

@Injectable()
export class MongoMeetingRepository extends MeetingRepository {
  readonly #inner: InnerMeetingRepository;

  constructor(
    private readonly model: Model<MeetingDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerMeetingRepository(model, outbox);
  }

  async findById(userId: string, id: string): Promise<Meeting | null> {
    return this.#inner.findById(userId, id);
  }

  async save(meeting: Meeting): Promise<void> {
    await this.#inner.save(meeting);
  }

  async remove(meeting: Meeting): Promise<void> {
    await this.#inner.remove(meeting);
  }

  /**
   * Tombstones included, and that is the contract rather than an oversight: the
   * client's delete sweep runs only on a full snapshot, so on a *delta* the
   * only way a deletion reaches the phone is as a tombstone row in the pull.
   * Filter them out here and a meeting deleted on one device stays for ever on
   * every other one.
   */
  async pullSince(userId: string, since: Date | null): Promise<Meeting[]> {
    const filter: Record<string, unknown> = { userId };
    if (since) filter.updatedAt = { $gt: since };
    const docs = await this.model
      .find(filter)
      .sort({ updatedAt: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<MeetingDoc[]>()
      .exec();
    return docs.map((doc) => meetingMapper.toDomain(doc));
  }

  /**
   * Every series, plus the one-offs that could touch the window.
   *
   * Not a range query, and the port's own comment explains why: a series is one
   * document whose `startAt` is the day it began, so "every Monday since March"
   * sits months behind any window a member is looking at while producing an
   * occurrence inside it. Its occurrences are computed rather than stored
   * (FR-006), so no index can find them — which leaves the read with two jobs
   * and no way to merge them: load every repeating row, because any of them
   * might produce an occurrence here, and range-filter only the one-off rows,
   * because for those `startAt` *is* the answer. Hence the `$or`.
   *
   * Live rows only. A completed, cancelled or deleted meeting expands to
   * nothing — `Meeting.occurrencesBetween` refuses them — so filtering here
   * keeps the expansion off rows that can produce no occurrence rather than
   * loading them to discard them.
   */
  async forWindow(userId: string, from: Date, to: Date): Promise<Meeting[]> {
    const docs = await this.model
      .find({
        userId,
        deletedAt: null,
        status: 'scheduled',
        $or: [
          { recurrence: { $ne: null } },
          {
            startAt: {
              $gte: new Date(from.getTime() - WINDOW_SLACK_MS),
              $lte: to,
            },
          },
        ],
      })
      .sort({ startAt: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<MeetingDoc[]>()
      .exec();
    return docs.map((doc) => meetingMapper.toDomain(doc));
  }

  async listFor(
    userId: string,
    options: { includeCompleted: boolean },
  ): Promise<Meeting[]> {
    const filter: Record<string, unknown> = { userId, deletedAt: null };
    // `status` is left off entirely when the caller wants everything, rather
    // than widened to an `$in` of the three: the list screen's default is the
    // diary, and a member asking for the rest wants cancelled ones too.
    if (!options.includeCompleted) filter.status = 'scheduled';
    const docs = await this.model
      .find(filter)
      .sort({ startAt: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<MeetingDoc[]>()
      .exec();
    return docs.map((doc) => meetingMapper.toDomain(doc));
  }

  /**
   * Unscoped, and the only read here that is: the nightly reconcile's input is
   * "whose diary is worth a pass", which is a question about the collection
   * rather than about a member. `distinct` answers it from the
   * `{ userId, deletedAt }` index without loading a document.
   */
  async memberIdsWithMeetings(): Promise<string[]> {
    const ids: unknown[] = await this.model
      .distinct('userId', { deletedAt: null })
      .session(MongoUnitOfWork.currentSession())
      .exec();
    return ids.map(String);
  }

  async purgeTombstonesBefore(before: Date, userId?: string): Promise<number> {
    const filter: Record<string, unknown> = {
      deletedAt: { $ne: null, $lt: before },
    };
    if (userId) filter.userId = userId;
    const result = await this.model
      .deleteMany(filter, {
        session: MongoUnitOfWork.currentSession() ?? undefined,
      })
      .exec();
    return result.deletedCount;
  }

  async removeAllFor(userId: string): Promise<number> {
    const result = await this.model
      .deleteMany(
        { userId },
        { session: MongoUnitOfWork.currentSession() ?? undefined },
      )
      .exec();
    return result.deletedCount;
  }
}

class InnerMeetingRepository extends MongoRepositoryBase<Meeting, MeetingDoc> {
  protected readonly mapper = meetingMapper;

  constructor(
    protected readonly model: Model<MeetingDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

@Injectable()
export class MongoCalendarEventRepository extends CalendarEventRepository {
  readonly #inner: InnerCalendarEventRepository;

  constructor(
    private readonly model: Model<CalendarEventDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerCalendarEventRepository(model, outbox);
  }

  async findById(userId: string, id: string): Promise<CalendarEvent | null> {
    return this.#inner.findById(userId, id);
  }

  async save(event: CalendarEvent): Promise<void> {
    await this.#inner.save(event);
  }

  async remove(event: CalendarEvent): Promise<void> {
    await this.#inner.remove(event);
  }

  async pullSince(
    userId: string,
    since: Date | null,
  ): Promise<CalendarEvent[]> {
    const filter: Record<string, unknown> = { userId };
    if (since) filter.updatedAt = { $gt: since };
    const docs = await this.model
      .find(filter)
      .sort({ updatedAt: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<CalendarEventDoc[]>()
      .exec();
    return docs.map((doc) => calendarEventMapper.toDomain(doc));
  }

  /**
   * The same `$or` as a meeting's, and no status clause — an event has no
   * status to have. FR-011 makes the repeat identical, so the read that feeds
   * the expander has to be identical too: a birthday is a series whose
   * `startAt` is the year the member was born.
   */
  async forWindow(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<CalendarEvent[]> {
    const docs = await this.model
      .find({
        userId,
        deletedAt: null,
        $or: [
          { recurrence: { $ne: null } },
          {
            startAt: {
              $gte: new Date(from.getTime() - WINDOW_SLACK_MS),
              $lte: to,
            },
          },
        ],
      })
      .sort({ startAt: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<CalendarEventDoc[]>()
      .exec();
    return docs.map((doc) => calendarEventMapper.toDomain(doc));
  }

  async purgeTombstonesBefore(before: Date, userId?: string): Promise<number> {
    const filter: Record<string, unknown> = {
      deletedAt: { $ne: null, $lt: before },
    };
    if (userId) filter.userId = userId;
    const result = await this.model
      .deleteMany(filter, {
        session: MongoUnitOfWork.currentSession() ?? undefined,
      })
      .exec();
    return result.deletedCount;
  }

  async removeAllFor(userId: string): Promise<number> {
    const result = await this.model
      .deleteMany(
        { userId },
        { session: MongoUnitOfWork.currentSession() ?? undefined },
      )
      .exec();
    return result.deletedCount;
  }
}

class InnerCalendarEventRepository extends MongoRepositoryBase<
  CalendarEvent,
  CalendarEventDoc
> {
  protected readonly mapper = calendarEventMapper;

  constructor(
    protected readonly model: Model<CalendarEventDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

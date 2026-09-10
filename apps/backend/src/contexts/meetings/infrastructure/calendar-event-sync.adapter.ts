import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../shared/member/member-context.port.js';
import {
  resolveConflict,
  type SyncChange,
} from '../../../shared/persistence/ports/sync-change.js';
import { UnitOfWork } from '../../../shared/persistence/ports/unit-of-work.js';
import type {
  ApplyOutcome,
  SyncableEntity,
} from '../../sync/domain/syncable-entity.port.js';
import {
  CalendarEvent,
  CalendarEventRuleError,
} from '../domain/calendar-event.aggregate.js';
import { CalendarEventRepository } from '../domain/meetings.repositories.js';
import {
  asDate,
  normaliseRecurrence,
  refuseMeeting,
  serverRow,
  MEETING_APPLY_ORDER,
} from './meeting-sync.adapter.js';

/**
 * Personal events — a birthday, a holiday, a block of focus time — on the
 * phone's round trip.
 *
 * ## `applyOrder` 34, and the point is that nothing depends on it
 *
 * A personal event references nothing and nothing references it — not the
 * meeting beside it, not a label, not a parent of any kind. So this number is
 * not buying correctness the way labels-before-tasks does, and saying so is why
 * this paragraph is here: the next person to add an entity should not go
 * hunting for the dependency that put calendar events after meetings.
 *
 * It is `MEETING_APPLY_ORDER + 2` so the sequence reads the same as
 * `contracts/sync.md`'s `entities` list — meetings then calendar events, after
 * reminders at 30 and before the rhythm's three at 40/41/42 — and derived from
 * that constant rather than written as `34` so the pair cannot drift apart if
 * meetings ever moves. The gap of two leaves room for an entity that genuinely
 * does need to sit between them.
 *
 * ## Why this is a second adapter rather than a flag on the meeting one
 *
 * Because the two rows disagree about almost everything: an event has a colour
 * and may fill a whole day, and has no location, no preparation, no reminders
 * and no status. Sharing one adapter would mean one `apply` with a branch at
 * every field. What the two *do* share is the repeat, and that is imported from
 * the meetings adapter rather than copied — `normaliseRecurrence` is the shape
 * both aggregates store and both expand through, and a second copy is how a
 * birthday moved one year would come out differently from a meeting moved one
 * week.
 */
export const CALENDAR_EVENT_APPLY_ORDER = MEETING_APPLY_ORDER + 2;

@Injectable()
export class CalendarEventSyncAdapter implements SyncableEntity {
  readonly entity = 'calendar_events';
  readonly applyOrder = CALENDAR_EVENT_APPLY_ORDER;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly events: CalendarEventRepository,
    private readonly member: MemberContextPort,
  ) {}

  /**
   * Every field the phone's drift table mirrors, **tombstones included** —
   * `pullSince` is the port that keeps them, and on a delta a tombstone is the
   * only way a deletion travels. The client's delete sweep runs only against a
   * full snapshot, because treating a delta as the complete set deletes every
   * row that simply did not change.
   */
  async pull(userId: string, since: Date | null): Promise<unknown[]> {
    const rows = await this.events.pullSince(userId, since);
    return rows.map((event) => ({
      id: event.id,
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
    }));
  }

  async apply(
    userId: string,
    change: SyncChange,
    now: Date,
  ): Promise<ApplyOutcome> {
    // Scoped by owner, so an event belonging to another member is simply not
    // found — and an `update` naming it is refused `gone`, the same as an id
    // that never existed. Never `stale`: a stale verdict tells the phone to
    // take the server's copy and retry, and there is no copy to take.
    const existing = await this.events.findById(userId, change.id);
    const verdict = resolveConflict(change, existing, now);
    if (!verdict.accept) {
      return refuseMeeting(
        this.entity,
        change,
        verdict.reason,
        serverRow(existing),
      );
    }

    try {
      return await this.write(userId, change, existing, now);
    } catch (error) {
      /*
       * A domain rule refused the row: an empty title, an event that ends
       * before it starts or claims to last longer than a year, a repeat rule
       * nothing can read.
       *
       * `invalid`, never `stale`. Retrying the same bytes fails against the
       * same rule for ever, and `stale` is the one verdict that tells the phone
       * to refresh and retry — so a stale verdict here is an infinite loop
       * against a rule that will never accept the row. `invalid` tells the
       * client to show it to the member, who is the only one who can fix it.
       */
      if (error instanceof CalendarEventRuleError) {
        return refuseMeeting(
          this.entity,
          change,
          error.code === 'not_deleted' ? 'not_deleted' : 'invalid',
          serverRow(existing),
        );
      }
      throw error;
    }
  }

  private async write(
    userId: string,
    change: SyncChange,
    existing: CalendarEvent | null,
    now: Date,
  ): Promise<ApplyOutcome> {
    const fields = change.fields as PushedCalendarEvent;

    if (!existing) {
      /*
       * A create, or an op with no server row that `resolveConflict` accepted —
       * the ordinary offline case. The phone minted the id, so a retried create
       * is a no-op rather than a second birthday.
       *
       * `authoredTimezone` comes from the member's profile, **not from the
       * pushed row**; see the note on the update path.
       */
      const { timezone } = await this.member.clock(userId);
      const startAt = asDate(fields.startAt) ?? change.updatedAt;
      const event = CalendarEvent.create({
        id: change.id,
        userId,
        // A missing title is passed through empty so the aggregate refuses the
        // row as `invalid`, rather than defaulted into something plausible: an
        // event called "Event" on the member's calendar is a row they will act
        // on without knowing their client sent a broken one.
        title: fields.title ?? '',
        notes: fields.notes ?? null,
        startAt,
        // `?? startAt` gives a zero-length window, which `requireWindow`
        // refuses — the same reasoning as the title. It is not a default, it is
        // the shortest route to the refusal.
        endAt: asDate(fields.endAt) ?? startAt,
        allDay: fields.allDay ?? false,
        color: fields.color ?? null,
        // `?? null` because a *create* has no previous value to leave alone:
        // `normaliseRecurrence` answers `undefined` for "the patch did not
        // mention it", which is meaningful on an edit and meaningless here.
        recurrence: normaliseRecurrence(fields.recurrence) ?? null,
        createdAt: change.updatedAt,
        timezone,
      });
      await this.uow.run(() => this.events.save(event));
      return { applied: true, id: event.id };
    }

    switch (change.op) {
      case 'delete':
        // Nothing but `deletedAt`. An event carries no status of its own, and
        // the rule is the same one Planning and Meetings hold to: a delete is
        // not a statement about what happened, and the Deleted view exists to
        // show what a row still says.
        if (!existing.isDeleted) existing.tombstone(now);
        break;
      case 'restore':
        if (existing.isDeleted) existing.restore(now);
        break;
      case 'purge':
        existing.assertPurgeable();
        await this.uow.run(() => this.events.remove(existing));
        return { applied: true, id: existing.id };
      default: {
        const { timezone } = await this.member.clock(userId);
        existing.edit(
          {
            title: fields.title,
            notes: fields.notes,
            startAt:
              fields.startAt === undefined
                ? undefined
                : (asDate(fields.startAt) ?? undefined),
            endAt:
              fields.endAt === undefined
                ? undefined
                : (asDate(fields.endAt) ?? undefined),
            allDay: fields.allDay,
            color: fields.color,
            recurrence:
              fields.recurrence === undefined
                ? undefined
                : normaliseRecurrence(fields.recurrence),
          },
          /*
           * `authoredTimezone` is *not* in this patch, and cannot be: the field
           * is `readonly` on the aggregate. A pushed row's copy of it is read
           * by nothing here, on purpose.
           *
           * It records what the member's clock read when they typed the time,
           * and `recurrence-expander.ts` recovers "every year on the 4th" from
           * the stored instant against it. So a client that could rewrite it
           * would move **every occurrence of the series** — silently, with no
           * field on the row visibly changing — and the client most likely to
           * push a wrong one is a device that has been offline in another
           * country. Which clock the series is *read* on is decided on every
           * read, from the member's current profile, which is what FR-007's
           * travel clause needs and what keeps a member's own birthday on the
           * right day when they fly.
           *
           * This second argument is that read zone, not the authored one: it is
           * the clock the pushed rule is validated against.
           */
          timezone,
          now,
        );
        // No pushed status to copy: an event has none. And no `force` flag,
        // because `CalendarEvent.edit` has no orphan dialog to suppress — it
        // takes the rule as given, so there is nothing here for a sync push to
        // be refused by that a member would have had to answer.
      }
    }

    await this.uow.run(() => this.events.save(existing));
    return { applied: true, id: existing.id };
  }
}

/** The fields a client may push on a personal-event row. `contracts/sync.md`. */
interface PushedCalendarEvent {
  title?: string;
  notes?: string | null;
  startAt?: string | Date;
  endAt?: string | Date;
  allDay?: boolean;
  color?: string | null;
  recurrence?: Parameters<typeof normaliseRecurrence>[0];
  /**
   * Carried on the wire because `pull` sends it and the phone mirrors it, and
   * **read by nothing**. See the note on the edit path.
   */
  authoredTimezone?: string;
}

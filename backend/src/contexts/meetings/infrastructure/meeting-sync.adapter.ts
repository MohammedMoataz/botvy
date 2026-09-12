import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../shared/member/member-context.port.js';
import {
  resolveConflict,
  type RejectionReason,
  type SyncChange,
} from '../../../shared/persistence/ports/sync-change.js';
import { UnitOfWork } from '../../../shared/persistence/ports/unit-of-work.js';
import type {
  ApplyOutcome,
  SyncableEntity,
} from '../../sync/domain/syncable-entity.port.js';
import {
  Meeting,
  MeetingRuleError,
  type MeetingSource,
  type MeetingStatus,
} from '../domain/meeting.aggregate.js';
import { MeetingRepository } from '../domain/meetings.repositories.js';
import type {
  MeetingLocation,
  MeetingRecurrence,
} from '../domain/recurrence-expander.js';

/**
 * Meetings' adapter for the sync facade.
 *
 * It lives in `infrastructure/` because that is the layer allowed to know
 * another context exists — the port it implements is the Sync context's. The
 * facade never learns what a meeting is; it sorts by `applyOrder` and calls
 * `apply`.
 *
 * ## `applyOrder` 32, and the point is that nothing depends on it
 *
 * Labels are 10 and tasks are 20, and *that* pair is a real dependency: a task
 * carries a snapshot of its label's name, so applying tasks first would let one
 * name a label the same request is about to create. Meetings has no such edge.
 * A meeting references nothing — no label, no parent, not the calendar event
 * beside it — and no entity references a meeting. So the number here is not
 * buying correctness, and saying so is the whole reason this paragraph exists:
 * the next person to add an entity should not go looking for the dependency
 * that put meetings at 32.
 *
 * What it *is* buying is a deterministic sequence that reads the same as
 * `contracts/sync.md`'s `entities` list — labels, tasks, reminders (30),
 * meetings, calendar events, then the rhythm's three at 40/41/42 — because a
 * list that applies in a different order from the one the contract writes down
 * is a list somebody will "fix" in the wrong direction. 32 and 34 rather than
 * 31 and 32 so a later entity that genuinely does depend on a meeting has a
 * number to sit between.
 */
export const MEETING_APPLY_ORDER = 32;

/** The conflict rule's refusal, in the shape every row-shaped adapter returns. */
export function refuseMeeting(
  entity: string,
  change: SyncChange,
  reason: RejectionReason,
  server: unknown,
): ApplyOutcome {
  return {
    applied: false,
    rejection: { entity, id: change.id, reason, server },
  };
}

@Injectable()
export class MeetingSyncAdapter implements SyncableEntity {
  readonly entity = 'meetings';
  readonly applyOrder = MEETING_APPLY_ORDER;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly meetings: MeetingRepository,
    private readonly member: MemberContextPort,
  ) {}

  /**
   * Every field the phone's drift table mirrors, **tombstones included**.
   *
   * `pullSince` is the port that includes them, and on a delta a tombstone is
   * the only way a deletion travels: the client's delete sweep runs only
   * against a full snapshot, because treating a delta as the complete set
   * deletes every row that simply did not change.
   *
   * Field by field rather than a spread of the aggregate, so publishing a new
   * field is a decision — a `{ ...meeting }` would ship `pendingEvents` and
   * every private the class ever grows.
   */
  async pull(userId: string, since: Date | null): Promise<unknown[]> {
    const rows = await this.meetings.pullSince(userId, since);
    return rows.map((meeting) => ({
      id: meeting.id,
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
    }));
  }

  async apply(
    userId: string,
    change: SyncChange,
    now: Date,
  ): Promise<ApplyOutcome> {
    // Scoped by owner, so a meeting belonging to another member is simply not
    // found — and an `update` naming it is refused `gone`, the same as an id
    // that never existed. Never `stale`: a stale verdict tells the phone to
    // take the server's copy and try again, and there is no copy to take.
    const existing = await this.meetings.findById(userId, change.id);
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
       * A domain rule refused the row: no link and no address, a duration
       * longer than the working day, a repeat rule nothing can read.
       *
       * `invalid`, never `stale`. Retrying the same bytes will fail against the
       * same rule for ever, and `stale` is the one verdict that tells the phone
       * to refresh and retry — so a stale verdict here is an infinite loop
       * against a rule that is never going to accept the row. The client's job
       * with `invalid` is to show it to the member, who is the only one who can
       * fix it.
       *
       * `not_deleted` is passed through as itself, because it means something
       * different and the client shows it differently. In practice
       * `resolveConflict` has already refused a purge of a live row before
       * `assertPurgeable` is ever reached; this branch is the backstop, and it
       * is written because the cost of it being reached is not an error message
       * but the wrong instruction to the phone.
       */
      if (error instanceof MeetingRuleError) {
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
    existing: Meeting | null,
    now: Date,
  ): Promise<ApplyOutcome> {
    const fields = change.fields as PushedMeeting;

    if (!existing) {
      /*
       * A create, or an op the server has no row for that `resolveConflict`
       * accepted — which is the ordinary offline case: the phone minted the id,
       * so a retried create is a no-op rather than a second meeting.
       *
       * `authoredTimezone` comes from the member's profile, **not from the
       * pushed row**. It records what the member's own clock read when they
       * typed "18:00", and the expander recovers those digits from it — so a
       * client that could set it could restate what the member typed. See the
       * note on the update path, which is where the damage would be.
       */
      const { timezone } = await this.member.clock(userId);
      const meeting = Meeting.schedule({
        id: change.id,
        userId,
        /*
         * A missing required field is passed through so the aggregate refuses
         * the row, rather than defaulted into something plausible.
         *
         * That is the opposite of Planning's `title: fields.title ?? 'Task'`,
         * and deliberately: a task called "Task" is untidy, where a meeting
         * with an invented location or an invented length is a wrong entry on
         * the member's calendar that they will act on. `location_required`
         * exists precisely to refuse it, and reaching the member as `invalid`
         * is how they find out their client sent a broken row.
         */
        title: fields.title ?? '',
        description: fields.description ?? null,
        // No guard on the moment itself, so the client's own edit time stands
        // in — a meeting the member placed is a meeting whose `startAt` they
        // sent, and a push without one is already going to be refused on
        // title, duration or location.
        startAt: asDate(fields.startAt) ?? change.updatedAt,
        durationMin: fields.durationMin ?? 0,
        lockTimezone: fields.lockTimezone ?? null,
        location: fields.location ?? { onlineLink: null, address: null },
        prepNotes: fields.prepNotes ?? null,
        prepMinutes: fields.prepMinutes ?? 0,
        reminderOffsets: fields.reminderOffsets ?? [],
        // `?? null` because a *create* has no previous value to leave alone:
        // `normaliseRecurrence` answers `undefined` for "the patch did not
        // mention it", which is meaningful on an edit and meaningless here.
        recurrence: normaliseRecurrence(fields.recurrence) ?? null,
        source: fields.source ?? 'app',
        createdAt: change.updatedAt,
        timezone,
      });
      // A row created offline can arrive already completed or cancelled. The
      // status is *written*, for the reason `applyPushedStatus` gives.
      applyPushedStatus(meeting, fields, now);
      await this.uow.run(() => this.meetings.save(meeting));
      return { applied: true, id: meeting.id };
    }

    switch (change.op) {
      case 'delete':
        // The status is untouched, here as everywhere. It is the only record of
        // whether the meeting happened, was called off, or was simply removed
        // from the diary, and the Deleted view exists to show exactly that.
        // Broken twice in this codebase, so `meetings-sync.spec.ts` asserts it.
        if (!existing.isDeleted) existing.tombstone(now);
        break;
      case 'restore':
        if (existing.isDeleted) existing.restore(now);
        break;
      case 'purge':
        existing.assertPurgeable();
        await this.uow.run(() => this.meetings.remove(existing));
        return { applied: true, id: existing.id };
      default: {
        const { timezone } = await this.member.clock(userId);
        existing.edit(
          {
            title: fields.title,
            description: fields.description,
            startAt:
              fields.startAt === undefined
                ? undefined
                : (asDate(fields.startAt) ?? undefined),
            durationMin: fields.durationMin,
            lockTimezone: fields.lockTimezone,
            location: fields.location,
            prepNotes: fields.prepNotes,
            prepMinutes: fields.prepMinutes,
            reminderOffsets: fields.reminderOffsets,
            recurrence:
              fields.recurrence === undefined
                ? undefined
                : normaliseRecurrence(fields.recurrence),
          },
          /*
           * `authoredTimezone` is *not* in this patch, and it cannot be: the
           * field is `readonly` on the aggregate. A pushed row's copy of it is
           * read by nothing here, on purpose.
           *
           * It records what the member's clock read when they typed the time,
           * and `recurrence-expander.ts` recovers "every Monday at 18:00" from
           * the stored instant against it. So a client that could rewrite it
           * would move **every occurrence of the series** — silently, with no
           * field on the row visibly changing — and the client most likely to
           * push a wrong one is a device that has been offline in another
           * country. The zone the series is *read* in is decided on every read,
           * from `lockTimezone` or the member's current profile, which is what
           * FR-007's travel clause actually needs.
           *
           * This second argument is that read zone, not the authored one: it is
           * the clock the orphan check expands against, so a member editing
           * from abroad is not told their moved occurrences are about to be
           * discarded when they are not.
           */
          timezone,
          /*
           * `force: true` — a pushed series edit is never refused for orphaned
           * overrides.
           *
           * `Meeting.edit` refuses an unforced rule change that would leave an
           * override describing an occurrence the new rule cannot produce, and
           * carries the moments at stake so a client can raise a dialog. There
           * is no member standing in front of a sync push to answer that
           * dialog, and the refusal would come back as `invalid` on a row whose
           * bytes will never change — so the phone would surface an error the
           * member cannot act on, for an edit they already made and already see
           * applied locally.
           *
           * This is a real trade and not a shortcut: a series edited offline
           * *can* discard an occurrence the member had moved, and nothing here
           * can ask them first. The honest place for that warning is the
           * editor, which is where the member is — the interactive path leaves
           * `force` unset and gets the dialog.
           */
          { force: true },
          now,
        );
        /*
         * A pushed status is applied as a *write* and nothing else.
         *
         * A client that completed a meeting offline sends the row with
         * `status: 'completed'`. Calling `complete()` here would raise
         * `meetings.MeetingCompleted` a second time and re-run every side
         * effect that hangs off it — the phone already applied them locally and
         * is pushing the result. The pushed row *is* the outcome, so it is
         * stored as such; the client is not requesting a transition, it is
         * reporting one that has happened.
         */
        applyPushedStatus(existing, fields, now);
      }
    }

    await this.uow.run(() => this.meetings.save(existing));
    return { applied: true, id: existing.id };
  }
}

/** The fields a client may push on a meeting row. `contracts/sync.md`. */
interface PushedMeeting {
  title?: string;
  description?: string | null;
  startAt?: string | Date;
  durationMin?: number;
  lockTimezone?: string | null;
  location?: MeetingLocation;
  prepNotes?: string | null;
  prepMinutes?: number;
  reminderOffsets?: number[];
  recurrence?: PushedRecurrence | null;
  status?: string;
  completedAt?: string | Date | null;
  source?: MeetingSource;
  /**
   * Carried on the wire because `pull` sends it and the phone mirrors it, and
   * **read by nothing**. See the note on the edit path.
   */
  authoredTimezone?: string;
}

/**
 * A recurrence as it arrives over JSON: every date is a string.
 *
 * Its own type rather than `MeetingRecurrence`, because the difference is the
 * whole reason `normaliseRecurrence` exists — a `MeetingRecurrence` typed off
 * the wire would type-check with strings in every `Date` and fail on the first
 * `.getTime()`, days later, inside the expander.
 */
interface PushedRecurrence {
  dtstart: string | Date;
  rrule: string;
  exdates?: Array<string | Date>;
  overrides?: Array<{
    originalStart: string | Date;
    startAt?: string | Date | null;
    durationMin?: number | null;
    title?: string | null;
    location?: MeetingLocation | null;
  }>;
}

/**
 * Copies a pushed status onto the aggregate without re-running the transition.
 *
 * The aggregate's own `complete()` and `cancel()` raise events with consumers,
 * so replaying them here would double whatever those consumers do. This is the
 * one place a meeting's status is written rather than transitioned, and the
 * reason is that the client is reporting an outcome rather than asking for one.
 *
 * `completedAt` follows the status: cancelled and scheduled both mean there is
 * no completion moment, and leaving a stale one would show a cancelled meeting
 * with a time it supposedly happened at.
 */
function applyPushedStatus(
  meeting: Meeting,
  fields: { status?: string; completedAt?: string | Date | null },
  now: Date,
): void {
  if (!isMeetingStatus(fields.status)) return;
  if (meeting.status === fields.status) return;

  meeting.status = fields.status;
  meeting.completedAt =
    fields.status === 'completed' ? (asDate(fields.completedAt) ?? now) : null;
  meeting.updatedAt = now;
}

function isMeetingStatus(value: unknown): value is MeetingStatus {
  return value === 'scheduled' || value === 'completed' || value === 'cancelled';
}

/**
 * The wire shape settled into the stored one: dates that arrived as strings
 * become dates, and the two exception lists are always arrays.
 *
 * The three-way answer is deliberate. `undefined` means "the patch did not
 * mention recurrence", which on an edit must leave the stored rule alone;
 * `null` means "this no longer repeats". Collapsing them would make a title-only
 * edit erase the member's series.
 *
 * Shared with the calendar-event adapter, which imports it: both aggregates hold
 * the same `MeetingRecurrence` and call the same expander, so a second copy here
 * is how a birthday moved one year would come out differently from a meeting
 * moved one week.
 */
export function normaliseRecurrence(
  recurrence: PushedRecurrence | null | undefined,
): MeetingRecurrence | null | undefined {
  if (recurrence === undefined) return undefined;
  if (recurrence === null) return null;
  return {
    dtstart: new Date(recurrence.dtstart),
    rrule: recurrence.rrule,
    exdates: (recurrence.exdates ?? []).map((value) => new Date(value)),
    overrides: (recurrence.overrides ?? []).map((override) => ({
      originalStart: new Date(override.originalStart),
      // `null` survives as `null`: on an override it means "unchanged", which
      // is not the same statement as a missing key on the wire.
      startAt:
        override.startAt === undefined || override.startAt === null
          ? override.startAt
          : new Date(override.startAt),
      durationMin: override.durationMin,
      title: override.title,
      location: override.location,
    })),
  };
}

export function asDate(
  value: string | Date | null | undefined,
): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * What a rejection carries back.
 *
 * The whole server row, because the client's obligation on a `stale` is to
 * overwrite its own copy with this and show the member the winner — and it can
 * only do that if the winner is in the response. A rejection that named the
 * conflict without carrying the row would have the phone ask again, get the
 * same refusal, and loop.
 */
export function serverRow(
  existing: { updatedAt: Date; deletedAt: Date | null } | null,
): unknown {
  return existing ?? null;
}

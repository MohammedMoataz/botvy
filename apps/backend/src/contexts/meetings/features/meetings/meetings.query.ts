import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import type {
  Meeting,
  MeetingStatus,
} from '../../domain/meeting.aggregate.js';
import { MeetingRepository } from '../../domain/meetings.repositories.js';
import {
  humanRule,
  type MeetingLocation,
  type OccurrenceOverride,
} from '../../domain/recurrence-expander.js';

/**
 * The rule as a screen reads it: the rule itself *and* a sentence.
 *
 * Both, deliberately, and the same split Planning's `TaskType` makes. The
 * sentence is rendered here so three surfaces need not each carry an RRULE
 * parser; the rule is sent as well because the phone expands the series itself
 * to keep the calendar readable with the network off (FR-010), and no client
 * can expand "every 2 weeks on Tuesday".
 */
export interface MeetingRecurrenceView {
  dtstart: Date;
  rrule: string;
  humanText: string;
  exdates: Date[];
  overrides: OccurrenceOverride[];
}

/** One meeting, as a list row or a detail screen reads it. */
export interface MeetingView {
  id: string;
  title: string;
  description: string | null;
  startAt: Date;
  durationMin: number;
  allDay: boolean;
  /**
   * The zone the series is pinned to, or null to follow the member (FR-007).
   *
   * Read back by the editor's "keep this meeting on <place>'s clock" toggle,
   * which is the only way a member can see which of FR-007's two behaviours
   * their meeting has. A write-only flag would be a setting the member can set
   * and never confirm.
   */
  lockTimezone: string | null;
  location: MeetingLocation;
  prepNotes: string | null;
  prepMinutes: number;
  reminderOffsets: number[];
  recurrence: MeetingRecurrenceView | null;
  status: MeetingStatus;
  /** "next: Tuesday" on the row. Null once the series has run out (FR-006). */
  nextOccurrence: Date | null;
}

/**
 * The member's meetings, for a list screen.
 *
 * `includeCompleted` rather than a `status` filter, because the list is one
 * list with a switch on it: scheduled and cancelled meetings both belong in
 * the diary (a cancelled meeting is a fact about a date the member may still
 * be looking for), and a completed one is history the member asks for. The
 * Deleted view is a different screen served by the sync channel's tombstones,
 * which is why nothing here takes an `includeDeleted`.
 */
@Injectable()
export class MeetingsQueryHandler {
  constructor(
    private readonly meetings: MeetingRepository,
    private readonly member: MemberContextPort,
  ) {}

  async list(
    userId: string,
    includeCompleted = false,
    now: Date = new Date(),
  ): Promise<MeetingView[]> {
    const { timezone } = await this.member.clock(userId);
    const rows = await this.meetings.listFor(userId, { includeCompleted });

    /*
     * Sorted by the *next* occurrence and not by `startAt`.
     *
     * A repeating meeting's `startAt` is the first occurrence, which for
     * "every Monday since March" is months behind anything the member cares
     * about — sorting on it buries every standing meeting at the bottom of the
     * list under a one-off from last week. A series that has run out has no
     * next occurrence and sorts last, which is where a finished series belongs.
     *
     * There is no `limit` here and that is on purpose: a member has tens of
     * meetings, not thousands, so the whole list is one read. Sorting and then
     * limiting is the trap CLAUDE.md names — a limit applied to an ascending
     * sort hands back the *oldest* n — and the way not to fall into it is to
     * not have a limit until something needs one.
     */
    return rows
      .map((meeting) => meetingView(meeting, timezone, now))
      .sort(byNextOccurrence);
  }
}

/**
 * One meeting, one view, and one place that builds it.
 *
 * Exported and imported by the sibling `meeting/` slice rather than copied
 * into it. Two copies of this mapper would be two shapes one typo apart, and
 * the detail screen and the list row are the same meeting — a field present
 * on one and missing on the other is a bug the type system cannot see, because
 * both sides would type-check against their own copy. Sibling slices inside
 * one context reaching for each other is the same seam `rhythm.resolver.ts`
 * uses; the rule the constitution states about duplicating helpers is about
 * two *contexts*, and this is one.
 */
export function meetingView(
  meeting: Meeting,
  timezone: string,
  now: Date,
): MeetingView {
  return {
    id: meeting.id,
    title: meeting.title,
    description: meeting.description,
    startAt: meeting.startAt,
    durationMin: meeting.durationMin,
    allDay: meeting.allDay,
    lockTimezone: meeting.lockTimezone,
    location: meeting.location,
    prepNotes: meeting.prepNotes,
    prepMinutes: meeting.prepMinutes,
    reminderOffsets: [...meeting.reminderOffsets],
    recurrence: meeting.recurrence
      ? {
          dtstart: meeting.recurrence.dtstart,
          rrule: meeting.recurrence.rrule,
          /*
           * The sentence is rendered against the zone the *digits* are written
           * in, which is `lockTimezone ?? authoredTimezone` — the same pair
           * the expander distinguishes. Rendering it in the member's current
           * zone would say "every Tuesday" about a pinned series that lands on
           * a Monday where they are now.
           */
          humanText: humanRule(
            meeting.recurrence,
            meeting.lockTimezone ?? meeting.authoredTimezone,
          ),
          exdates: [...meeting.recurrence.exdates],
          overrides: meeting.recurrence.overrides.map((override) => ({
            ...override,
          })),
        }
      : null,
    status: meeting.status,
    nextOccurrence: meeting.nextOccurrence(now, timezone),
  };
}

/** Soonest first; a series with nothing left to come sorts last. */
function byNextOccurrence(left: MeetingView, right: MeetingView): number {
  const a = left.nextOccurrence?.getTime() ?? Number.POSITIVE_INFINITY;
  const b = right.nextOccurrence?.getTime() ?? Number.POSITIVE_INFINITY;
  if (a !== b) return a - b;
  return left.startAt.getTime() - right.startAt.getTime();
}

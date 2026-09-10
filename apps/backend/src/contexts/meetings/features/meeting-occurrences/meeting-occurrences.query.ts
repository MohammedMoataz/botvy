import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { wallClockToUtc } from '../../../../shared/time/time.js';
import { MeetingRepository } from '../../domain/meetings.repositories.js';
import type { MeetingLocation } from '../../domain/recurrence-expander.js';

/**
 * One occurrence, with everything a *scheduler* needs to plan around it.
 *
 * Note what this carries that `AgendaItem` does not: `prepMinutes`,
 * `reminderOffsets` and `originalStart`. Those are the fields the alert saga
 * reconciles from — one alert per offset plus one for the preparation block —
 * and `originalStart` is the key an alert's `source.occurrenceAt` records, so
 * a reconcile can tell "the 10:00 on Tuesday the rule produced" from "the
 * 11:00 on Tuesday the member dragged it to". The agenda carries none of them
 * because a screen has nothing to do with a reminder offset.
 *
 * Two readers, two shapes, on purpose — the same split Planning makes between
 * its GraphQL task and its sync row. Conflating them is how a payload ends up
 * with fields nobody populates.
 */
export interface MeetingOccurrenceView {
  meetingId: string;
  title: string;
  /** The moment the *rule* produced: the override key, and the alert's key. */
  originalStart: Date;
  /** Where it actually sits, after any override. */
  startAt: Date;
  endAt: Date;
  durationMin: number;
  location: MeetingLocation;
  prepMinutes: number;
  reminderOffsets: number[];
  /** True when an override moved it, so a client can mark it. */
  moved: boolean;
}

/**
 * Meetings' published read surface: where this member's meetings actually
 * fall, for the two contexts that need to know and may not look.
 *
 * ## Who calls this, and why it lives here
 *
 * **Notifications' alert planning saga.** `alerts` is Notifications'
 * collection and `meetings` is this context's, and a context never reads
 * another's collection (constitution I and IX). The saga reacts to
 * `meetings.MeetingScheduled | MeetingChanged | OccurrenceSkipped |
 * OccurrenceMoved | MeetingCompleted | MeetingCancelled | MeetingDeleted` and
 * to `profile.ProfileUpdated`, and for each affected meeting it needs the next
 * `meetings.alertWindowDays` of occurrences — which cannot be read out of the
 * row, because occurrences are derived from the rule and never stored (FR-006).
 * So it asks here, and gets them from the same expander every screen uses.
 * That last point is not a nicety: if the saga expanded the rule itself there
 * would be two implementations of the hardest logic in the platform on the
 * server alone, and the first divergence would be an alarm at the wrong hour
 * with a calendar insisting the meeting is elsewhere.
 *
 * **P3's rhythm.** The evening proposal names tomorrow's meetings and the
 * morning briefing names today's (FR-012, and story 5's two scenarios). It
 * calls `onDate`, with tomorrow's or today's local date.
 *
 * ## Why it is written in this phase rather than left to those phases
 *
 * Because of CLAUDE.md's rule, which was written after this exact failure:
 * *"a capability three phases each credit to another phase is a capability
 * nobody builds"* — the pinned `coach` and `planner` conversations were
 * "created in P1" according to both P1 and P3, built in P4, and skeletoned in
 * P3 by the blueprint, so nothing created them and the daily touches wrote
 * into a conversation that did not exist. A port the saga needs, declared by
 * the saga's phase, against a collection it may not read, is the same shape of
 * hole. It is built here, in the phase that owns the collection, with its
 * callers named above rather than left to be discovered.
 *
 * Planning's `TasksDueQueryHandler` is the pattern and the precedent, and this
 * file follows it down to the parameter types: `onDate` takes a `YYYY-MM-DD`
 * **string**, never a Date, because a Date carries an instant and the caller
 * would have had to decide which zone's midnight it meant — which is the
 * decision this method exists to make. That decision going the server's way
 * once shifted every extracted reminder in v1 by three hours.
 */
@Injectable()
export class MeetingOccurrencesQueryHandler {
  constructor(
    private readonly meetings: MeetingRepository,
    private readonly member: MemberContextPort,
  ) {}

  /**
   * Every occurrence of every live meeting touching the window, in order.
   *
   * The window is a pair of instants here rather than dates, because the
   * saga's window genuinely is one — "the next fourteen days from now" starts
   * at a moment, not at a midnight. `onDate` is the one that has a calendar
   * day to resolve.
   *
   * Completed, cancelled and deleted meetings contribute nothing:
   * `Meeting.occurrencesBetween` refuses them, which is why neither the saga
   * nor the agenda carries a status branch of its own.
   */
  async forMember(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<MeetingOccurrenceView[]> {
    const { timezone } = await this.member.clock(userId);
    const meetings = await this.meetings.forWindow(userId, from, to);

    const found: MeetingOccurrenceView[] = [];
    for (const meeting of meetings) {
      for (const occurrence of meeting.occurrencesBetween(from, to, timezone)) {
        found.push({
          meetingId: meeting.id,
          title: occurrence.title,
          originalStart: occurrence.originalStart,
          startAt: occurrence.startAt,
          endAt: occurrence.endAt,
          durationMin: occurrence.durationMin,
          location: occurrence.location,
          prepMinutes: meeting.prepMinutes,
          reminderOffsets: [...meeting.reminderOffsets],
          moved: occurrence.moved,
        });
      }
    }

    /*
     * Sorted across meetings, because the expander only orders within one
     * series. Ascending with no limit: the whole window is the answer, so
     * there is no sort-then-limit here to hand back the earliest n of
     * something the caller wanted the end of.
     */
    return found.sort(
      (left, right) => left.startAt.getTime() - right.startAt.getTime(),
    );
  }

  /**
   * One calendar day, that day being the member's.
   *
   * P3's two touches call this: the evening proposal with tomorrow's local
   * date, the morning briefing with today's. Both are answers to "what is on
   * for that day where the member is", and neither caller should have to know
   * what instants that day's midnights name — resolving them in one place is
   * what keeps a member in Cairo from being told the server's day.
   */
  async onDate(
    userId: string,
    date: string,
  ): Promise<MeetingOccurrenceView[]> {
    const { timezone } = await this.member.clock(userId);
    const from = wallClockToUtc(`${date}T00:00`, timezone);
    const to = wallClockToUtc(`${nextDay(date)}T00:00`, timezone);
    if (!from || !to) return [];
    return this.forMember(userId, from, to);
  }
}

/**
 * The next calendar date, by calendar rather than by adding a day's worth of
 * milliseconds — a spring-forward day is 23 hours long, and 24 hours after its
 * midnight is one o'clock the following morning, so every meeting in that hour
 * would appear on two days at once.
 *
 * The same helper as `TasksDueQueryHandler`'s, duplicated rather than shared:
 * it is five lines, and the alternative is a cross-context import from a
 * `features/` file, which `no-restricted-imports` refuses and constitution IX
 * refuses for the better reason.
 */
function nextDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + 1),
  );
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(
    2,
    '0',
  )}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

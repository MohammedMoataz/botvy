import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { localDate } from '../../../../shared/time/time.js';
import type { CalendarEvent } from '../../domain/calendar-event.aggregate.js';
import {
  CalendarEventRepository,
  MeetingRepository,
} from '../../domain/meetings.repositories.js';
import {
  TimedTasksPort,
  TrainingSessionsPort,
} from '../../domain/meetings.ports.js';
import { humanRule } from '../../domain/recurrence-expander.js';
import {
  meetingView,
  type MeetingRecurrenceView,
  type MeetingView,
} from '../meetings/meetings.query.js';
import { MeetingOccurrencesQueryHandler } from '../meeting-occurrences/meeting-occurrences.query.js';

/**
 * What a row on the agenda is.
 *
 * Five kinds and no sixth, matching the SDL's `AgendaKind` exactly. `prep` is
 * a kind rather than a flag on a meeting row because it is a separate block on
 * the member's day (FR-002) — half an hour of preparation is half an hour that
 * is not free, and a client rendering it as an attribute of the meeting cannot
 * show that.
 */
export type AgendaKind = 'meeting' | 'prep' | 'task' | 'session' | 'event';

/** A personal event, as a row that carries its object hands it over (FR-011). */
export interface CalendarEventView {
  id: string;
  title: string;
  notes: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  color: string | null;
  recurrence: MeetingRecurrenceView | null;
}

/**
 * One row on the day.
 *
 * ## `id` is the underlying thing's id, and identity is the triple
 *
 * A row is identified by `(kind, id, occurrenceAt)`, not by `id` alone: a
 * meeting and its preparation block **share the meeting's id, deliberately**,
 * and a series contributes one row per occurrence. Sharing the id is what
 * makes tapping the preparation block open the meeting it is preparation for;
 * a synthesised composite id would be unique and would have nothing to open.
 *
 * ## Two of the five kinds carry their object, and three do not
 *
 * `meeting` is populated on a `meeting` row and on its `prep` row; `event` on
 * an `event` row; both are null everywhere else. `task` and `session` rows
 * carry no object at all, and that asymmetry is architectural rather than an
 * oversight.
 *
 * `Meeting` and `CalendarEvent` are **this context's own** aggregates, so
 * nesting their views costs nothing but the bytes. `Task` belongs to Planning
 * and `Session` to Training, and a `features/` file importing another
 * context's GraphQL type is precisely what constitution IX forbids and what
 * `no-restricted-imports` refuses in both directions. Faking it — a local
 * `AgendaTaskType` mirroring Planning's `Task` — would be worse than the gap:
 * a second declaration of somebody else's shape, free to drift from it, with
 * nothing in either repository saying they are meant to match.
 *
 * So a task row and a session row carry `(kind, id)` and the client asks the
 * context that owns them: `task(id)` on Planning's resolver, and Training's
 * equivalent from P6. Which is also why every row carries `title`, `subtitle`
 * and `color` regardless — the agenda renders completely from the row alone,
 * and the nested object is for the client that wants the *detail* without a
 * second round trip, never for the row to be legible.
 *
 * ## `endAt` is nullable, `occurrenceAt` never is
 *
 * A timed task has a moment and no length: "call the dentist at 15:00" is a
 * point on the day, and inventing an end for it would draw a block on an hour
 * grid that the member never asked for. Meetings, preparation blocks, sessions
 * and events all have one.
 */
export interface AgendaItem {
  kind: AgendaKind;
  id: string;
  occurrenceAt: Date;
  endAt: Date | null;
  title: string;
  subtitle: string | null;
  color: string | null;
  /**
   * A whole-day personal event, shown apart from the timed items (FR-011
   * scenario 1).
   *
   * It is still grouped into its day — a member looking at Tuesday wants to
   * see that Tuesday is a public holiday — but it has no place on an hour
   * grid, so the client needs to be told which rows to lift out of it. A flag
   * rather than a sixth kind: it is a property of one event, not a different
   * sort of thing, and `AgendaKind` is fixed by the contract.
   *
   * Always false for every other kind. A meeting that fills a day is a
   * personal event (FR-001), and a task with no time never reaches the agenda
   * at all — Planning's adapter excludes it, because "buy milk, some time
   * today" has no hour to sit at.
   */
  allDay: boolean;
  /** The meeting, on a `meeting` row and on its `prep` row. Null otherwise. */
  meeting: MeetingView | null;
  /** The event, on an `event` row. Null otherwise. */
  event: CalendarEventView | null;
}

/** One day, with its rows in order. `date` is the member's own local date. */
export interface AgendaDay {
  /** `YYYY-MM-DD`, in the member's zone. Never the server's. */
  date: string;
  items: AgendaItem[];
}

/**
 * The one screen in the product that is genuinely cross-context, and the one
 * most likely to be built by reaching into three collections.
 *
 * It merges four sources and names the port it reaches each through:
 *
 * 1. **Meetings**, through this context's own `MeetingOccurrencesQuery` — the
 *    same handler Notifications' alert saga calls. Not a second expansion of
 *    its own: the calendar and the alarms must never disagree about where an
 *    occurrence is, and the way to guarantee that is to have one caller-facing
 *    method rather than two call sites of one expander. Each occurrence with
 *    `prepMinutes > 0` contributes a **second** row of kind `prep` immediately
 *    before it (FR-002).
 * 2. **Timed tasks**, through `TimedTasksPort` → Planning's
 *    `TasksDueQueryHandler.timedBetween`, declared by P2 for exactly this
 *    caller. A range rather than a day at a time, because an agenda spans a
 *    month and asking day by day would be thirty round trips.
 * 3. **Training sessions**, through `TrainingSessionsPort` — an empty-list stub
 *    until P6 binds it to Training. The day renders correctly without a
 *    training row, because it is built from what is present rather than from a
 *    template with a hole in it; `meetings-read.spec.ts` asserts the stub
 *    contributes nothing rather than throwing, so P6 rebinding one line in the
 *    module is the whole change.
 * 4. **Personal events**, expanded through the same expander a meeting uses —
 *    one implementation of the recurrence logic, which is what stops a
 *    birthday moved one year coming out differently from a meeting moved one
 *    week (FR-011).
 *
 * ## Grouping is by the member's local date, and that is the whole point
 *
 * A meeting at 23:30 in Cairo belongs to that Cairo day. Grouped by the
 * server's date it lands on the next one, and the member opens Tuesday to find
 * Monday night's call on it — constitution XI, and the v1 bug it was written
 * after. So the boundary comes from `localDate(instant, timezone)` with the
 * timezone from `MemberContextPort`, and this file never reads `Date`'s own
 * local methods.
 */
@Injectable()
export class AgendaQueryHandler {
  constructor(
    private readonly occurrences: MeetingOccurrencesQueryHandler,
    private readonly tasks: TimedTasksPort,
    private readonly sessions: TrainingSessionsPort,
    private readonly events: CalendarEventRepository,
    /**
     * The same rows `occurrences.forMember` reads, loaded a second time — for
     * the *objects* a row carries and never for the expansion.
     *
     * A second read rather than a wider port, deliberately. The alternative is
     * `MeetingOccurrenceView` carrying a whole `MeetingView`, which would push
     * it onto Notifications' saga as well, and `MeetingView.nextOccurrence`
     * costs a 400-day expansion — paid per *occurrence* there, and paid per
     * *meeting* here, which for a month of 200 occurrences from a dozen series
     * is the difference between twelve expansions and two hundred. The port
     * stays narrow, the map is built once, and the expansion still comes from
     * exactly one place.
     */
    private readonly meetings: MeetingRepository,
    private readonly member: MemberContextPort,
  ) {}

  /**
   * Every kind of item in the window, grouped into the member's days and
   * ordered within each by instant.
   *
   * Days with nothing in them are **absent** rather than present and empty. A
   * day view asks for one day and gets one day or none; a week view draws
   * seven columns and fills the ones it was given. `MonthOverviewQuery` is the
   * read that returns a row per day, because a month grid genuinely needs to
   * know that the 14th is empty in order to leave it unmarked.
   */
  async between(userId: string, from: Date, to: Date): Promise<AgendaDay[]> {
    const { timezone } = await this.member.clock(userId);

    /*
     * The sources are asked in parallel because they are several different
     * stores' worth of latency and none depends on another's answer. A
     * sequential await here would be the agenda's 80 ms budget spent five
     * times over for no reason.
     */
    const now = new Date();
    const [occurrences, tasks, sessions, events, meetings] = await Promise.all([
      this.occurrences.forMember(userId, from, to),
      this.tasks.between(userId, from, to),
      this.sessions.between(userId, from, to),
      this.events.forWindow(userId, from, to),
      this.meetings.forWindow(userId, from, to),
    ]);

    // One view per *meeting*, not per occurrence: a series contributes many
    // rows and they all carry the same object. See the constructor's note.
    const meetingViews = new Map(
      meetings.map((meeting) => [
        meeting.id,
        meetingView(meeting, timezone, now),
      ]),
    );

    const items: AgendaItem[] = [];

    for (const occurrence of occurrences) {
      const meeting = meetingViews.get(occurrence.meetingId) ?? null;
      items.push({
        kind: 'meeting',
        id: occurrence.meetingId,
        occurrenceAt: occurrence.startAt,
        endAt: occurrence.endAt,
        title: occurrence.title,
        subtitle: locationLine(occurrence.location),
        color: null,
        allDay: false,
        meeting,
        event: null,
      });

      if (occurrence.prepMinutes > 0) {
        /*
         * Immediately before the meeting, ending exactly where it starts
         * (FR-002, story 1 scenario 3). Derived from the *occurrence* and not
         * from the meeting's `startAt`, so a moved occurrence takes its
         * preparation with it — otherwise a member who dragged Tuesday's
         * meeting to Thursday would still be told to prepare on Tuesday.
         */
        items.push({
          kind: 'prep',
          id: occurrence.meetingId,
          occurrenceAt: new Date(
            occurrence.startAt.getTime() - occurrence.prepMinutes * 60_000,
          ),
          endAt: occurrence.startAt,
          title: `Prepare: ${occurrence.title}`,
          subtitle: null,
          color: null,
          allDay: false,
          // The same meeting as the row above, so tapping either opens it.
          meeting,
          event: null,
        });
      }
    }

    for (const task of tasks) {
      items.push({
        kind: 'task',
        id: task.id,
        occurrenceAt: task.dueAt,
        // A task has a moment and no length. See `AgendaItem.endAt`.
        endAt: null,
        title: task.title,
        subtitle: null,
        // Planning's label colour, so the agenda tints the row as the list does.
        color: task.color,
        allDay: false,
        // Planning owns the task and this context may not declare its type.
        // See `AgendaItem`'s note on the asymmetry.
        meeting: null,
        event: null,
      });
    }

    for (const session of sessions) {
      items.push({
        kind: 'session',
        id: session.id,
        occurrenceAt: session.startAt,
        endAt: new Date(
          session.startAt.getTime() + session.durationMin * 60_000,
        ),
        title: session.title,
        subtitle: session.sport,
        color: null,
        allDay: false,
        // Training's, from P6. Same reason as the task row above.
        meeting: null,
        event: null,
      });
    }

    for (const event of events) {
      // Built once per event, outside the occurrence loop, for the same reason
      // the meeting map is built once per meeting.
      const view = eventView(event);
      for (const occurrence of event.occurrencesBetween(from, to, timezone)) {
        items.push({
          kind: 'event',
          id: event.id,
          occurrenceAt: occurrence.startAt,
          endAt: occurrence.endAt,
          title: occurrence.title,
          subtitle: null,
          color: event.color,
          allDay: event.allDay,
          meeting: null,
          event: view,
        });
      }
    }

    return groupByMemberDay(items, timezone);
  }
}

/**
 * A personal event, as an agenda row hands it over.
 *
 * `startAt` and `endAt` are the **series'** own, not the occurrence's — the
 * occurrence is already on the row as `occurrenceAt` and `endAt`, and the
 * object is the thing the member would open, which is the event itself.
 * Copying the occurrence into both would give a client two answers to one
 * question and no way to tell which was the series.
 *
 * `humanText` is rendered against the event's *authored* zone, which is the
 * zone the digits are written in — an event has no `lockTimezone` (a birthday
 * is a date, so pinning it to a zone would put a member's own birthday on the
 * wrong day where they land), so there is only the one choice to make.
 */
function eventView(event: CalendarEvent): CalendarEventView {
  return {
    id: event.id,
    title: event.title,
    notes: event.notes,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
    color: event.color,
    recurrence: event.recurrence
      ? {
          dtstart: event.recurrence.dtstart,
          rrule: event.recurrence.rrule,
          humanText: humanRule(event.recurrence, event.authoredTimezone),
          exdates: [...event.recurrence.exdates],
          overrides: event.recurrence.overrides.map((override) => ({
            ...override,
          })),
        }
      : null,
  };
}

/**
 * Rows into days, on the member's clock.
 *
 * Grouped by `localDate(occurrenceAt, timezone)` — an all-day event included,
 * which puts a multi-day holiday on its first day only. That is a deliberate
 * simplification: repeating it onto every day it spans is what a month grid
 * wants and what a day list does not, and the day list is what exists now.
 *
 * ponytail: first day only, spread an all-day event across its span when the
 * month grid needs a bar rather than a marker.
 */
function groupByMemberDay(items: AgendaItem[], timezone: string): AgendaDay[] {
  const days = new Map<string, AgendaItem[]>();

  for (const item of items) {
    const date = localDate(item.occurrenceAt, timezone);
    const day = days.get(date);
    if (day) day.push(item);
    else days.set(date, [item]);
  }

  return [...days.entries()]
    .map(([date, dayItems]) => ({
      date,
      /*
       * By instant, and a preparation block therefore lands before its meeting
       * on its own — its `occurrenceAt` is earlier by `prepMinutes`, which is
       * greater than zero or the row does not exist. No special case needed,
       * and no tie to break: two things genuinely at the same instant are two
       * things at the same instant, and the member's clock cannot say which
       * comes first either.
       */
      items: dayItems.sort(
        (left, right) =>
          left.occurrenceAt.getTime() - right.occurrenceAt.getTime(),
      ),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

/**
 * Where the meeting is, in one line.
 *
 * The address when there is one, because a member who has to travel needs to
 * know where; "Online" when there is only a link, because the link itself is a
 * URL nobody reads off a list row — it is the notification's tap target
 * (story 1 scenario 1), not a subtitle. A meeting always has one or the other:
 * `Meeting.schedule` refuses one with neither (FR-001).
 */
function locationLine(location: {
  onlineLink: string | null;
  address: string | null;
}): string | null {
  if (location.address) return location.address;
  if (location.onlineLink) return 'Online';
  return null;
}

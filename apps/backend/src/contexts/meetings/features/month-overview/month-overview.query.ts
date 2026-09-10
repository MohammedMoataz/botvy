import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { wallClockToUtc } from '../../../../shared/time/time.js';
import {
  AgendaQueryHandler,
  type AgendaKind,
} from '../agenda/agenda.query.js';

/** How many of each kind a day holds. Every key present, zeroes included. */
export interface AgendaKindCounts {
  meeting: number;
  prep: number;
  task: number;
  session: number;
  event: number;
}

/** One cell of the month grid. */
export interface MonthDay {
  /** `YYYY-MM-DD`, in the member's zone. */
  date: string;
  total: number;
  byKind: AgendaKindCounts;
  /**
   * Marked in the week and month views (FR-009).
   *
   * **A day is busy when it holds at least one item of any kind.** That is a
   * product decision written into the requirement, not an implementation
   * detail, and it is stated here because it is exactly the sort of line
   * somebody later "tunes" — a threshold of two, or a rule about meetings
   * counting and tasks not, or an hours-booked total. Every one of those makes
   * the month view disagree with the day view it opens: a member taps an
   * unmarked day and finds a meeting on it, and now the marker is worse than
   * no marker at all. If the threshold is ever to change it changes in the
   * spec first.
   */
  busy: boolean;
}

/**
 * The month grid: the same items the agenda merges, counted per day.
 *
 * Built by asking `AgendaQuery` rather than by counting the four sources
 * itself, which is the difference between "the same items" and "items that
 * ought to be the same". A second merge would be a second set of decisions
 * about whether a preparation block counts, which day a 23:30 meeting lands
 * on, and whether a completed meeting still shows — three chances for the
 * month view to mark a day the day view then shows as empty.
 *
 * It costs one extra pass over a month's worth of rows, which against the
 * plan's 80 ms budget for 200 occurrences is not the expensive part; the
 * expansion is, and it happens once either way.
 */
@Injectable()
export class MonthOverviewQueryHandler {
  constructor(
    private readonly agenda: AgendaQueryHandler,
    private readonly member: MemberContextPort,
  ) {}

  /**
   * `month` is 1–12, as a member says it and as the SDL takes it.
   *
   * Not zero-based: the argument crosses a GraphQL boundary where nobody can
   * see a comment, and `month: 9` meaning October is the kind of off-by-one
   * that shows up as a whole month of markers on the wrong screen.
   *
   * Returns a row for **every** day of the month, empty ones included, and
   * that is the difference between this read and the agenda's. A month grid
   * has to know the 14th is empty in order to leave it unmarked; a day list
   * only ever asks about days the member is looking at.
   */
  async forMonth(
    userId: string,
    year: number,
    month: number,
  ): Promise<MonthDay[]> {
    const { timezone } = await this.member.clock(userId);

    /*
     * Both boundaries resolved in the member's zone, and the end taken as the
     * *first day of the next month* rather than as "the last day plus 24
     * hours". The month a clock change falls in is one hour shorter or longer
     * than the arithmetic says, and a window built by adding milliseconds
     * either drops the last hour of the 31st or reaches into the 1st.
     */
    const first = `${pad4(year)}-${pad2(month)}-01`;
    const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    const from = wallClockToUtc(`${first}T00:00`, timezone);
    const to = wallClockToUtc(
      `${pad4(nextMonth.year)}-${pad2(nextMonth.month)}-01T00:00`,
      timezone,
    );
    if (!from || !to) return [];

    const days = await this.agenda.between(userId, from, to);
    const counted = new Map(days.map((day) => [day.date, day.items]));

    const grid: MonthDay[] = [];
    for (let day = 1; day <= daysInMonth(year, month); day += 1) {
      const date = `${pad4(year)}-${pad2(month)}-${pad2(day)}`;
      const items = counted.get(date) ?? [];
      const byKind: AgendaKindCounts = {
        meeting: 0,
        prep: 0,
        task: 0,
        session: 0,
        event: 0,
      };
      for (const item of items) byKind[item.kind as AgendaKind] += 1;

      grid.push({
        date,
        total: items.length,
        byKind,
        // FR-009, one item of any kind. See `MonthDay.busy`.
        busy: items.length > 0,
      });
    }

    return grid;
  }
}

/**
 * Day 0 of the next month is the last day of this one, which is how many days
 * it has — including a leap February, without a table and without a rule about
 * centuries.
 */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function pad4(value: number): string {
  return String(value).padStart(4, '0');
}

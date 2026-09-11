import { localDay } from './tasks-store.js';
import { wallClockToUtc } from './recurrence.js';

/**
 * The member's own day, and the window the panel draws (P9, FR-013).
 *
 * **Times belong to the member, not to the machine.** `timeZone` is a required
 * argument everywhere in this file and there is no default: a browser in a
 * hotel is no more authoritative than a server in Frankfurt, and reading the
 * host's own zone is the mistake that once shifted every extracted reminder by
 * three hours. The extension gets the zone from `profile.timezone`, cached at
 * sign-in, because the sync subset it holds does not include the profile and
 * widening a contract for one field is not the way to get it.
 *
 * Two shapes, and the difference matters:
 *
 * - **A calendar date** (`todayIn`) for comparing days. No boundary arithmetic
 *   at all, so no chance of getting a 23-hour spring-forward day wrong — this
 *   is what `localDay` already does for the phone's Today list.
 * - **A pair of instants** (`dayWindow`) for filtering things that carry a
 *   moment, which is what the meetings view needs: a meeting is an instant, and
 *   "the next seven days" is a range over instants that must start at the
 *   member's own midnight rather than at the browser's.
 */

/** `YYYY-MM-DD` where the member is, right now. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return localDay(now, timeZone);
}

/** The day after a `YYYY-MM-DD`, as a string. Pure calendar arithmetic. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  // `Date.UTC` so the arithmetic happens in a zone with no daylight saving of
  // its own. The result is a calendar date, not an instant — it is turned back
  // into one against the member's zone by `dayWindow`, which is where a
  // spring-forward midnight is resolved.
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export interface DayWindow {
  /** The member's own local date the window opens on, `YYYY-MM-DD`. */
  from: string;
  /** The local date it closes on, inclusive. */
  to: string;
  /** The instant the member's `from` day begins. */
  start: Date;
  /**
   * The instant the member's `to` day ends — the *last millisecond* of it.
   *
   * Inclusive rather than "the start of the next day", so a caller comparing
   * `startAt <= end` cannot include a meeting at exactly midnight tomorrow. The
   * phone's own range reads make the same call, and the two surfaces disagreeing
   * about whether tomorrow's midnight belongs to today would show the member a
   * meeting on two days.
   */
  end: Date;
}

/**
 * `days` of the member's calendar, starting today, as instants.
 *
 * Built from the member's **wall clock** rather than by adding milliseconds: a
 * day containing a clock change is not twenty-four hours long, and 24 hours
 * after a spring-forward midnight is one in the morning of the day after. The
 * boundaries go through `wallClockToUtc`, which resolves a wall clock that does
 * not exist — the hour a spring-forward skips — rather than producing a silent
 * one-hour error.
 */
export function dayWindow(
  timeZone: string,
  days = 7,
  now: Date = new Date(),
): DayWindow {
  const from = todayIn(timeZone, now);
  // `days` is a count of days including today, so seven days from Monday ends
  // on Sunday. A caller asking for one day gets today alone.
  const to = addDays(from, Math.max(1, days) - 1);

  const start = wallClockToUtc(`${from}T00:00`, timeZone);
  const nextMidnight = wallClockToUtc(`${addDays(to, 1)}T00:00`, timeZone);

  /*
   * A null from `wallClockToUtc` means the member's zone is one this runtime
   * does not know, which is a signed-in member whose profile carries a zone
   * this browser's ICU build has never heard of. Falling back to the instant
   * arithmetic is wrong by at most an hour and only in that case; throwing
   * would take the whole panel down over a string.
   */
  const startAt = start ?? new Date(`${from}T00:00:00.000Z`);
  const endAt = nextMidnight
    ? new Date(nextMidnight.getTime() - 1)
    : new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_399_999);

  return { from, to, start: startAt, end: endAt };
}

/** Whether an instant falls inside a window. Inclusive at both ends. */
export function within(window: DayWindow, instant: string | Date): boolean {
  const at = instant instanceof Date ? instant : new Date(instant);
  return at >= window.start && at <= window.end;
}

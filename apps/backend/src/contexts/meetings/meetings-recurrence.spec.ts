import { describe, expect, it } from 'vitest';
import {
  localDate,
  localHhMm,
  wallClockToUtc,
} from '../../shared/time/time.js';
import { CalendarEvent } from './domain/calendar-event.aggregate.js';
import { Meeting, MeetingRuleError } from './domain/meeting.aggregate.js';
import {
  expandOccurrences,
  moveInRule,
  orphanedOverrides,
  skipInRule,
  type MeetingRecurrence,
  type Repeating,
} from './domain/recurrence-expander.js';

/**
 * The recurrence table. This is the highest-risk logic in the platform, and it
 * is specced case by case here and again, case for case, in the phone's own
 * `test/recurrence_expander_test.dart` — two implementations exist because the
 * calendar has to work with the network off (FR-010), and one fixture table is
 * what stops them diverging.
 *
 * ## Every date is computed from the clock, never written down
 *
 * `Date.now()` is the anchor for all of it: the next 31st, the next offset
 * change in a zone that observes daylight saving, tomorrow's weekday. A
 * fixture pinned to a real date is a time bomb — it passes until the day the
 * clock reaches it, and the month-end and clock-change cases are exactly the
 * ones whose literal dates rot. `nextOffsetChange` finds the transition by
 * asking the zone rather than by knowing when Europe moves its clocks, so a
 * rule change in some future year is a fixture that keeps working.
 */

const CAIRO = 'Africa/Cairo';
const BERLIN = 'Europe/Berlin';
const DAY_MS = 86_400_000;

// ------------------------------------------------------------- clock helpers

/** The instant a wall clock names in a zone, on a given local date. */
function at(date: string, hhmm: string, zone: string): Date {
  const instant = wallClockToUtc(`${date}T${hhmm}`, zone);
  if (!instant) throw new Error(`cannot resolve ${date}T${hhmm} in ${zone}`);
  return instant;
}

function addLocalDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const moved = new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days),
  );
  return moved.toISOString().slice(0, 10);
}

function today(zone: string): string {
  return localDate(new Date(), zone);
}

/** `MO`, `TU`, … for a local date, which is what an RRULE's `BYDAY` wants. */
function byDayOf(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][weekday]!;
}

/** The next local date on or after today whose day-of-month is `day`. */
function nextDayOfMonth(day: number, zone: string): string {
  let date = today(zone);
  for (let index = 0; index < 400; index += 1) {
    if (Number(date.slice(8, 10)) === day) return date;
    date = addLocalDays(date, 1);
  }
  throw new Error(`no ${day}th within a year`);
}

/**
 * The next local date in `zone` whose UTC offset differs from the day before —
 * a clock change, in whichever direction the zone is about to move.
 *
 * Found by comparing what 12:00 costs in UTC on consecutive days, so it needs
 * no table of transition dates and stays correct through a rule change. Midday
 * rather than midnight because a spring-forward gap can swallow 00:30 and make
 * two adjacent days look identical.
 */
function nextOffsetChange(zone: string): string | null {
  let date = today(zone);
  let previous = offsetAtNoon(date, zone);
  for (let index = 0; index < 430; index += 1) {
    const next = addLocalDays(date, 1);
    const offset = offsetAtNoon(next, zone);
    if (offset !== previous) return next;
    previous = offset;
    date = next;
  }
  return null;
}

function offsetAtNoon(date: string, zone: string): number {
  const instant = at(date, '12:00', zone);
  return instant.getTime() - Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    12,
  );
}

// -------------------------------------------------------------- the fixtures

function meetingFixture(
  overrides: Partial<Parameters<typeof Meeting.schedule>[0]> = {},
): Meeting {
  const date = today(CAIRO);
  return Meeting.schedule({
    id: 'm-1',
    userId: 'u-1',
    title: 'Standup',
    description: null,
    startAt: at(date, '18:00', CAIRO),
    durationMin: 30,
    lockTimezone: null,
    location: { onlineLink: 'https://meet.example/abc', address: null },
    prepNotes: null,
    prepMinutes: 0,
    reminderOffsets: [1440, 30],
    recurrence: null,
    source: 'app',
    createdAt: new Date(),
    timezone: CAIRO,
    ...overrides,
  });
}

function rule(
  rrule: string,
  dtstart: Date,
  extras: Partial<MeetingRecurrence> = {},
): MeetingRecurrence {
  return { dtstart, rrule, exdates: [], overrides: [], ...extras };
}

function repeating(item: Partial<Repeating> & { startAt: Date }): Repeating {
  return {
    title: 'Standup',
    durationMin: 30,
    location: { onlineLink: null, address: 'Room 1' },
    recurrence: null,
    lockTimezone: null,
    authoredTimezone: CAIRO,
    ...item,
  };
}

// ------------------------------------------------------------------ the table

describe('a one-off meeting', () => {
  it('appears in a window that contains it and not in one that does not', () => {
    const date = today(CAIRO);
    const meeting = meetingFixture();

    const inside = meeting.occurrencesBetween(
      at(date, '00:00', CAIRO),
      at(date, '23:59', CAIRO),
      CAIRO,
    );
    expect(inside).toHaveLength(1);
    expect(localHhMm(inside[0]!.startAt, CAIRO)).toBe('18:00');

    const after = meeting.occurrencesBetween(
      at(addLocalDays(date, 3), '00:00', CAIRO),
      at(addLocalDays(date, 4), '00:00', CAIRO),
      CAIRO,
    );
    expect(after).toEqual([]);
  });

  it('is included when it is already under way as the window opens', () => {
    /*
     * A meeting from 17:45 to 18:15 belongs on an agenda for 18:00 onwards. A
     * window test on `startAt` alone would drop it, and the member would read
     * as free during a call they are on.
     */
    const date = today(CAIRO);
    const meeting = meetingFixture({
      startAt: at(date, '17:45', CAIRO),
      durationMin: 30,
    });

    const found = meeting.occurrencesBetween(
      at(date, '18:00', CAIRO),
      at(date, '19:00', CAIRO),
      CAIRO,
    );
    expect(found).toHaveLength(1);
  });

  it('expands to nothing once completed, cancelled or deleted', () => {
    const date = today(CAIRO);
    const from = at(date, '00:00', CAIRO);
    const to = at(date, '23:59', CAIRO);

    const completed = meetingFixture();
    completed.complete();
    expect(completed.occurrencesBetween(from, to, CAIRO)).toEqual([]);

    const cancelled = meetingFixture();
    cancelled.cancel();
    expect(cancelled.occurrencesBetween(from, to, CAIRO)).toEqual([]);

    const deleted = meetingFixture();
    deleted.tombstone();
    expect(deleted.occurrencesBetween(from, to, CAIRO)).toEqual([]);
  });
});

describe('a weekly series', () => {
  it('puts the first occurrence on the next matching day, not eight days out', () => {
    /*
     * The spec's first edge case: a weekly meeting created on a Sunday for
     * "every Monday" starts tomorrow. Written with *tomorrow's* weekday
     * whatever day the suite runs, so it is the same assertion every day of
     * the week rather than one that only means something on Sundays.
     */
    const start = today(CAIRO);
    const tomorrow = addLocalDays(start, 1);
    const meeting = meetingFixture({
      startAt: at(start, '18:00', CAIRO),
      recurrence: rule(
        `FREQ=WEEKLY;BYDAY=${byDayOf(tomorrow)}`,
        at(start, '18:00', CAIRO),
      ),
    });

    const found = meeting.occurrencesBetween(
      at(start, '00:00', CAIRO),
      at(addLocalDays(start, 8), '00:00', CAIRO),
      CAIRO,
    );

    expect(localDate(found[0]!.startAt, CAIRO)).toBe(tomorrow);
    expect(localHhMm(found[0]!.startAt, CAIRO)).toBe('18:00');
  });

  it('keeps its local wall time across a clock change (FR-007, SC-005)', () => {
    const change = nextOffsetChange(BERLIN);
    if (!change) {
      // A zone that has stopped observing daylight saving would make this
      // vacuous rather than failing, and saying so is better than a green tick
      // that proves nothing.
      expect(change, 'Europe/Berlin no longer changes its clocks').not.toBeNull();
      return;
    }

    // Anchored a fortnight before the change so the series crosses it.
    const start = addLocalDays(change, -14);
    const meeting = meetingFixture({
      // Written *in* Berlin, so Berlin is the authored zone. Passing Cairo here
      // would be a fixture describing a member who wrote a Berlin wall clock
      // while reading a Cairo one, which is not a state that exists — and the
      // expander would rightly re-read the digits as 19:00.
      timezone: BERLIN,
      startAt: at(start, '18:00', BERLIN),
      recurrence: rule('FREQ=DAILY;COUNT=28', at(start, '18:00', BERLIN)),
    });

    const found = meeting.occurrencesBetween(
      at(start, '00:00', BERLIN),
      at(addLocalDays(start, 28), '00:00', BERLIN),
      BERLIN,
    );

    expect(found.length).toBeGreaterThan(20);
    for (const occurrence of found) {
      expect(localHhMm(occurrence.startAt, BERLIN)).toBe('18:00');
    }
    // And the instants really do differ either side of the change — otherwise
    // the assertion above would also pass for a zone with no transition at all.
    const before = found.find(
      (item) => localDate(item.startAt, BERLIN) < change,
    )!;
    const after = found.find(
      (item) => localDate(item.startAt, BERLIN) >= change,
    )!;
    const dayLength =
      (after.startAt.getTime() - before.startAt.getTime()) % DAY_MS;
    expect(dayLength).not.toBe(0);
  });
});

describe('a monthly series, both ways (spec story 2, scenario 1)', () => {
  it('BYMONTHDAY=31 skips the months that have no 31st', () => {
    const start = nextDayOfMonth(31, CAIRO);
    const meeting = meetingFixture({
      startAt: at(start, '10:00', CAIRO),
      recurrence: rule('FREQ=MONTHLY;BYMONTHDAY=31', at(start, '10:00', CAIRO)),
    });

    const found = meeting.occurrencesBetween(
      at(start, '00:00', CAIRO),
      new Date(at(start, '00:00', CAIRO).getTime() + 400 * DAY_MS),
      CAIRO,
    );

    expect(found.length).toBeGreaterThan(5);
    for (const occurrence of found) {
      const local = localDate(occurrence.startAt, CAIRO);
      expect(local.slice(8, 10)).toBe('31');
      expect(local.slice(5, 7)).not.toBe('02');
    }
  });

  it('BYMONTHDAY=-1 lands on the last day of February instead', () => {
    const start = nextDayOfMonth(31, CAIRO);
    const meeting = meetingFixture({
      startAt: at(start, '10:00', CAIRO),
      recurrence: rule('FREQ=MONTHLY;BYMONTHDAY=-1', at(start, '10:00', CAIRO)),
    });

    const found = meeting.occurrencesBetween(
      at(start, '00:00', CAIRO),
      new Date(at(start, '00:00', CAIRO).getTime() + 400 * DAY_MS),
      CAIRO,
    );

    const february = found
      .map((occurrence) => localDate(occurrence.startAt, CAIRO))
      .find((local) => local.slice(5, 7) === '02');

    expect(february).toBeDefined();
    expect(['28', '29']).toContain(february!.slice(8, 10));
    // Exactly one, so a clamp has not doubled the month.
    expect(
      found.filter(
        (occurrence) =>
          localDate(occurrence.startAt, CAIRO).slice(5, 7) === '02',
      ),
    ).toHaveLength(1);
  });
});

describe('skipping and moving one occurrence (FR-005)', () => {
  const start = () => today(CAIRO);

  function weekly(): Meeting {
    const from = start();
    return meetingFixture({
      startAt: at(from, '18:00', CAIRO),
      recurrence: rule('FREQ=WEEKLY;COUNT=6', at(from, '18:00', CAIRO)),
    });
  }

  function windowOf(meeting: Meeting) {
    const from = at(start(), '00:00', CAIRO);
    return meeting.occurrencesBetween(
      from,
      new Date(from.getTime() + 60 * DAY_MS),
      CAIRO,
    );
  }

  it('a six-week series with one skip and one move renders five, one moved (SC-001)', () => {
    const meeting = weekly();
    const all = windowOf(meeting);
    expect(all).toHaveLength(6);

    meeting.skipOccurrence(all[2]!.originalStart);
    const movedTo = new Date(all[4]!.originalStart.getTime() + 3_600_000);
    meeting.moveOccurrence(all[4]!.originalStart, movedTo);

    const after = windowOf(meeting);
    expect(after).toHaveLength(5);
    expect(after.filter((occurrence) => occurrence.moved)).toHaveLength(1);
    expect(
      after.find((occurrence) => occurrence.moved)!.startAt.getTime(),
    ).toBe(movedTo.getTime());

    // The rest are untouched: the series is a rule, and bending one date did
    // not rewrite it.
    const untouched = after.filter((occurrence) => !occurrence.moved);
    expect(untouched).toHaveLength(4);
    for (const occurrence of untouched) {
      expect(localHhMm(occurrence.startAt, CAIRO)).toBe('18:00');
    }
  });

  it('moving the occurrence that was skipped un-skips it (spec edge case)', () => {
    /*
     * "An occurrence moved onto a date that is already skipped: the move wins
     * and the skip is cleared", read against what is actually stored.
     *
     * An exclusion is keyed by `originalStart` and the expander filters rule
     * dates through it *before* applying overrides. So the case that needs the
     * skip cleared is skipping week four and then moving **week four**:
     * without it the rule date is excluded, the override keyed to it is never
     * reached, and the member's drag silently does nothing.
     */
    const meeting = weekly();
    const all = windowOf(meeting);
    const skipped = all[3]!.originalStart;

    meeting.skipOccurrence(skipped);
    expect(windowOf(meeting)).toHaveLength(5);

    const movedTo = new Date(skipped.getTime() + 2 * 3_600_000);
    meeting.moveOccurrence(skipped, movedTo);

    const after = windowOf(meeting);
    expect(meeting.recurrence!.exdates).toHaveLength(0);
    expect(after).toHaveLength(6);
    expect(
      after.filter(
        (occurrence) => occurrence.startAt.getTime() === movedTo.getTime(),
      ),
    ).toHaveLength(1);
  });

  it('moving one occurrence onto another’s skipped date leaves that skip alone', () => {
    /*
     * The reading this first shipped with, and it was wrong: clearing the
     * *destination* exclusion resurrects the occurrence the member cancelled,
     * so somebody who skipped week four and then dragged week two onto it ended
     * up with two meetings that day and the cancelled one back.
     *
     * Nothing needs clearing for the drag to land, because the override is
     * keyed to week two and the exclusion to week four.
     */
    const meeting = weekly();
    const all = windowOf(meeting);
    const skipped = all[3]!.originalStart;

    meeting.skipOccurrence(skipped);
    meeting.moveOccurrence(all[1]!.originalStart, skipped);

    const after = windowOf(meeting);
    expect(meeting.recurrence!.exdates).toHaveLength(1);
    expect(
      after.filter(
        (occurrence) => occurrence.startAt.getTime() === skipped.getTime(),
      ),
    ).toHaveLength(1);
    // Six rule dates: week two moved away from its own, week four stays
    // skipped, and the drag occupies week four's slot.
    expect(after).toHaveLength(5);
  });

  it('skipping an occurrence drops the override that described it', () => {
    const meeting = weekly();
    const all = windowOf(meeting);
    meeting.moveOccurrence(
      all[2]!.originalStart,
      new Date(all[2]!.originalStart.getTime() + 3_600_000),
    );
    expect(meeting.recurrence!.overrides).toHaveLength(1);

    meeting.skipOccurrence(all[2]!.originalStart);
    expect(meeting.recurrence!.overrides).toHaveLength(0);
    expect(windowOf(meeting)).toHaveLength(5);
  });

  it('refuses a skip or a move on a meeting that does not repeat', () => {
    const meeting = meetingFixture();
    expect(() => meeting.skipOccurrence(meeting.startAt)).toThrow(
      MeetingRuleError,
    );
    expect(() =>
      meeting.moveOccurrence(meeting.startAt, new Date()),
    ).toThrow(MeetingRuleError);
  });

  it('includes an occurrence an override moved in from outside the window', () => {
    /*
     * A member drags next week's meeting a month forward. The rule still
     * generates next week, so the override is not orphaned from the series —
     * it is orphaned from the *window*, and a month view of the month it landed
     * in would show nothing at all without the override list being read
     * directly.
     */
    const from = start();
    const anchor = at(from, '18:00', CAIRO);
    const nextWeek = new Date(anchor.getTime() + 7 * DAY_MS);
    const landing = new Date(anchor.getTime() + 40 * DAY_MS);

    const item = repeating({
      startAt: anchor,
      recurrence: rule('FREQ=WEEKLY;COUNT=4', anchor, {
        overrides: [{ originalStart: nextWeek, startAt: landing }],
      }),
    });

    const found = expandOccurrences(
      item,
      new Date(landing.getTime() - DAY_MS),
      new Date(landing.getTime() + DAY_MS),
      CAIRO,
    );

    expect(found).toHaveLength(1);
    expect(found[0]!.startAt.getTime()).toBe(landing.getTime());
    expect(found[0]!.originalStart.getTime()).toBe(nextWeek.getTime());
    expect(found[0]!.moved).toBe(true);
  });
});

describe('a series edit that would orphan a moved occurrence', () => {
  it('is refused, naming the moments at stake, and goes through when forced', () => {
    const from = today(CAIRO);
    const anchor = at(from, '18:00', CAIRO);
    const meeting = meetingFixture({
      startAt: anchor,
      recurrence: rule('FREQ=WEEKLY;COUNT=6', anchor),
    });

    const all = meeting.occurrencesBetween(
      anchor,
      new Date(anchor.getTime() + 60 * DAY_MS),
      CAIRO,
    );
    const weekFive = all[4]!.originalStart;
    meeting.moveOccurrence(weekFive, new Date(weekFive.getTime() + 3_600_000));

    // Shortened to three: week five is no longer a date the rule produces.
    const shortened = rule('FREQ=WEEKLY;COUNT=3', anchor);

    let refused: MeetingRuleError | null = null;
    try {
      meeting.edit({ recurrence: shortened }, CAIRO);
    } catch (error) {
      refused = error as MeetingRuleError;
    }

    expect(refused?.code).toBe('orphaned_overrides');
    expect(refused?.orphans.map((date) => date.getTime())).toEqual([
      weekFive.getTime(),
    ]);
    // Refused means refused: nothing was written.
    expect(meeting.recurrence!.overrides).toHaveLength(1);
    expect(meeting.recurrence!.rrule).toBe('FREQ=WEEKLY;COUNT=6');

    meeting.edit({ recurrence: shortened }, CAIRO, { force: true });
    expect(meeting.recurrence!.rrule).toBe('FREQ=WEEKLY;COUNT=3');
    expect(meeting.recurrence!.overrides).toHaveLength(0);
  });

  it('keeps the skips and moves a rule change did not invalidate', () => {
    /*
     * A client editing "every week on Monday" to "Monday and Wednesday" sends
     * the rule, not the exception lists. A patch that reset them would silently
     * throw away every skip and every move for a change that kept them valid.
     */
    const from = today(CAIRO);
    const anchor = at(from, '18:00', CAIRO);
    const monday = byDayOf(from);
    const meeting = meetingFixture({
      startAt: anchor,
      recurrence: rule(`FREQ=WEEKLY;BYDAY=${monday}`, anchor),
    });

    const all = meeting.occurrencesBetween(
      anchor,
      new Date(anchor.getTime() + 30 * DAY_MS),
      CAIRO,
    );
    meeting.skipOccurrence(all[1]!.originalStart);
    meeting.moveOccurrence(
      all[2]!.originalStart,
      new Date(all[2]!.originalStart.getTime() + 3_600_000),
    );

    const widened = byDayOf(addLocalDays(from, 2));
    meeting.edit(
      { recurrence: rule(`FREQ=WEEKLY;BYDAY=${monday},${widened}`, anchor) },
      CAIRO,
    );

    expect(meeting.recurrence!.exdates).toHaveLength(1);
    expect(meeting.recurrence!.overrides).toHaveLength(1);
  });

  it('reports no orphan for an override the new rule still generates', () => {
    const from = today(CAIRO);
    const anchor = at(from, '18:00', CAIRO);
    const second = new Date(anchor.getTime() + 7 * DAY_MS);
    const recurrence = rule('FREQ=WEEKLY;COUNT=6', anchor, {
      overrides: [
        { originalStart: second, startAt: new Date(second.getTime() + 60_000) },
      ],
    });
    expect(orphanedOverrides(recurrence, CAIRO)).toEqual([]);
  });
});

describe('lockTimezone (FR-007)', () => {
  it('keeps the series on its own clock when the member has moved', () => {
    const from = today(CAIRO);
    const anchor = at(from, '18:00', CAIRO);
    const pinned = meetingFixture({
      startAt: anchor,
      lockTimezone: CAIRO,
      recurrence: rule('FREQ=DAILY;COUNT=10', anchor),
    });
    const floating = meetingFixture({
      startAt: anchor,
      lockTimezone: null,
      recurrence: rule('FREQ=DAILY;COUNT=10', anchor),
    });

    // Both were written in Cairo — `meetingFixture` passes `timezone: CAIRO`,
    // so that is their `authoredTimezone`. The member is now in Berlin.
    const window: [Date, Date] = [
      anchor,
      new Date(anchor.getTime() + 10 * DAY_MS),
    ];
    const pinnedOccurrences = pinned.occurrencesBetween(
      window[0],
      window[1],
      BERLIN,
    );
    const floatingOccurrences = floating.occurrencesBetween(
      window[0],
      window[1],
      BERLIN,
    );

    // Pinned: still 18:00 on Cairo's clock, whatever the member's is.
    expect(
      new Set(
        pinnedOccurrences.map((occurrence) =>
          localHhMm(occurrence.startAt, CAIRO),
        ),
      ),
    ).toEqual(new Set(['18:00']));

    // Unpinned: 18:00 on the member's own clock — it followed them.
    expect(
      new Set(
        floatingOccurrences.map((occurrence) =>
          localHhMm(occurrence.startAt, BERLIN),
        ),
      ),
    ).toEqual(new Set(['18:00']));

    /*
     * And the two are genuinely different instants, which is the assertion
     * that would have caught the first implementation here: it read the stored
     * instant's Berlin digits (17:00) and expanded those, so *both* sets came
     * back looking plausible while the unpinned series sat an hour off what the
     * member had asked for.
     */
    expect(floatingOccurrences[1]!.startAt.getTime()).not.toBe(
      pinnedOccurrences[1]!.startAt.getTime(),
    );
  });

  it('re-reads a one-off in the member’s new zone, and not a pinned one', () => {
    // FR-014's other half: the same rule applies to a meeting with no repeat,
    // because a one-off that behaved differently from a series of one would be
    // a distinction the member cannot see in the editor.
    const anchor = at(today(CAIRO), '10:00', CAIRO);
    const floating = meetingFixture({ startAt: anchor, lockTimezone: null });
    const pinned = meetingFixture({ startAt: anchor, lockTimezone: CAIRO });

    const window: [Date, Date] = [
      new Date(anchor.getTime() - DAY_MS),
      new Date(anchor.getTime() + DAY_MS),
    ];

    const moved = floating.occurrencesBetween(window[0], window[1], BERLIN);
    expect(localHhMm(moved[0]!.startAt, BERLIN)).toBe('10:00');

    const stayed = pinned.occurrencesBetween(window[0], window[1], BERLIN);
    expect(stayed[0]!.startAt.getTime()).toBe(anchor.getTime());
  });
});

describe('a repeating personal event (FR-011)', () => {
  it('expands to the same instants as the same rule on a meeting', () => {
    const from = today(CAIRO);
    const anchor = at(from, '09:00', CAIRO);
    const recurrence = rule('FREQ=WEEKLY;COUNT=5', anchor);

    const meeting = meetingFixture({ startAt: anchor, recurrence });
    const event = CalendarEvent.create({
      id: 'e-1',
      userId: 'u-1',
      title: 'Focus block',
      notes: null,
      startAt: anchor,
      endAt: new Date(anchor.getTime() + 30 * 60_000),
      allDay: false,
      color: '#0ea5e9',
      recurrence: rule('FREQ=WEEKLY;COUNT=5', anchor),
      createdAt: new Date(),
      timezone: CAIRO,
    });

    const window: [Date, Date] = [
      anchor,
      new Date(anchor.getTime() + 60 * DAY_MS),
    ];
    const meetings = meeting
      .occurrencesBetween(window[0], window[1], CAIRO)
      .map((occurrence) => occurrence.startAt.getTime());
    const events = event
      .occurrencesBetween(window[0], window[1], CAIRO)
      .map((occurrence) => occurrence.startAt.getTime());

    expect(events).toEqual(meetings);
    expect(events).toHaveLength(5);
  });

  it('skips and moves one occurrence exactly as a meeting does', () => {
    const from = today(CAIRO);
    const anchor = at(from, '09:00', CAIRO);
    const event = CalendarEvent.create({
      id: 'e-1',
      userId: 'u-1',
      title: 'Birthday',
      notes: null,
      startAt: anchor,
      endAt: new Date(anchor.getTime() + DAY_MS),
      allDay: true,
      color: null,
      recurrence: rule('FREQ=YEARLY;COUNT=3', anchor),
      createdAt: new Date(),
      timezone: CAIRO,
    });

    const window: [Date, Date] = [
      anchor,
      new Date(anchor.getTime() + 3 * 366 * DAY_MS),
    ];
    const all = event.occurrencesBetween(window[0], window[1], CAIRO);
    expect(all).toHaveLength(3);

    event.skipOccurrence(all[1]!.originalStart);
    expect(event.occurrencesBetween(window[0], window[1], CAIRO)).toHaveLength(
      2,
    );

    const moved = new Date(all[2]!.originalStart.getTime() + DAY_MS);
    event.moveOccurrence(all[2]!.originalStart, moved);
    const after = event.occurrencesBetween(window[0], window[1], CAIRO);
    expect(after.filter((occurrence) => occurrence.moved)).toHaveLength(1);
  });
});

describe('the rule helpers on their own', () => {
  it('skipInRule is idempotent, so a redelivered skip writes nothing new', () => {
    const anchor = at(today(CAIRO), '18:00', CAIRO);
    const once = skipInRule(rule('FREQ=DAILY', anchor), anchor);
    const twice = skipInRule(once, anchor);
    expect(twice.exdates).toHaveLength(1);
    expect(twice).toBe(once);
  });

  it('moveInRule updates one override rather than accumulating two', () => {
    const anchor = at(today(CAIRO), '18:00', CAIRO);
    const first = moveInRule(rule('FREQ=DAILY', anchor), anchor, {
      startAt: new Date(anchor.getTime() + 3_600_000),
    });
    const second = moveInRule(first, anchor, {
      startAt: new Date(anchor.getTime() + 7_200_000),
    });

    expect(second.overrides).toHaveLength(1);
    expect(second.overrides[0]!.startAt!.getTime()).toBe(
      anchor.getTime() + 7_200_000,
    );
  });

  it('matches an exdate to the minute, not to the millisecond', () => {
    // A client sending `10:00:00.000` and a stored `10:00:00.480` name the same
    // occurrence. Matching on the exact instant would silently fail to skip it.
    const anchor = at(today(CAIRO), '18:00', CAIRO);
    const recurrence = rule('FREQ=DAILY;COUNT=3', anchor, {
      exdates: [new Date(anchor.getTime() + 480)],
    });
    const found = expandOccurrences(
      repeating({ startAt: anchor, recurrence }),
      anchor,
      new Date(anchor.getTime() + 3 * DAY_MS),
      CAIRO,
    );
    expect(found).toHaveLength(2);
  });

  it('shows the first occurrence of a rule the library cannot read', () => {
    // A row written by an older build or repaired by hand. A meeting the member
    // can see and fix beats a meeting that vanished.
    const anchor = at(today(CAIRO), '18:00', CAIRO);
    const found = expandOccurrences(
      repeating({ startAt: anchor, recurrence: rule('NONSENSE', anchor) }),
      new Date(anchor.getTime() - DAY_MS),
      new Date(anchor.getTime() + DAY_MS),
      CAIRO,
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.startAt.getTime()).toBe(anchor.getTime());
  });
});

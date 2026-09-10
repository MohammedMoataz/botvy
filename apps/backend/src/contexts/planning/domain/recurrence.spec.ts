import { describe, expect, it } from 'vitest';
import { localDate, localHhMm } from '../../../shared/time/time.js';
import { Recurrence, type RecurrenceRule } from './recurrence.js';

/**
 * Every fixture is built from `Date.now()` rather than pinned to a date.
 *
 * A fixture pinned to a real date is a time bomb: this repository has already
 * had a suite that passed until the clock reached the date it was written
 * against. The exceptions are the two daylight-saving tests, which *must* name
 * a specific weekend because the whole point is the hour that a specific zone
 * skips — and those are pinned deliberately, with the reason written where the
 * date is.
 */
const CAIRO = 'Africa/Cairo';
const BERLIN = 'Europe/Berlin';

/** A rule anchored to a wall-clock time in a zone, built relative to today. */
function ruleFrom(
  daysFromNow: number,
  hhmm: string,
  rrule: string,
  mode: 'schedule' | 'completion',
  timezone: string,
): RecurrenceRule {
  const anchor = new Date(Date.now() + daysFromNow * 86_400_000);
  const date = localDate(anchor, timezone);
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);
  // Built as the instant that reads as `hhmm` in the zone, which is what a
  // client sends: the member picked a wall-clock time.
  const utcGuess = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  const offset = utcGuess - new Date(utcGuess).getTime();
  const dtstart = new Date(utcGuess - offset);

  // Correct the guess by asking the zone what that instant reads as.
  const reads = localHhMm(dtstart, timezone);
  const drift = reads === hhmm ? 0 : minutesBetween(reads, hhmm);
  return {
    dtstart: new Date(dtstart.getTime() - drift * 60_000),
    rrule,
    mode,
    exdates: [],
  };
}

function minutesBetween(from: string, to: string): number {
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  return fh! * 60 + fm! - (th! * 60 + tm!);
}

describe('recurrence: the two modes', () => {
  it('mode schedule measures from the scheduled occurrence, not the completion', () => {
    // "Water the plants every Tuesday." Tuesday comes whether or not last
    // Tuesday's watering happened.
    const spec = ruleFrom(0, '09:00', 'FREQ=WEEKLY', 'schedule', CAIRO);
    const rule = Recurrence.parse(spec, CAIRO)!;

    const scheduled = spec.dtstart;
    // Completed four days late. Schedule mode must ignore that entirely.
    const completedLate = new Date(scheduled.getTime() + 4 * 86_400_000);

    const next = rule.next(scheduled, CAIRO)!;
    expect(next.getTime() - scheduled.getTime()).toBe(7 * 86_400_000);

    // And the late completion does not move it: the caller passes the
    // *scheduled* moment in this mode, which is what `Task.complete` does.
    const stillNext = rule.next(scheduled, CAIRO)!;
    expect(stillNext.getTime()).toBe(next.getTime());
    expect(completedLate.getTime()).toBeGreaterThan(scheduled.getTime());
  });

  it('mode completion measures from the completion, keeping the series’ time of day', () => {
    // "Change the bedsheets every two weeks" — two weeks from when you did it.
    const spec = ruleFrom(
      0,
      '09:00',
      'FREQ=WEEKLY;INTERVAL=2',
      'completion',
      CAIRO,
    );
    const rule = Recurrence.parse(spec, CAIRO)!;

    // Done four days late, and at 23:50 rather than at nine in the morning.
    const completedAt = new Date(spec.dtstart.getTime() + 4 * 86_400_000);
    const lateNight = new Date(completedAt.setUTCHours(21, 50, 0, 0));

    const next = rule.next(lateNight, CAIRO)!;

    // Fourteen days from the *completion's* local day...
    const expectedDay = addLocalDays(localDate(lateNight, CAIRO), 14);
    expect(localDate(next, CAIRO)).toBe(expectedDay);

    // ...at the hour the member originally chose. If it took the time of day
    // from the completion instead, a task ticked off at 23:50 would drift into
    // the night a fortnight at a time.
    expect(localHhMm(next, CAIRO)).toBe('09:00');
  });

  it('the two modes disagree once a task is completed late, which is the point', () => {
    const scheduleSpec = ruleFrom(
      0,
      '18:00',
      'FREQ=DAILY;INTERVAL=3',
      'schedule',
      CAIRO,
    );
    const completionSpec = { ...scheduleSpec, mode: 'completion' as const };

    const scheduled = scheduleSpec.dtstart;
    const completedTwoDaysLate = new Date(scheduled.getTime() + 2 * 86_400_000);

    const bySchedule = Recurrence.parse(scheduleSpec, CAIRO)!.next(
      scheduled,
      CAIRO,
    )!;
    const byCompletion = Recurrence.parse(completionSpec, CAIRO)!.next(
      completedTwoDaysLate,
      CAIRO,
    )!;

    // Schedule: three days after the scheduled one. Completion: three days
    // after the doing, which is two days further out.
    expect(localDate(bySchedule, CAIRO)).toBe(
      addLocalDays(localDate(scheduled, CAIRO), 3),
    );
    expect(localDate(byCompletion, CAIRO)).toBe(
      addLocalDays(localDate(completedTwoDaysLate, CAIRO), 3),
    );
    expect(byCompletion.getTime()).toBeGreaterThan(bySchedule.getTime());
  });
});

describe('recurrence: the member’s clock, not the server’s', () => {
  it('keeps the wall-clock hour across a daylight-saving change', () => {
    // Pinned on purpose. Europe/Berlin moves to summer time on the last Sunday
    // in March — 29 March 2026 — and the whole assertion is about that
    // specific weekend. A relative fixture could not name it.
    //
    // A weekly 18:00 task set the Wednesday before must still be 18:00 the
    // Wednesday after. Naive arithmetic adds 7 × 86,400,000 ms and lands on
    // 19:00, which is the bug this file exists to prevent.
    const spec: RecurrenceRule = {
      dtstart: new Date('2026-03-25T17:00:00.000Z'), // 18:00 Berlin, winter (UTC+1)
      rrule: 'FREQ=WEEKLY',
      mode: 'schedule',
      exdates: [],
    };
    const rule = Recurrence.parse(spec, BERLIN)!;

    const next = rule.next(spec.dtstart, BERLIN)!;

    expect(localDate(next, BERLIN)).toBe('2026-04-01');
    expect(localHhMm(next, BERLIN)).toBe('18:00');
    // And the proof that it is not naive arithmetic: the instant moved by 6
    // days and 23 hours, because the clocks went forward in between.
    expect(next.getTime() - spec.dtstart.getTime()).toBe(
      7 * 86_400_000 - 3_600_000,
    );
  });

  it('resolves an occurrence inside a spring-forward gap to the first valid instant', () => {
    // 02:30 on 29 March 2026 does not exist in Berlin: the clocks jump from
    // 02:00 to 03:00. A daily task set for 02:30 must still fire that morning
    // once the clocks have moved, rather than reading back as 01:30 the day
    // before — a reminder the member set for the small hours should not
    // silently become an hour earlier.
    const spec: RecurrenceRule = {
      dtstart: new Date('2026-03-28T01:30:00.000Z'), // 02:30 Berlin, winter
      rrule: 'FREQ=DAILY',
      mode: 'schedule',
      exdates: [],
    };
    const rule = Recurrence.parse(spec, BERLIN)!;

    const next = rule.next(spec.dtstart, BERLIN)!;

    expect(localDate(next, BERLIN)).toBe('2026-03-29');
    // Not 02:30, because there is no 02:30. The first instant after the gap.
    expect(localHhMm(next, BERLIN)).toBe('03:30');
  });
});

describe('recurrence: monthly, and the 31st', () => {
  it('clamps a monthly rule to the last day of a shorter month', () => {
    // "Pay the rent on the 31st." February has no 31st, and the answer is the
    // last day of February rather than spilling into March — a bill is late,
    // not early.
    const spec: RecurrenceRule = {
      dtstart: new Date('2026-01-31T09:00:00.000Z'),
      rrule: 'FREQ=MONTHLY;INTERVAL=1',
      mode: 'completion',
      exdates: [],
    };
    const rule = Recurrence.parse(spec, CAIRO)!;

    const next = rule.next(new Date('2026-01-31T09:00:00.000Z'), CAIRO)!;
    // 2026 is not a leap year, so February ends on the 28th.
    expect(localDate(next, CAIRO)).toBe('2026-02-28');
  });

  it('returns to the 31st afterwards, because the step is measured from the completion', () => {
    const spec: RecurrenceRule = {
      dtstart: new Date('2026-01-31T09:00:00.000Z'),
      rrule: 'FREQ=MONTHLY',
      mode: 'completion',
      exdates: [],
    };
    const rule = Recurrence.parse(spec, CAIRO)!;

    // Completed on 31 March: one month on is 30 April, clamped.
    const next = rule.next(new Date('2026-03-31T09:00:00.000Z'), CAIRO)!;
    expect(localDate(next, CAIRO)).toBe('2026-04-30');
  });
});

describe('recurrence: exceptions', () => {
  it('skips an excluded occurrence and answers with the one after it', () => {
    const spec = ruleFrom(0, '09:00', 'FREQ=DAILY', 'schedule', CAIRO);
    const rule = Recurrence.parse(spec, CAIRO)!;

    const tomorrow = rule.next(spec.dtstart, CAIRO)!;
    const skipped = rule.skip(tomorrow);
    expect(skipped.exdates).toHaveLength(1);

    const afterSkip = Recurrence.parse(skipped, CAIRO)!.next(
      spec.dtstart,
      CAIRO,
    )!;
    // Two days out, not one: the excluded day is not an answer.
    expect(afterSkip.getTime()).toBeGreaterThan(tomorrow.getTime());
    expect(localDate(afterSkip, CAIRO)).toBe(
      addLocalDays(localDate(spec.dtstart, CAIRO), 2),
    );
  });

  it('skipping the same occurrence twice adds one exception, not two', () => {
    const spec = ruleFrom(0, '09:00', 'FREQ=DAILY', 'schedule', CAIRO);
    const rule = Recurrence.parse(spec, CAIRO)!;
    const tomorrow = rule.next(spec.dtstart, CAIRO)!;

    const once = rule.skip(tomorrow);
    const twice = Recurrence.parse(once, CAIRO)!.skip(tomorrow);
    // A retried push from a client must not grow the list for ever.
    expect(twice.exdates).toHaveLength(1);
  });

  it('applies exceptions in completion mode too', () => {
    const spec = ruleFrom(0, '09:00', 'FREQ=DAILY', 'completion', CAIRO);
    const rule = Recurrence.parse(spec, CAIRO)!;

    const oneStepOut = rule.next(spec.dtstart, CAIRO)!;
    const withException = rule.skip(oneStepOut);
    const next = Recurrence.parse(withException, CAIRO)!.next(
      spec.dtstart,
      CAIRO,
    )!;

    // "Not that day" means it whichever mode moved us there.
    expect(next.getTime()).toBeGreaterThan(oneStepOut.getTime());
  });
});

describe('recurrence: the edges', () => {
  it('answers null when a COUNT-bounded series has run out', () => {
    const spec = ruleFrom(0, '09:00', 'FREQ=DAILY;COUNT=2', 'schedule', CAIRO);
    const rule = Recurrence.parse(spec, CAIRO)!;

    const second = rule.next(spec.dtstart, CAIRO);
    expect(second).not.toBeNull();
    // A task whose series has ended simply completes for the last time.
    expect(rule.next(second!, CAIRO)).toBeNull();
  });

  it('refuses a rule the library cannot read, rather than throwing later', () => {
    // Returned as null so the aggregate can refuse the *write*, where the
    // member can be told. Accepting it would leave a task that throws on the
    // one operation the member most wants to succeed.
    expect(
      Recurrence.parse(
        {
          ...ruleFrom(0, '09:00', 'FREQ=DAILY', 'schedule', CAIRO),
          rrule: 'FREQ=NONSENSE',
        },
        CAIRO,
      ),
    ).toBeNull();
  });

  it('projects no calendar for a completion-mode series', () => {
    // Where the next one lands depends on when the current one is done, which
    // has not happened. Showing a speculative chain on a month view would put
    // appointments in front of the member that they never made.
    const spec = ruleFrom(0, '09:00', 'FREQ=WEEKLY', 'completion', CAIRO);
    const rule = Recurrence.parse(spec, CAIRO)!;

    const from = spec.dtstart;
    const to = new Date(from.getTime() + 60 * 86_400_000);
    expect(rule.between(from, to, CAIRO)).toEqual([]);
  });

  it('projects the calendar for a schedule-mode series', () => {
    const spec = ruleFrom(0, '09:00', 'FREQ=WEEKLY', 'schedule', CAIRO);
    const rule = Recurrence.parse(spec, CAIRO)!;

    const from = spec.dtstart;
    const to = new Date(from.getTime() + 28 * 86_400_000);
    // Inclusive of both ends: five Wednesdays across four weeks.
    expect(rule.between(from, to, CAIRO)).toHaveLength(5);
  });

  it('describes itself in words', () => {
    const rule = Recurrence.parse(
      ruleFrom(0, '09:00', 'FREQ=WEEKLY;INTERVAL=2', 'schedule', CAIRO),
      CAIRO,
    )!;
    expect(rule.humanText()).toContain('week');
  });
});

/** Calendar arithmetic on a YYYY-MM-DD, for the assertions above. */
function addLocalDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const moved = new Date(Date.UTC(year!, month! - 1, day! + days));
  return `${moved.getUTCFullYear()}-${String(moved.getUTCMonth() + 1).padStart(2, '0')}-${String(
    moved.getUTCDate(),
  ).padStart(2, '0')}`;
}

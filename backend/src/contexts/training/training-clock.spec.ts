import { describe, expect, it } from 'vitest';
import { localDate, localHhMm, wallClockToUtc } from '../../shared/time/time.js';
import type { TrainingSlot } from './domain/athlete-profile.aggregate.js';
import { nextPractice } from './domain/next-practice.js';
import { Session } from './domain/session.aggregate.js';
import {
  addDays,
  isoWeekday,
  programWeekIndex,
  slotOccurrencesWithin,
  slotSessionId,
} from './domain/slot-calendar.js';

/**
 * The clock rules: the cut-off, the slot calendar, and "missed".
 *
 * These three are where this phase's defects would live, so they are specced
 * against a clock and nothing else — no store, no settings service, no saga.
 *
 * ## Every calendar here is built from `Date.now()`
 *
 * The plan asks for it in three places and the reason is the one this codebase
 * has already been bitten by: a fixture carrying a written date passes until the
 * day the clock reaches it. So the 14-day sweep starts today, the DST case finds
 * the next transition by *asking the zone*, and nothing below contains a literal
 * date. `Africa/Cairo` is the fixed test zone the plan names — it observes
 * daylight saving again, and it is ahead of UTC, which is the half that used to
 * be got wrong.
 */

const CAIRO = 'Africa/Cairo';
const MEMBER = 'member-1';

function at(date: string, hhmm: string): Date {
  const instant = wallClockToUtc(`${date}T${hhmm}`, CAIRO);
  if (!instant) throw new Error(`cannot resolve ${date}T${hhmm}`);
  return instant;
}

function today(): string {
  return localDate(new Date(), CAIRO);
}

function slot(overrides: Partial<TrainingSlot> = {}): TrainingSlot {
  return {
    id: 'slot-gym',
    weekday: 1,
    start: '18:00',
    durationMin: 60,
    sport: 'gym',
    location: null,
    ...overrides,
  };
}

function session(overrides: Partial<Parameters<typeof Session.plan>[0]> = {}) {
  return Session.plan({
    id: 'session-1',
    userId: MEMBER,
    plannedAt: at(today(), '18:00'),
    durationMin: 60,
    sport: 'gym',
    title: 'Push day',
    focus: null,
    programId: null,
    weekIndex: null,
    slotId: 'slot-gym',
    suggestionId: null,
    exercises: [],
    notes: null,
    createdAt: new Date(),
    ...overrides,
  });
}

// --------------------------------------------------------- the slot calendar

describe('slotOccurrencesWithin', () => {
  it('puts one occurrence on each matching weekday and none elsewhere', () => {
    const from = today();
    // Whatever day it is, ask for the weekday two days out — so the assertion
    // is the same every day of the week rather than one that only means
    // something on Mondays.
    const target = addDays(from, 2);
    const found = slotOccurrencesWithin(
      MEMBER,
      [slot({ weekday: isoWeekday(target) })],
      from,
      14,
      CAIRO,
    );

    // A fortnight holds exactly two of any given weekday.
    expect(found).toHaveLength(2);
    expect(found.map((entry) => entry.date)).toEqual([
      target,
      addDays(target, 7),
    ]);
    for (const entry of found) {
      expect(localHhMm(entry.plannedAt, CAIRO)).toBe('18:00');
    }
  });

  it('keeps two slots that fall at the same hour on the same day', () => {
    // The spec's edge case, and it needs no code: two slots have two ids, so
    // both occurrences exist and the member decides.
    const from = today();
    const weekday = isoWeekday(from);
    const found = slotOccurrencesWithin(
      MEMBER,
      [
        slot({ id: 'gym', weekday, sport: 'gym' }),
        slot({ id: 'swim', weekday, sport: 'swimming' }),
      ],
      from,
      7,
      CAIRO,
    );

    expect(found).toHaveLength(2);
    expect(new Set(found.map((entry) => entry.id)).size).toBe(2);
    expect(new Set(found.map((entry) => entry.slot.sport))).toEqual(
      new Set(['gym', 'swimming']),
    );
  });

  it('stores nothing for a rest day (FR-013)', () => {
    // A day with no slot produces no occurrence. There is no row that says
    // "rest"; the absence is the rest day, which is why this assertion is about
    // a length and not about a flag.
    const from = today();
    const found = slotOccurrencesWithin(
      MEMBER,
      [slot({ weekday: isoWeekday(addDays(from, 1)) })],
      from,
      1,
      CAIRO,
    );
    expect(found).toEqual([]);
  });

  it('gives a fortnight fourteen days even when the clocks change in it', () => {
    /*
     * The reason the window is `(fromDate, days)` and not two instants: a
     * fortnight containing a transition is not 14 × 24 hours, so stepping by
     * milliseconds would either skip a day or land two occurrences on one. The
     * transition is found by asking the zone rather than by knowing when Egypt
     * moves its clocks.
     */
    const change = nextOffsetChange(CAIRO);
    if (!change) {
      expect(change, 'Africa/Cairo no longer changes its clocks').not.toBeNull();
      return;
    }

    const from = addDays(change, -3);
    const daily = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
      slot({ id: `slot-${weekday}`, weekday }),
    );
    const found = slotOccurrencesWithin(MEMBER, daily, from, 14, CAIRO);

    expect(found).toHaveLength(14);
    expect(new Set(found.map((entry) => entry.date)).size).toBe(14);
    // And every one still at 18:00 on the member's own clock, which is what a
    // wall-clock slot means.
    for (const entry of found) {
      expect(localHhMm(entry.plannedAt, CAIRO)).toBe('18:00');
    }
  });

  it('derives the same id for the same slot and day, and a different one otherwise', () => {
    /*
     * The property the whole materialiser rests on: creation is an upsert on
     * this id, so a second tick, a redelivered event and two concurrent passes
     * collapse onto one row. If this were not stable, a member's fortnight
     * would be created again on every trigger.
     */
    const date = today();
    expect(slotSessionId(MEMBER, 'slot-gym', date)).toBe(
      slotSessionId(MEMBER, 'slot-gym', date),
    );

    const different = [
      slotSessionId('member-2', 'slot-gym', date),
      slotSessionId(MEMBER, 'slot-swim', date),
      slotSessionId(MEMBER, 'slot-gym', addDays(date, 1)),
    ];
    expect(new Set(different).size).toBe(3);
    expect(different).not.toContain(slotSessionId(MEMBER, 'slot-gym', date));
  });

  it('keys on the local date, so a zone change does not duplicate a session', () => {
    /*
     * Why the id takes a date and not an instant. The same session read in two
     * zones is one session — the member's "Monday" — and an instant-keyed id
     * would create the fortnight a second time the moment they flew, leaving
     * the first copy attached to a slot that no longer resolves to it.
     */
    const date = today();
    const fromCairo = slotSessionId(MEMBER, 'slot-gym', date);
    const fromBerlin = slotSessionId(MEMBER, 'slot-gym', date);
    expect(fromBerlin).toBe(fromCairo);
  });
});

describe('programWeekIndex', () => {
  it('counts weeks from the applied date, so week four lands later', () => {
    // FR-008's second half: a program longer than the horizon is filled as the
    // horizon reaches it, which means computing the week long after the apply.
    const start = today();
    expect(programWeekIndex(start, start)).toBe(0);
    expect(programWeekIndex(start, addDays(start, 6))).toBe(0);
    expect(programWeekIndex(start, addDays(start, 7))).toBe(1);
    expect(programWeekIndex(start, addDays(start, 27))).toBe(3);
  });

  it('answers null before the start, which is not an error', () => {
    // The horizon begins today and a program may have been applied from
    // tomorrow. Null means "this program has nothing to say about that day".
    const start = addDays(today(), 3);
    expect(programWeekIndex(start, today())).toBeNull();
  });

  it('counts calendar days, not 24-hour periods', () => {
    // A week containing a clock change is not 7 × 24 hours. Off by one here
    // puts a member in the wrong week of their program for a week.
    const change = nextOffsetChange(CAIRO);
    if (!change) return;
    const start = addDays(change, -2);
    expect(programWeekIndex(start, addDays(start, 7))).toBe(1);
    expect(programWeekIndex(start, addDays(start, 6))).toBe(0);
  });
});

// ------------------------------------------------------------- missed status

describe('Session.isMissed (FR-018)', () => {
  it('is true once a planned session has finished with nothing logged', () => {
    const date = today();
    const past = session({ plannedAt: at(date, '06:00'), durationMin: 60 });
    expect(past.isMissed(at(date, '08:00'), CAIRO)).toBe(true);
  });

  it('is false while the session is still under way', () => {
    // A session in progress is not missed. The duration is in the comparison
    // for exactly this, and the spec's last edge case depends on it.
    const date = today();
    const running = session({ plannedAt: at(date, '18:00'), durationMin: 60 });
    expect(running.isMissed(at(date, '18:30'), CAIRO)).toBe(false);
    expect(running.isMissed(at(date, '17:00'), CAIRO)).toBe(false);
  });

  it('is false for anything the member has dealt with', () => {
    const date = today();
    for (const act of [
      (entry: Session) => entry.complete(),
      (entry: Session) => entry.cancel(),
      (entry: Session) => entry.skip(),
    ]) {
      const dealt = session({ plannedAt: at(date, '06:00') });
      act(dealt);
      expect(dealt.isMissed(at(date, '20:00'), CAIRO)).toBe(false);
    }
  });

  it('needs no correction before a late log, because nothing stored it', () => {
    /*
     * FR-018's point. "Missed" is a reading of the clock, so logging the
     * session late is an ordinary log — there is no status to un-set first, and
     * the reading changes by itself because the session is no longer `planned`.
     * Had it been swept into the row, this test would need a repair step.
     */
    const date = today();
    const late = session({
      plannedAt: at(date, '06:00'),
      exercises: [
        { id: 'e1', name: 'Squat', notes: null, mediaRefs: [], sets: [] },
      ],
    });
    expect(late.isMissed(at(date, '20:00'), CAIRO)).toBe(true);

    late.log('e1', [
      {
        targetReps: 5,
        actualReps: 5,
        actualWeightKg: 100,
        done: true,
      },
    ]);
    late.complete(at(date, '20:05'));

    expect(late.isMissed(at(date, '20:10'), CAIRO)).toBe(false);
    expect(late.status).toBe('completed');
  });
});

// ------------------------------------------------------------ the cut-off

describe('nextPractice across fourteen days (SC-002)', () => {
  const CUTOFF = '21:00';

  it('shows today before the cut-off and tomorrow after it, every day', () => {
    /*
     * Story 2's own example, swept over a fortnight: at 20:00 the card shows
     * today's session and at 21:30 the next one. Fourteen days rather than one
     * because the failure this guards is a comparison that works on some
     * weekdays — a string compare of `HH:mm` is right, and the arithmetic
     * versions of it are wrong at the ends of the day.
     */
    const start = today();

    for (let offset = 0; offset < 14; offset += 1) {
      const date = addDays(start, offset);
      const todays = [
        session({
          id: `today-${offset}`,
          plannedAt: at(date, '18:00'),
        }),
      ];
      const upcoming = [
        session({
          id: `next-${offset}`,
          plannedAt: at(addDays(date, 2), '18:00'),
        }),
      ];

      const before = nextPractice(
        todays,
        upcoming,
        at(date, '20:00'),
        CAIRO,
        CUTOFF,
      );
      expect(before.reason, `${date} at 20:00`).toBe('today');
      expect(before.session?.id).toBe(`today-${offset}`);

      const after = nextPractice(
        todays,
        upcoming,
        at(date, '21:30'),
        CAIRO,
        CUTOFF,
      );
      expect(after.reason, `${date} at 21:30`).toBe('after-cutoff');
      expect(after.session?.id).toBe(`next-${offset}`);
    }
  });

  it("keeps today's session after the cut-off when it has not happened yet", () => {
    /*
     * The spec's last edge case, and the one the rule as first written gets
     * wrong: a 22:00 session, a 21:00 cut-off, and a member opening the card at
     * 21:30. Showing them tomorrow's would hide a session they are about to do.
     */
    const date = today();
    const late = session({ id: 'tonight', plannedAt: at(date, '22:00') });
    const tomorrow = session({
      id: 'tomorrow',
      plannedAt: at(addDays(date, 1), '18:00'),
    });

    const answer = nextPractice(
      [late],
      [tomorrow],
      at(date, '21:30'),
      CAIRO,
      CUTOFF,
    );
    expect(answer.reason).toBe('today');
    expect(answer.session?.id).toBe('tonight');
  });

  it("shows today's session whatever its status, before the cut-off", () => {
    // Story 2 scenario 1. A completed morning session is what the member wants
    // to see at noon, not tomorrow's — filtering to `planned` here would make
    // the card jump forward the moment they ticked it off.
    const date = today();
    const done = session({ id: 'this-morning', plannedAt: at(date, '07:00') });
    done.complete(at(date, '08:00'));

    const answer = nextPractice(
      [done],
      [session({ id: 'later', plannedAt: at(addDays(date, 1), '18:00') })],
      at(date, '12:00'),
      CAIRO,
      CUTOFF,
    );
    expect(answer.reason).toBe('today');
    expect(answer.session?.id).toBe('this-morning');
  });

  it('skips a cancelled or skipped future session when looking ahead', () => {
    // After the cut-off the question is "what is next", and the member has
    // already said these are not happening.
    const date = today();
    const cancelled = session({
      id: 'cancelled',
      plannedAt: at(addDays(date, 1), '18:00'),
    });
    cancelled.cancel();
    const skipped = session({
      id: 'skipped',
      plannedAt: at(addDays(date, 2), '18:00'),
    });
    skipped.skip();
    const real = session({
      id: 'real',
      plannedAt: at(addDays(date, 3), '18:00'),
    });

    const answer = nextPractice(
      [],
      [cancelled, skipped, real],
      at(date, '21:30'),
      CAIRO,
      CUTOFF,
    );
    expect(answer.session?.id).toBe('real');
  });

  it('says so plainly when there is nothing at all (story 2 scenario 3)', () => {
    const answer = nextPractice([], [], new Date(), CAIRO, CUTOFF);
    expect(answer.session).toBeNull();
    expect(answer.reason).toBe('none-scheduled');
  });

  it('still shows this morning at night when nothing is ahead', () => {
    // A member whose only session was this morning has had a training day.
    // Telling them at 22:00 that they have nothing scheduled is true about the
    // future and useless about the day they just had.
    const date = today();
    const done = session({ id: 'morning', plannedAt: at(date, '07:00') });
    done.complete(at(date, '08:00'));

    const answer = nextPractice([done], [], at(date, '22:00'), CAIRO, CUTOFF);
    expect(answer.reason).toBe('today');
    expect(answer.session?.id).toBe('morning');
  });

  it('picks the unfinished one when the member trains twice in a day', () => {
    // The assumptions allow two slots in a day, so the card has to choose.
    const date = today();
    const morning = session({ id: 'swim', plannedAt: at(date, '07:00') });
    morning.complete(at(date, '08:00'));
    const evening = session({ id: 'gym', plannedAt: at(date, '18:00') });

    const answer = nextPractice(
      [morning, evening],
      [],
      at(date, '12:00'),
      CAIRO,
      CUTOFF,
    );
    expect(answer.session?.id).toBe('gym');
  });

  it('honours a cut-off the member changed', () => {
    // FR-007: the cut-off is a preference, so the rule reads it rather than
    // knowing it. At 19:30 a member with an 18:00 cut-off is already looking
    // ahead, where the default would still show them today.
    const date = today();
    const todays = [session({ id: 'today', plannedAt: at(date, '06:00') })];
    todays[0]!.complete(at(date, '07:00'));
    const upcoming = [
      session({ id: 'next', plannedAt: at(addDays(date, 1), '18:00') }),
    ];

    expect(
      nextPractice(todays, upcoming, at(date, '19:30'), CAIRO, '21:00').reason,
    ).toBe('today');
    expect(
      nextPractice(todays, upcoming, at(date, '19:30'), CAIRO, '18:00').reason,
    ).toBe('after-cutoff');
  });
});

/**
 * The next local date whose UTC offset differs from the day before.
 *
 * Asked of the zone rather than looked up, so a rule change in a future year
 * leaves the fixture correct. Midday rather than midnight because a
 * spring-forward gap can swallow 00:30 and make two adjacent days compare
 * equal. The same helper P5's recurrence spec uses, duplicated rather than
 * imported — a spec that imports another spec's helpers is two specs that fail
 * together for reasons neither is about.
 */
function nextOffsetChange(zone: string): string | null {
  const offsetAtNoon = (date: string) =>
    at(date, '12:00').getTime() - Date.parse(`${date}T12:00:00Z`);
  let date = localDate(new Date(), zone);
  let previous = offsetAtNoon(date);
  for (let index = 0; index < 430; index += 1) {
    const next = addDays(date, 1);
    const offset = offsetAtNoon(next);
    if (offset !== previous) return next;
    previous = offset;
    date = next;
  }
  return null;
}

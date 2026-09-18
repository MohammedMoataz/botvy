import { describe, expect, it } from 'vitest';
import {
  canExpandRule,
  expandOccurrences,
  wallClockToUtc,
  type MeetingRecurrence,
  type Repeating,
} from './recurrence.js';

/**
 * The expander's own tests.
 *
 * **The dates here are fixed, and that is safe where a fixture pinned to a real
 * date usually is not.** The rule about time bombs is about code that reads the
 * clock — alert planning drops a lead time whose moment has passed, so a
 * fixture dated in the future starts failing the day the clock reaches it.
 * `expandOccurrences` never calls `Date.now()`: the window is an argument, so
 * every case below is the same assertion in 2026 and in 2036. Fixed dates are
 * what make a daylight-saving case expressible at all.
 *
 * Europe/Berlin is the clock-change zone rather than Africa/Cairo — the
 * installation's default — because its transitions (last Sunday of March and
 * of October) are the ones every ICU build agrees about.
 */

const NO_LOCATION = { onlineLink: 'https://meet.example/standup', address: null };

function meeting(over: Partial<Repeating> = {}): Repeating {
  return {
    title: 'Standup',
    startAt: '2026-09-07T09:00:00.000Z',
    durationMin: 30,
    location: NO_LOCATION,
    recurrence: null,
    lockTimezone: null,
    authoredTimezone: 'UTC',
    ...over,
  };
}

function rule(over: Partial<MeetingRecurrence> = {}): MeetingRecurrence {
  return {
    dtstart: '2026-09-07T09:00:00.000Z',
    rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=6',
    exdates: [],
    overrides: [],
    ...over,
  };
}

/** Wall-clock `HH:mm` in a zone, which is what a member reads on a clock. */
function hhmm(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(instant));
}

describe('expandOccurrences', () => {
  it('renders a six-week series with one skip and one move as five, one moved', () => {
    // SC-001, which the phone and the extension have to agree on exactly.
    const found = expandOccurrences(
      meeting({
        recurrence: rule({
          exdates: ['2026-09-21T09:00:00.000Z'],
          overrides: [
            {
              originalStart: '2026-10-05T09:00:00.000Z',
              startAt: '2026-10-05T10:00:00.000Z',
            },
          ],
        }),
      }),
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-10-31T00:00:00.000Z'),
      'UTC',
    );

    expect(found.map((one) => one.startAt)).toEqual([
      '2026-09-07T09:00:00.000Z',
      '2026-09-14T09:00:00.000Z',
      '2026-09-28T09:00:00.000Z',
      '2026-10-05T10:00:00.000Z',
      '2026-10-12T09:00:00.000Z',
    ]);
    expect(found.filter((one) => one.moved)).toHaveLength(1);
    // The override key never moves, which is what a later edit finds it by.
    expect(found[3]!.originalStart).toBe('2026-10-05T09:00:00.000Z');
  });

  it('matches an exdate to the minute, not to the millisecond', () => {
    const found = expandOccurrences(
      meeting({
        recurrence: rule({ exdates: ['2026-09-21T09:00:45.123Z'] }),
      }),
      new Date('2026-09-08T00:00:00.000Z'),
      new Date('2026-09-27T00:00:00.000Z'),
      'UTC',
    );
    expect(found.map((one) => one.startAt)).toEqual([
      '2026-09-14T09:00:00.000Z',
    ]);
  });

  it('keeps the wall clock across a daylight-saving change', () => {
    // SC-005: zero occurrences shift by an hour. The instants differ by an hour
    // and the clock the member reads does not, which is the whole point.
    const found = expandOccurrences(
      meeting({
        startAt: '2026-03-23T17:00:00.000Z',
        authoredTimezone: 'Europe/Berlin',
        recurrence: rule({
          dtstart: '2026-03-23T17:00:00.000Z',
          rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=3',
        }),
      }),
      new Date('2026-03-20T00:00:00.000Z'),
      new Date('2026-04-10T00:00:00.000Z'),
      'Europe/Berlin',
    );

    expect(found.map((one) => hhmm(one.startAt, 'Europe/Berlin'))).toEqual([
      '18:00',
      '18:00',
      '18:00',
    ]);
    expect(found.map((one) => one.startAt)).toEqual([
      '2026-03-23T17:00:00.000Z',
      '2026-03-30T16:00:00.000Z',
      '2026-04-06T16:00:00.000Z',
    ]);
  });

  it('follows the member when unpinned and stays put when pinned', () => {
    const authored = {
      startAt: '2026-09-10T16:00:00.000Z',
      authoredTimezone: 'Europe/Berlin',
    };

    // Unpinned: the digits (18:00) travel and the instant moves with the clock
    // they are read on.
    const travelling = expandOccurrences(
      meeting(authored),
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-30T00:00:00.000Z'),
      'UTC',
    );
    expect(travelling[0]!.startAt).toBe('2026-09-10T18:00:00.000Z');

    // Pinned to Berlin: "keep this on Berlin's clock" keeps the instant.
    const pinned = expandOccurrences(
      meeting({ ...authored, lockTimezone: 'Europe/Berlin' }),
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-30T00:00:00.000Z'),
      'UTC',
    );
    expect(pinned[0]!.startAt).toBe('2026-09-10T16:00:00.000Z');
  });

  it('counts occurrences from dtstart, so COUNT holds in a later window', () => {
    const found = expandOccurrences(
      meeting({ recurrence: rule() }),
      new Date('2026-10-01T00:00:00.000Z'),
      new Date('2026-12-01T00:00:00.000Z'),
      'UTC',
    );
    // Six weekly occurrences from 7 September end on 12 October; a window that
    // opens in October must not restart the count.
    expect(found.map((one) => one.startAt)).toEqual([
      '2026-10-05T09:00:00.000Z',
      '2026-10-12T09:00:00.000Z',
    ]);
  });

  it('stops at UNTIL', () => {
    const found = expandOccurrences(
      meeting({
        recurrence: rule({ rrule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20260921T235959Z' }),
      }),
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-10-31T00:00:00.000Z'),
      'UTC',
    );
    expect(found).toHaveLength(3);
  });

  it('skips a month that has no 31st, and lands on the last day when asked', () => {
    const window: [Date, Date] = [
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-05-01T00:00:00.000Z'),
    ];
    const anchored = {
      startAt: '2026-01-31T09:00:00.000Z',
      recurrence: rule({
        dtstart: '2026-01-31T09:00:00.000Z',
        rrule: 'FREQ=MONTHLY;BYMONTHDAY=31',
      }),
    };

    expect(
      expandOccurrences(meeting(anchored), ...window, 'UTC').map(
        (one) => one.startAt.slice(0, 10),
      ),
    ).toEqual(['2026-01-31', '2026-03-31']);

    expect(
      expandOccurrences(
        meeting({
          ...anchored,
          recurrence: rule({
            dtstart: '2026-01-31T09:00:00.000Z',
            rrule: 'FREQ=MONTHLY;BYMONTHDAY=-1',
          }),
        }),
        ...window,
        'UTC',
      ).map((one) => one.startAt.slice(0, 10)),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('degrades a rule it cannot read to the single first occurrence', () => {
    // "the last Friday of the month" needs BYSETPOS. Drawing it as every Friday
    // would be a wrong calendar; drawing nothing loses the meeting.
    const found = expandOccurrences(
      meeting({
        recurrence: rule({ rrule: 'FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1' }),
      }),
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-12-01T00:00:00.000Z'),
      'UTC',
    );
    expect(found.map((one) => one.startAt)).toEqual([
      '2026-09-07T09:00:00.000Z',
    ]);
  });

  it('finds an override that moved an occurrence into the window', () => {
    const found = expandOccurrences(
      meeting({
        recurrence: rule({
          overrides: [
            {
              originalStart: '2026-09-14T09:00:00.000Z',
              startAt: '2026-12-01T14:00:00.000Z',
              title: 'Standup, rescheduled',
            },
          ],
        }),
      }),
      new Date('2026-11-25T00:00:00.000Z'),
      new Date('2026-12-07T00:00:00.000Z'),
      'UTC',
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.title).toBe('Standup, rescheduled');
    expect(found[0]!.moved).toBe(true);
  });

  it('keeps a meeting already under way when the window opens', () => {
    const found = expandOccurrences(
      meeting({ startAt: '2026-09-07T09:30:00.000Z', durationMin: 60 }),
      new Date('2026-09-07T10:00:00.000Z'),
      new Date('2026-09-14T10:00:00.000Z'),
      'UTC',
    );
    expect(found).toHaveLength(1);
  });
});

/**
 * The subset's boundary, and that it is loud (E-014).
 *
 * The degradation itself is right — the server takes the same fallback for a
 * rule `rrule` refuses, and a meeting the member can see and fix beats one that
 * vanished. What was wrong was that it was *silent*: one occurrence is exactly
 * what a non-repeating meeting looks like, so a weekly series whose rule this
 * parser cannot read drew as a single Monday and a member reading their side
 * panel would believe they were free on Friday.
 *
 * So the boundary is asked about rather than inferred. Nothing widens the
 * parser here; the subset is still `FREQ` daily/weekly/monthly/yearly with
 * `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY` for weekly and `BYMONTHDAY` for
 * monthly, which is everything the repeat picker and the chat can write.
 */
describe('canExpandRule', () => {
  /**
   * The rules this file's own fixtures use — which are the rules the product
   * produces. Every one of them must stay readable: a parser change that made
   * any of these degrade would otherwise show up as a plausible calendar rather
   * than as a red line.
   */
  const READABLE = [
    'FREQ=WEEKLY;BYDAY=MO;COUNT=6',
    'FREQ=WEEKLY;BYDAY=MO;COUNT=3',
    'FREQ=WEEKLY;BYDAY=MO;UNTIL=20260921T235959Z',
    'FREQ=MONTHLY;BYMONTHDAY=31',
    'FREQ=MONTHLY;BYMONTHDAY=-1',
    'FREQ=DAILY',
    'FREQ=DAILY;INTERVAL=2',
    'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;WKST=MO',
    'FREQ=YEARLY',
    'RRULE:FREQ=WEEKLY;BYDAY=MO',
  ];

  for (const rrule of READABLE) {
    it(`reads ${rrule}`, () => {
      expect(canExpandRule(rrule)).toBe(true);
    });
  }

  /**
   * Each of these needs a part of RFC 5545 this file does not carry, and each
   * would draw a *wrong* calendar if it were ignored rather than refused —
   * `BYSETPOS=-1;BYDAY=FR` as every Friday rather than the last one.
   */
  const UNREADABLE = [
    'FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1',
    'FREQ=WEEKLY;BYWEEKNO=3',
    'FREQ=MONTHLY;BYDAY=2TU',
    'FREQ=HOURLY',
    'FREQ=MONTHLY;BYMONTHDAY=1,15',
    'not a rule at all',
  ];

  for (const rrule of UNREADABLE) {
    it(`refuses ${rrule}`, () => {
      expect(canExpandRule(rrule)).toBe(false);
    });
  }

  /**
   * The point of the whole thing: a caller can now tell the two apart.
   *
   * A weekly series the parser cannot read and a genuinely single meeting both
   * expand to one occurrence — that is the degradation and it stays. What has
   * changed is that `canExpandRule` separates them, which is what lets the
   * panel say "this series cannot be shown here" instead of drawing the one.
   */
  it('tells an unreadable series apart from a single occurrence', () => {
    const unreadable = rule({ rrule: 'FREQ=WEEKLY;BYSETPOS=-1;BYDAY=FR' });
    const window = [
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-12-01T00:00:00.000Z'),
    ] as const;

    // Indistinguishable by their output alone — one occurrence either way.
    expect(
      expandOccurrences(
        meeting({ recurrence: unreadable }),
        ...window,
        'UTC',
      ),
    ).toHaveLength(1);
    expect(expandOccurrences(meeting(), ...window, 'UTC')).toHaveLength(1);

    // And distinguishable by asking, which is what a calendar has to do.
    expect(canExpandRule(unreadable.rrule)).toBe(false);
    expect(canExpandRule('FREQ=WEEKLY;BYDAY=FR')).toBe(true);
  });
});

describe('wallClockToUtc', () => {
  it('resolves a zoneless wall clock against the zone asked for', () => {
    expect(wallClockToUtc('2026-09-11T15:00', 'Europe/Berlin')?.toISOString()).toBe(
      '2026-09-11T13:00:00.000Z',
    );
  });

  it('moves an hour that never happened forward, never back', () => {
    // 02:30 on the morning the clocks go forward in Berlin. Reading it back as
    // 01:30 would wake the member an hour early, which is the one direction a
    // time may never move.
    const resolved = wallClockToUtc('2026-03-29T02:30', 'Europe/Berlin');
    expect(hhmm(resolved!.toISOString(), 'Europe/Berlin')).toBe('03:30');
  });

  it('answers null for anything unparseable', () => {
    expect(wallClockToUtc('tomorrow at six', 'UTC')).toBeNull();
  });
});

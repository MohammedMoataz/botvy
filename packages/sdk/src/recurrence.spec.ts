import { describe, expect, it } from 'vitest';
import {
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

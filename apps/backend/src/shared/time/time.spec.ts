import { describe, expect, it } from 'vitest';
import { formatInTz, localDate, localHhMm, wallClockToUtc } from './time.js';

/**
 * The reminder path's arithmetic. The model writes a wall-clock time with no
 * zone — "tomorrow at 6pm" becomes "2026-09-02T18:00" — and this turns it into
 * the instant that names. Getting it wrong puts a reminder hours out, which is
 * the failure this whole area exists to prevent.
 *
 * Ported from v1 unchanged.
 */
describe('wallClockToUtc', () => {
  it('reads a wall-clock time as the zone the user is in', () => {
    // Cairo runs UTC+3 in September.
    expect(
      wallClockToUtc('2026-09-02T18:00', 'Africa/Cairo')?.toISOString(),
    ).toBe('2026-09-02T15:00:00.000Z');
  });

  it('is the identity in UTC', () => {
    expect(wallClockToUtc('2026-09-02T18:00', 'UTC')?.toISOString()).toBe(
      '2026-09-02T18:00:00.000Z',
    );
  });

  it('handles a zone behind UTC', () => {
    // New York is UTC-4 in September.
    expect(
      wallClockToUtc('2026-09-02T18:00', 'America/New_York')?.toISOString(),
    ).toBe('2026-09-02T22:00:00.000Z');
  });

  it('uses the offset in force on the day, not today', () => {
    // Cairo keeps DST through the summer: 18:00 in January is UTC+2, in July
    // UTC+3. A naive fixed offset gets one of them wrong.
    const winter = wallClockToUtc('2026-01-15T18:00', 'Africa/Cairo');
    const summer = wallClockToUtc('2026-07-15T18:00', 'Africa/Cairo');

    expect(winter?.toISOString()).toBe('2026-01-15T16:00:00.000Z');
    expect(summer?.toISOString()).toBe('2026-07-15T15:00:00.000Z');
  });

  it('round-trips through the formatter the user sees', () => {
    const instant = wallClockToUtc('2026-09-02T18:00', 'Africa/Cairo')!;

    expect(formatInTz(instant, 'Africa/Cairo')).toContain('18:00');
    expect(localDate(instant, 'Africa/Cairo')).toBe('2026-09-02');
  });

  it('accepts seconds and a space separator', () => {
    expect(wallClockToUtc('2026-09-02 18:30:15', 'UTC')?.toISOString()).toBe(
      '2026-09-02T18:30:15.000Z',
    );
  });

  it('lands after a spring-forward gap, not an hour before it', () => {
    // 02:30 on 8 March 2026 never happens in New York — the clocks jump from
    // 02:00 to 03:00. Reading it back as 01:30 would show the user an earlier
    // time than they asked for; the first instant after the gap is 03:30.
    const instant = wallClockToUtc('2026-03-08T02:30', 'America/New_York');

    expect(instant?.toISOString()).toBe('2026-03-08T07:30:00.000Z');
    expect(formatInTz(instant!, 'America/New_York')).toContain('03:30');
  });

  it('lands after a spring-forward gap in a zone ahead of UTC too', () => {
    // The same rule, east of Greenwich, and this is the case the New York test
    // above could not catch. Which of the two candidate instants falls after
    // the gap depends on the sign of the zone's offset, and the resolver used
    // to assume the western answer — so this passed in New York and returned
    // 01:30 in Berlin, an hour *before* the hour the member asked for.
    //
    // 02:30 on 29 March 2026 does not exist in Berlin: 02:00 jumps to 03:00.
    const berlin = wallClockToUtc('2026-03-29T02:30', 'Europe/Berlin');
    expect(berlin?.toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(formatInTz(berlin!, 'Europe/Berlin')).toContain('03:30');

    // And in this installation's own default zone, which is the reason the bug
    // mattered rather than merely existed. Cairo has observed daylight saving
    // again since 2023 and moves on the last Friday in April.
    const cairo = wallClockToUtc('2026-04-24T00:30', 'Africa/Cairo');
    expect(cairo).not.toBeNull();
    // Whatever the offset works out to, the one thing that must not happen is
    // reading back as an earlier hour than was asked for.
    expect(formatInTz(cairo!, 'Africa/Cairo')).not.toContain('23:30');
  });

  it('picks the first of the two occurrences in a fall-back hour', () => {
    // 01:30 happens twice on 1 November 2026; the earlier one is EDT (UTC-4).
    const instant = wallClockToUtc('2026-11-01T01:30', 'America/New_York');

    expect(instant?.toISOString()).toBe('2026-11-01T05:30:00.000Z');
    expect(formatInTz(instant!, 'America/New_York')).toContain('01:30');
  });

  it('returns null for anything it cannot read, rather than a wrong time', () => {
    for (const bad of ['', 'tomorrow', '2026-09-02', 'not a date']) {
      expect(wallClockToUtc(bad, 'UTC')).toBeNull();
    }
  });

  it('ignores a trailing zone marker instead of double-converting', () => {
    // The model sometimes appends a Z out of habit; the time it wrote is still
    // the user's wall clock, so it must not be read as UTC.
    expect(
      wallClockToUtc('2026-09-02T18:00:00Z', 'Africa/Cairo')?.toISOString(),
    ).toBe('2026-09-02T15:00:00.000Z');
  });
});

/**
 * `localHhMm` is the one addition P0 makes to the ported file: the rhythm tick
 * compares a member's clock against preferences stored as `HH:mm` strings, so
 * the comparison stays string-to-string with no arithmetic to get wrong.
 */
describe('localHhMm', () => {
  it('reads the clock in the member zone, not the server one', () => {
    const instant = new Date('2026-09-02T15:00:00.000Z');

    expect(localHhMm(instant, 'Africa/Cairo')).toBe('18:00');
    expect(localHhMm(instant, 'UTC')).toBe('15:00');
    expect(localHhMm(instant, 'America/New_York')).toBe('11:00');
  });

  it('formats midnight as 00:00, never 24:00', () => {
    // Some ICU versions format midnight as hour 24 under h23; a tick comparing
    // against a stored "00:00" would then never fire.
    const midnightInCairo = wallClockToUtc('2026-09-02T00:00', 'Africa/Cairo')!;

    expect(localHhMm(midnightInCairo, 'Africa/Cairo')).toBe('00:00');
  });

  it('pads a single-digit hour so string comparison stays valid', () => {
    const instant = wallClockToUtc('2026-09-02T08:05', 'UTC')!;

    expect(localHhMm(instant, 'UTC')).toBe('08:05');
  });
});

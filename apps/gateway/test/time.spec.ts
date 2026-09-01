import { describe, expect, it } from 'vitest';
import { formatInTz, localDate, wallClockToUtc } from '../src/common/time.js';

/**
 * The reminder path's arithmetic. The model writes a wall-clock time with no
 * zone — "tomorrow at 6pm" becomes "2026-09-02T18:00" — and this turns it into
 * the instant that names. Getting it wrong puts a reminder hours out, which is
 * the failure this whole area exists to prevent.
 */
describe('wallClockToUtc', () => {
  it('reads a wall-clock time as the zone the user is in', () => {
    // Cairo runs UTC+3 in September.
    expect(wallClockToUtc('2026-09-02T18:00', 'Africa/Cairo')?.toISOString()).toBe(
      '2026-09-02T15:00:00.000Z',
    );
  });

  it('is the identity in UTC', () => {
    expect(wallClockToUtc('2026-09-02T18:00', 'UTC')?.toISOString()).toBe(
      '2026-09-02T18:00:00.000Z',
    );
  });

  it('handles a zone behind UTC', () => {
    // New York is UTC-4 in September.
    expect(wallClockToUtc('2026-09-02T18:00', 'America/New_York')?.toISOString()).toBe(
      '2026-09-02T22:00:00.000Z',
    );
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

  it('returns null for anything it cannot read, rather than a wrong time', () => {
    for (const bad of ['', 'tomorrow', '2026-09-02', 'not a date']) {
      expect(wallClockToUtc(bad, 'UTC')).toBeNull();
    }
  });

  it('ignores a trailing zone marker instead of double-converting', () => {
    // The model sometimes appends a Z out of habit; the time it wrote is still
    // the user's wall clock, so it must not be read as UTC.
    expect(wallClockToUtc('2026-09-02T18:00:00Z', 'Africa/Cairo')?.toISOString()).toBe(
      '2026-09-02T15:00:00.000Z',
    );
  });
});

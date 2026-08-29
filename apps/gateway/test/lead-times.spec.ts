import { describe, expect, it } from 'vitest';
import { offsetLabel, parseOffset, planNotifications } from '../src/reminders/lead-times.js';

describe('parseOffset', () => {
  it('converts each supported unit to milliseconds', () => {
    expect(parseOffset('30m')).toBe(1_800_000);
    expect(parseOffset('2h')).toBe(7_200_000);
    expect(parseOffset('1d')).toBe(86_400_000);
    expect(parseOffset('0m')).toBe(0);
  });

  it('throws on a malformed offset instead of returning NaN', () => {
    expect(() => parseOffset('soon')).toThrow();
    expect(() => parseOffset('5w')).toThrow();
    expect(() => parseOffset('-1h')).toThrow();
  });
});

describe('offsetLabel', () => {
  it('singularises and pluralises', () => {
    expect(offsetLabel('1h')).toBe('1 hour before');
    expect(offsetLabel('2h')).toBe('2 hours before');
    expect(offsetLabel('30m')).toBe('30 minutes before');
    expect(offsetLabel('1d')).toBe('1 day before');
  });

  it('calls the zero offset "now"', () => {
    expect(offsetLabel('0m')).toBe('now');
  });
});

describe('planNotifications', () => {
  const now = new Date('2026-08-29T12:00:00Z');

  it('expands the default offsets for a comfortably future reminder', () => {
    const remindAt = new Date('2026-08-29T18:00:00Z');
    const planned = planNotifications(remindAt, ['1h', '0m'], now);
    expect(planned).toHaveLength(2);
    expect(planned[0]).toEqual({
      notifyAt: new Date('2026-08-29T17:00:00Z'),
      label: '1 hour before',
    });
    expect(planned[1]).toEqual({ notifyAt: remindAt, label: 'now' });
  });

  it('returns notifications in chronological order', () => {
    const remindAt = new Date('2026-08-30T12:00:00Z');
    const planned = planNotifications(remindAt, ['0m', '1d', '1h'], now);
    expect(planned.map((p) => p.label)).toEqual([
      '1 day before',
      '1 hour before',
      'now',
    ]);
  });

  it('drops a lead time that already passed, keeping the at-the-moment one', () => {
    // Reminder 20 minutes away: the "1 hour before" mark is in the past
    // and must not fire immediately.
    const remindAt = new Date('2026-08-29T12:20:00Z');
    const planned = planNotifications(remindAt, ['1h', '0m'], now);
    expect(planned.map((p) => p.label)).toEqual(['now']);
  });

  it('still notifies once for a reminder dated in the past', () => {
    const remindAt = new Date('2026-08-29T09:00:00Z');
    const planned = planNotifications(remindAt, ['1h', '0m'], now);
    expect(planned.map((p) => p.label)).toEqual(['now']);
  });

  it('deduplicates repeated offsets', () => {
    const remindAt = new Date('2026-08-29T18:00:00Z');
    const planned = planNotifications(remindAt, ['1h', '1h', '0m'], now);
    expect(planned).toHaveLength(2);
  });
});

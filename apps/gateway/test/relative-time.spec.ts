import { describe, expect, it } from 'vitest';
import { preferSoonestDay, resolveRelativePhrase } from '../src/chat/relative-time.js';

// 18:00 in Cairo (UTC+3) on Tuesday 1 September 2026.
const NOW = new Date('2026-09-01T15:00:00Z');
const TZ = 'Africa/Cairo';

describe('resolveRelativePhrase', () => {
  it('adds hours to the user\'s current local time', () => {
    expect(resolveRelativePhrase('remind me in 2 hours to check the oven', NOW, TZ)).toBe(
      '2026-09-01T20:00',
    );
  });

  it('handles minutes', () => {
    expect(resolveRelativePhrase('in 20 minutes', NOW, TZ)).toBe('2026-09-01T18:20');
  });

  it('rolls over midnight and into the next day', () => {
    expect(resolveRelativePhrase('in 8 hours', NOW, TZ)).toBe('2026-09-02T02:00');
  });

  it('handles days and weeks', () => {
    expect(resolveRelativePhrase('in 3 days', NOW, TZ)).toBe('2026-09-04T18:00');
    expect(resolveRelativePhrase('in 1 week', NOW, TZ)).toBe('2026-09-08T18:00');
  });

  it('reads the Arabic dual, which carries no digit', () => {
    // "بعد ساعتين" is "in two hours".
    expect(resolveRelativePhrase('فكرني بعد ساعتين', NOW, TZ)).toBe('2026-09-01T20:00');
  });

  it('reads Arabic-Indic digits', () => {
    expect(resolveRelativePhrase('بعد ٣٠ دقيقة', NOW, TZ)).toBe('2026-09-01T18:30');
  });

  it('is scoped to the user\'s zone, not the server\'s', () => {
    expect(resolveRelativePhrase('in 2 hours', NOW, 'UTC')).toBe('2026-09-01T17:00');
  });

  it('returns null when there is no such phrase', () => {
    for (const message of ['remind me tomorrow at 6pm', 'hello', 'in the morning']) {
      expect(resolveRelativePhrase(message, NOW, TZ)).toBeNull();
    }
  });
});

describe('preferSoonestDay', () => {
  it('pulls a bare time back to today when today has not passed it', () => {
    // Said at 18:00: "9pm" is tonight, not tomorrow night.
    expect(preferSoonestDay('2026-09-02T21:00', 'remind me to take the medicine at 9pm', NOW, TZ))
      .toBe('2026-09-01T21:00');
  });

  it('leaves tomorrow alone when the user said tomorrow', () => {
    expect(preferSoonestDay('2026-09-02T21:00', 'remind me tomorrow at 9pm', NOW, TZ)).toBe(
      '2026-09-02T21:00',
    );
  });

  it('leaves it alone when the time has already passed today', () => {
    // 09:00 is behind an 18:00 "now", so tomorrow is right.
    expect(preferSoonestDay('2026-09-02T09:00', 'remind me at 9am', NOW, TZ)).toBe(
      '2026-09-02T09:00',
    );
  });

  it('leaves a named weekday or date alone', () => {
    expect(preferSoonestDay('2026-09-05T10:00', 'remind me on Saturday at 10', NOW, TZ)).toBe(
      '2026-09-05T10:00',
    );
    expect(preferSoonestDay('2026-09-02T21:00', 'فكرني بكرة الساعة ٩', NOW, TZ)).toBe(
      '2026-09-02T21:00',
    );
  });

  it('leaves a date further out than tomorrow alone', () => {
    // Something in the message put it in October, even if this function cannot
    // see what; only the next-day slip is safe to correct.
    expect(preferSoonestDay('2026-10-05T10:00', 'the dentist at 10', NOW, TZ)).toBe(
      '2026-10-05T10:00',
    );
  });
});

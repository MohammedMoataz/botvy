import { describe, expect, it } from 'vitest';
import {
  allergyViolations,
  checkinStillOpen,
  completionRatio,
  currentStreak,
  isRestDay,
  isoWeekday,
  localDate,
  mayOverwrite,
  muscleGroupsToAvoid,
} from '../src/coaching/adherence.js';

const yes = (checkinDate: string) => ({ checkinDate, adhered: true });
const no = (checkinDate: string) => ({ checkinDate, adhered: false });

describe('localDate', () => {
  it('resolves the calendar date in the user timezone, not the server one', () => {
    // 22:30 UTC is already the next day in Cairo (UTC+3).
    const at = new Date('2026-08-30T22:30:00Z');
    expect(localDate(at, 'UTC')).toBe('2026-08-30');
    expect(localDate(at, 'Africa/Cairo')).toBe('2026-08-31');
  });
});

describe('currentStreak', () => {
  it('counts consecutive adhered days ending today', () => {
    const checkins = [yes('2026-08-30'), yes('2026-08-29'), yes('2026-08-28')];
    expect(currentStreak(checkins, '2026-08-30')).toBe(3);
  });

  it('stops at a missed day', () => {
    const checkins = [yes('2026-08-30'), no('2026-08-29'), yes('2026-08-28')];
    expect(currentStreak(checkins, '2026-08-30')).toBe(1);
  });

  it('does not treat an unanswered today as a break', () => {
    const checkins = [yes('2026-08-29'), yes('2026-08-28')];
    expect(currentStreak(checkins, '2026-08-30')).toBe(2);
  });

  it('is zero when today is answered as a miss', () => {
    const checkins = [no('2026-08-30'), yes('2026-08-29')];
    expect(currentStreak(checkins, '2026-08-30')).toBe(0);
  });

  it('is zero with no history', () => {
    expect(currentStreak([], '2026-08-30')).toBe(0);
  });
});

describe('completionRatio', () => {
  it('is the share of answered days that were adhered', () => {
    const checkins = [yes('2026-08-30'), no('2026-08-29'), yes('2026-08-28'), yes('2026-08-27')];
    expect(completionRatio(checkins, '2026-08-30', 7)).toBeCloseTo(3 / 4);
  });

  it('ignores days outside the window', () => {
    const checkins = [yes('2026-08-30'), no('2026-08-01')];
    expect(completionRatio(checkins, '2026-08-30', 7)).toBe(1);
  });

  it('is zero rather than NaN with nothing answered', () => {
    expect(completionRatio([], '2026-08-30', 7)).toBe(0);
  });
});

describe('isoWeekday / isRestDay', () => {
  it('numbers Monday as 1 and Sunday as 7', () => {
    expect(isoWeekday('2026-08-31')).toBe(1); // Monday
    expect(isoWeekday('2026-08-30')).toBe(7); // Sunday
  });

  it('treats a day outside the training schedule as rest', () => {
    const trainingDays = [1, 3, 5];
    expect(isRestDay('2026-08-31', trainingDays)).toBe(false); // Monday
    expect(isRestDay('2026-09-01', trainingDays)).toBe(true); // Tuesday
  });

  it('treats an unset schedule as no rest days rather than all of them', () => {
    expect(isRestDay('2026-09-01', [])).toBe(false);
  });
});

describe('mayOverwrite', () => {
  it('never lets a generated plan replace a reported session', () => {
    expect(mayOverwrite('reported', 'planned')).toBe(false);
  });

  it('lets a reported session replace a generated plan', () => {
    expect(mayOverwrite('planned', 'reported')).toBe(true);
  });

  it('allows writing when nothing exists yet', () => {
    expect(mayOverwrite(null, 'planned')).toBe(true);
  });

  it('allows a report to correct an earlier report', () => {
    expect(mayOverwrite('reported', 'reported')).toBe(true);
  });
});

describe('muscleGroupsToAvoid', () => {
  it("returns yesterday's groups, lowercased", () => {
    const recent = [
      { workoutDate: '2026-08-29', muscleGroups: ['Chest', 'Triceps'] },
      { workoutDate: '2026-08-28', muscleGroups: ['Back'] },
    ];
    expect(muscleGroupsToAvoid(recent, '2026-08-30')).toEqual(['chest', 'triceps']);
  });

  it('returns nothing when yesterday was a rest day', () => {
    const recent = [{ workoutDate: '2026-08-28', muscleGroups: ['Back'] }];
    expect(muscleGroupsToAvoid(recent, '2026-08-30')).toEqual([]);
  });
});

describe('allergyViolations', () => {
  it('finds a declared allergen present in a plan', () => {
    const plan = 'Breakfast: peanut butter on toast. Lunch: grilled chicken.';
    expect(allergyViolations(plan, ['peanut', 'shellfish'])).toEqual(['peanut']);
  });

  it('is case-insensitive and tolerates padded input', () => {
    expect(allergyViolations('Contains SHELLFISH stock', ['  shellfish '])).toHaveLength(1);
  });

  it('returns nothing for a safe plan', () => {
    expect(allergyViolations('Oats and berries', ['peanut'])).toEqual([]);
  });

  it('ignores empty allergy entries rather than matching everything', () => {
    expect(allergyViolations('Oats and berries', ['', '   '])).toEqual([]);
  });
});

describe('checkinStillOpen', () => {
  const now = new Date('2026-08-30T12:00:00Z');

  it('is open within the window', () => {
    expect(checkinStillOpen(new Date('2026-08-30T06:00:00Z'), now)).toBe(true);
  });

  it('is closed past the window, so a later message is not read as an answer', () => {
    expect(checkinStillOpen(new Date('2026-08-29T18:00:00Z'), now)).toBe(false);
  });

  it('is closed when nothing is pending', () => {
    expect(checkinStillOpen(null, now)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { arabicCounted, englishCounted, isArabic } from './counted.js';
import { ruleWords, type RuleParts } from './rule-words.js';

/**
 * The words the server puts on a repeating task (E-008).
 *
 * The Arabic cases are the substance. They are the phone's — a port of
 * `mobile/lib/core/recurrence/rule_words.dart`, which was written with a native
 * reader's eye on it — and the four agreement forms are asserted by number
 * rather than by sampling, because the errors are asymmetric: كل أسبوعين read
 * as "2 أسابيع" is the mistake a native speaker notices immediately, and it is
 * the one a naive `{count} + plural` template makes every time.
 */

function parts(overrides: Partial<RuleParts> = {}): RuleParts {
  return {
    freq: 'weekly',
    interval: 1,
    byWeekday: [],
    byMonthDay: [],
    count: null,
    until: null,
    ...overrides,
  };
}

describe('arabic number agreement', () => {
  const week = {
    one: 'أسبوع',
    two: 'أسبوعين',
    few: 'أسابيع',
    many: 'أسبوعًا',
  };

  it('drops the number entirely at one', () => {
    expect(arabicCounted(1, week)).toBe('أسبوع');
  });

  /** The dual. Its own word, not two-plus-plural — the visible error. */
  it('uses the dual at two, with no digit', () => {
    expect(arabicCounted(2, week)).toBe('أسبوعين');
    expect(arabicCounted(2, week)).not.toContain('2');
  });

  it('takes the plural from three to ten', () => {
    expect(arabicCounted(3, week)).toBe('3 أسابيع');
    expect(arabicCounted(10, week)).toBe('10 أسابيع');
  });

  /** Not a rounding of the rule above: the singular really does return. */
  it('returns to the singular from eleven', () => {
    expect(arabicCounted(11, week)).toBe('11 أسبوعًا');
    expect(arabicCounted(12, week)).toBe('12 أسبوعًا');
  });

  it('agrees in English too, so "1 days" cannot come back', () => {
    expect(englishCounted(1, { one: 'day', other: 'days' })).toBe('1 day');
    expect(englishCounted(2, { one: 'day', other: 'days' })).toBe('2 days');
  });

  it('reads any Arabic tag as Arabic and everything else as English', () => {
    expect(isArabic('ar')).toBe(true);
    expect(isArabic('ar-EG')).toBe(true);
    expect(isArabic('AR')).toBe(true);
    expect(isArabic('en')).toBe(false);
    // The rule for a member whose profile row does not exist yet.
    expect(isArabic('')).toBe(false);
    expect(isArabic(undefined)).toBe(false);
  });
});

describe('a repeat rule in words', () => {
  it('says every week and every day without a number', () => {
    expect(ruleWords(parts(), 'en')).toBe('every week');
    expect(ruleWords(parts(), 'ar')).toBe('كل أسبوع');
    expect(ruleWords(parts({ freq: 'daily' }), 'ar')).toBe('كل يوم');
  });

  /** The headline case of E-008, and the one a template gets wrong. */
  it('uses the dual for every two weeks', () => {
    expect(ruleWords(parts({ interval: 2 }), 'ar')).toBe('كل أسبوعين');
    expect(ruleWords(parts({ interval: 2 }), 'en')).toBe('every 2 weeks');
  });

  it('carries the interval through the plural and back to the singular', () => {
    expect(ruleWords(parts({ interval: 3 }), 'ar')).toBe('كل 3 أسابيع');
    expect(ruleWords(parts({ interval: 11 }), 'ar')).toBe('كل 11 أسبوعًا');
  });

  it('names the chosen days, separated by the Arabic comma', () => {
    // Monday and Wednesday, in `rrule`'s numbering.
    const weekly = parts({ byWeekday: [2, 0] });
    expect(ruleWords(weekly, 'en')).toBe('every week on Mon, Wed');
    expect(ruleWords(weekly, 'ar')).toBe('كل أسبوع أيام الاثنين، الأربعاء');
    // A Latin comma in Arabic text is a foreign mark.
    expect(ruleWords(weekly, 'ar')).not.toContain(',');
  });

  it('says يوم for a single day and أيام for several', () => {
    expect(ruleWords(parts({ byWeekday: [1] }), 'ar')).toBe(
      'كل أسبوع يوم الثلاثاء',
    );
  });

  it('says the month day as a cardinal in Arabic and an ordinal in English', () => {
    const monthly = parts({ freq: 'monthly', byMonthDay: [31] });
    expect(ruleWords(monthly, 'en')).toBe('every month on the 31st');
    expect(ruleWords(monthly, 'ar')).toBe('كل شهر في يوم 31 من الشهر');
  });

  it('names the last day of the month as its own clause', () => {
    const monthly = parts({ freq: 'monthly', byMonthDay: [-1] });
    expect(ruleWords(monthly, 'en')).toBe('every month on the last day');
    expect(ruleWords(monthly, 'ar')).toBe('كل شهر في آخر يوم من الشهر');
  });

  it('counts the times a bounded series runs, with agreement', () => {
    expect(ruleWords(parts({ count: 1 }), 'ar')).toBe('كل أسبوع، مرة واحدة');
    expect(ruleWords(parts({ count: 2 }), 'ar')).toBe('كل أسبوع، مرتين');
    expect(ruleWords(parts({ count: 3 }), 'ar')).toBe('كل أسبوع، 3 مرات');
    expect(ruleWords(parts({ count: 11 }), 'ar')).toBe('كل أسبوع، 11 مرةً');
    expect(ruleWords(parts({ count: 6 }), 'en')).toBe('every week, 6 times');
  });

  it('writes the end date as an ISO date in both languages', () => {
    const until = new Date('2026-12-31T23:59:59Z');
    expect(ruleWords(parts({ until }), 'en')).toBe(
      'every week, until 2026-12-31',
    );
    expect(ruleWords(parts({ until }), 'ar')).toBe('كل أسبوع، حتى 2026-12-31');
  });

  it('gives a member with no locale English', () => {
    expect(ruleWords(parts({ interval: 2 }), '')).toBe('every 2 weeks');
  });

  /**
   * Null rather than an approximation, and the caller then falls back to
   * something honest. A `BYSETPOS`-shaped rule rendered as "every month"
   * describes a series the member never asked for.
   */
  it('refuses a shape it cannot say rather than guessing', () => {
    expect(ruleWords(parts({ byMonthDay: [3, 17] }), 'ar')).toBeNull();
    expect(
      ruleWords(parts({ freq: 'daily', byWeekday: [0] }), 'ar'),
    ).toBeNull();
    expect(ruleWords(parts({ count: 3, until: new Date() }), 'en')).toBeNull();
    expect(ruleWords(parts({ interval: 0 }), 'en')).toBeNull();
  });
});

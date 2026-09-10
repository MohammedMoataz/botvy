import { describe, expect, it } from 'vitest';
import { localDate, localHhMm, wallClockToUtc } from '../../../shared/time/time.js';
import {
  mentionsAMoment,
  preferSoonestDay,
  resolveRelativePhrase,
} from './relative-time.js';

/**
 * The two time expressions a small model gets wrong, done in code instead.
 *
 * Ported from v1 with its reasoning, and specced here with three cases v1's
 * own tests did not have — all three found by using the ported file in P4:
 *
 *   1. **`in two hours` resolved to nothing.** The pattern matched a digit and
 *      a unit, plus the Arabic duals separately, so `2 hours` worked and the
 *      words did not. Which is the one thing this module exists to prevent: the
 *      *measured* failure on `qwen2.5:3b` was that "in two hours" produced no
 *      time at all, and falling through to the model is falling through to the
 *      thing that got it wrong.
 *   2. **`may` and `mar` were month abbreviations.** So any message containing
 *      the ordinary word "may" disabled `preferSoonestDay` — "remind me at 9pm,
 *      if I may" went to tomorrow.
 *   3. `unitRaw` was read without a check, which this repo's
 *      `noUncheckedIndexedAccess` refuses and v1's config did not.
 *
 * Every instant is derived from `Date.now()`. A fixture pinned to a real date
 * starts failing the day the clock reaches it, and one pinned to a past date
 * starts failing when a government changes that year's daylight-saving rule.
 */

const CAIRO = 'Africa/Cairo';

/** A known local wall clock today, so the arithmetic has something to be right about. */
function at(hhmm: string, zone = CAIRO): Date {
  const instant = wallClockToUtc(`${localDate(new Date(), zone)}T${hhmm}`, zone);
  if (!instant) throw new Error(`cannot resolve ${hhmm} in ${zone}`);
  return instant;
}

function plusMinutes(now: Date, minutes: number, zone = CAIRO): string {
  const later = new Date(now.getTime() + minutes * 60_000);
  return `${localDate(later, zone)}T${localHhMm(later, zone)}`;
}

describe('a relative phrase is resolved in code, not by the model', () => {
  const now = at('14:10');

  it('reads digits', () => {
    expect(resolveRelativePhrase('remind me in 2 hours', now, CAIRO)).toBe(
      plusMinutes(now, 120),
    );
    expect(resolveRelativePhrase('in 30 minutes', now, CAIRO)).toBe(
      plusMinutes(now, 30),
    );
  });

  it('reads number words, which v1 could not', () => {
    /*
     * The gap that mattered most, because it is how people actually write.
     * Before the word table this returned null and the turn fell through to
     * whatever the model guessed — and the model's measured answer for exactly
     * this phrase was no time at all.
     */
    expect(resolveRelativePhrase('remind me in two hours', now, CAIRO)).toBe(
      plusMinutes(now, 120),
    );
    expect(resolveRelativePhrase('in ten minutes', now, CAIRO)).toBe(
      plusMinutes(now, 10),
    );
    expect(resolveRelativePhrase('in an hour', now, CAIRO)).toBe(
      plusMinutes(now, 60),
    );
    expect(resolveRelativePhrase('in half an hour', now, CAIRO)).toBe(
      plusMinutes(now, 30),
    );
  });

  it('reads the Arabic duals, which carry no digit', () => {
    // `ساعتين` means exactly two hours and has no number in it, so it cannot be
    // matched by the number-plus-unit pattern. Its own table, and the reason
    // the file has one.
    expect(resolveRelativePhrase('فكرني بعد ساعتين', now, CAIRO)).toBe(
      plusMinutes(now, 120),
    );
    expect(resolveRelativePhrase('بعد دقيقتين', now, CAIRO)).toBe(
      plusMinutes(now, 2),
    );
  });

  it('reads Arabic-Indic digits', () => {
    expect(resolveRelativePhrase('فكرني بعد ٣٠ دقيقة', now, CAIRO)).toBe(
      plusMinutes(now, 30),
    );
  });

  it('answers null when there is no relative phrase at all', () => {
    // Null and not a guess: the caller then trusts the model's `when`, and the
    // executor refuses a moment in the past. A default here would invent a
    // reminder the member never asked for.
    expect(resolveRelativePhrase('remind me to call the dentist', now, CAIRO)).toBeNull();
    expect(resolveRelativePhrase('what is on today?', now, CAIRO)).toBeNull();
  });

  it('answers null for a phrase with no readable duration', () => {
    expect(resolveRelativePhrase('in a while', now, CAIRO)).toBeNull();
  });
});

describe('a bare time means today when today has not passed it', () => {
  it('pulls tomorrow back to today', () => {
    // "Remind me at 9pm", said at six, means tonight. Every reminder app
    // behaves this way and the model does not.
    const now = at('18:00');
    const tomorrow = localDate(new Date(now.getTime() + 86_400_000), CAIRO);
    const today = localDate(now, CAIRO);

    expect(
      preferSoonestDay(`${tomorrow}T21:00`, 'remind me at 9pm', now, CAIRO),
    ).toBe(`${today}T21:00`);
  });

  it('leaves it alone when the member named a day', () => {
    const now = at('18:00');
    const tomorrow = localDate(new Date(now.getTime() + 86_400_000), CAIRO);

    expect(
      preferSoonestDay(`${tomorrow}T21:00`, 'remind me tomorrow at 9pm', now, CAIRO),
    ).toBe(`${tomorrow}T21:00`);
    expect(
      preferSoonestDay(`${tomorrow}T21:00`, 'فكرني بكرة الساعة ٩', now, CAIRO),
    ).toBe(`${tomorrow}T21:00`);
  });

  it('leaves it alone when today’s copy of that time has already gone', () => {
    // 21:00 asked for at 22:00 is tomorrow, and pulling it back would be a
    // reminder in the past.
    const now = at('22:00');
    const tomorrow = localDate(new Date(now.getTime() + 86_400_000), CAIRO);

    expect(
      preferSoonestDay(`${tomorrow}T21:00`, 'remind me at 9pm', now, CAIRO),
    ).toBe(`${tomorrow}T21:00`);
  });

  it('is not fooled by the word "may"', () => {
    /*
     * v1 listed the month abbreviations as bare words, so `may` — one of the
     * commonest words in English, and the only entry on that list that is also
     * a modal verb — disabled the whole correction. "Remind me at 9pm, if I
     * may" went to tomorrow. `march` did it too.
     *
     * A month is only a date when it carries a day, so the pattern now needs a
     * number beside it.
     */
    const now = at('18:00');
    const tomorrow = localDate(new Date(now.getTime() + 86_400_000), CAIRO);
    const today = localDate(now, CAIRO);

    expect(
      preferSoonestDay(`${tomorrow}T21:00`, 'remind me at 9pm if I may', now, CAIRO),
    ).toBe(`${today}T21:00`);
    expect(
      preferSoonestDay(`${tomorrow}T21:00`, 'we march at 9pm', now, CAIRO),
    ).toBe(`${today}T21:00`);
  });

  it('still recognises a month that carries a day', () => {
    const now = at('18:00');
    const tomorrow = localDate(new Date(now.getTime() + 86_400_000), CAIRO);

    // "3 Jan" and "Jan 3" are both dates, and a member who named one meant it.
    expect(
      preferSoonestDay(`${tomorrow}T21:00`, 'remind me 3 Jan at 9pm', now, CAIRO),
    ).toBe(`${tomorrow}T21:00`);
    expect(
      preferSoonestDay(`${tomorrow}T21:00`, 'remind me Jan 3 at 9pm', now, CAIRO),
    ).toBe(`${tomorrow}T21:00`);
  });

  it('leaves a weekday alone, because "monday" is never anything else', () => {
    const now = at('18:00');
    const tomorrow = localDate(new Date(now.getTime() + 86_400_000), CAIRO);

    expect(
      preferSoonestDay(`${tomorrow}T21:00`, 'remind me monday at 9pm', now, CAIRO),
    ).toBe(`${tomorrow}T21:00`);
  });

  it('leaves a wall clock it cannot parse exactly as it found it', () => {
    const now = at('18:00');
    expect(preferSoonestDay('not a time', 'remind me at 9pm', now, CAIRO)).toBe(
      'not a time',
    );
  });
});

describe('mentionsAMoment', () => {
  /*
   * The guard that stops a model's invented time from becoming a calendar
   * entry. P5's corpus found `qwen2.5:3b-instruct` answering `set_meeting`
   * correctly for a sentence naming no time at all and then supplying `08:00`
   * — so the extractor drops a wall clock the sentence could not have
   * contained, and the executor asks instead (FR-006).
   *
   * The two halves are asserted separately because the failure modes are not
   * symmetric: a false negative costs one question, a false positive is a
   * meeting at an hour nobody chose.
   */

  it('is false for a sentence with no time in it, in either language', () => {
    // The corpus case itself: "I have an appointment with the doctor at the
    // clinic, put it in my calendar."
    expect(
      mentionsAMoment('عندي معاد مع الدكتور في العيادة، اعمله في التقويم'),
    ).toBe(false);
    expect(mentionsAMoment('schedule a call with Sara')).toBe(false);
    expect(mentionsAMoment('put the standup in my calendar')).toBe(false);
    expect(mentionsAMoment('اعملي اجتماع مع سارة')).toBe(false);
  });

  it('is true for anything a time could have been read from', () => {
    for (const text of [
      'meeting at 7:30',
      'call at 9pm',
      'lunch at noon',
      'standup tomorrow',
      'on Tuesday',
      '14 Mar',
      'in two hours',
      'اجتماع بكرة',
      'الساعة ٧ ونص',
      'بعد ساعتين',
      'الاجتماع الظهر',
    ]) {
      expect(mentionsAMoment(text), text).toBe(true);
    }
  });

  it('counts a digit anywhere, which is the cheap majority of real times', () => {
    // A member who names an hour almost always writes a number, so this one
    // clause carries most of the recall — and it is why the word list can stay
    // short, every entry in it being another chance to accept an invention.
    expect(mentionsAMoment('meeting 3pm')).toBe(true);
    expect(mentionsAMoment('اجتماع ٣ العصر')).toBe(true);
  });
});

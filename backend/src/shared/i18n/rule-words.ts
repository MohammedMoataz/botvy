import { arabicCounted, isArabic } from './counted.js';

/**
 * A repeat rule in the member's own words — the TypeScript half of
 * `mobile/lib/core/recurrence/rule_words.dart`.
 *
 * ## Why the server renders this at all
 *
 * E-008: `TaskView.recurrenceText` came from `rrule`'s own `toText()`, which is
 * English unless it is handed a gettext table per language, and `rrule` ships
 * no Arabic one. The enhancement's preferred exit was for every surface to
 * render the structured rule itself, which the phone now does — but the field
 * is published on the GraphQL read model and the side panel consumes it, so
 * removing it would break a client this change cannot edit. Filling it in the
 * member's language reaches every reader of it at once, including that one.
 *
 * ## Why this is a port and not a translation table
 *
 * Arabic number agreement is agreement logic, not a string: كل أسبوعين is not
 * كل ٢ أسابيع, and a table with `{count}` holes in it has no way to *choose*
 * between the four forms. The rule lives in `counted.ts`, the words live here,
 * and both are the phone's — the same sentence, from the same rules, whichever
 * surface the member is reading.
 *
 * ## What it does not do
 *
 * It takes **structured parts**, not an RRULE string. There is exactly one
 * RRULE parser on this server and it is `rrule` itself, inside Planning's
 * `Recurrence`; a second one here would be a second thing to be wrong about
 * `BYSETPOS`. A rule shaped in a way these words cannot say — yearly, an
 * ordinal weekday, anything the two pickers do not write — returns `null`, and
 * the caller falls back to whatever honest thing it has.
 */

/** The parts of a rule these words are built from, as `rrule` numbers them. */
export interface RuleParts {
  freq: 'daily' | 'weekly' | 'monthly';
  /** At least 1. */
  interval: number;
  /** `0` = Monday … `6` = Sunday, `rrule`'s own weekday numbering. Empty means "the day the series starts on", which needs no clause. */
  byWeekday: number[];
  /** `-1` is "the last day of the month". Empty means "the day the series starts on". */
  byMonthDay: number[];
  count: number | null;
  until: Date | null;
}

/** `MO`-order short names, for English. */
const WEEKDAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The same days in Arabic, and they are the **full** names on purpose.
 *
 * English abbreviates because "Mon" is a convention every reader knows; Arabic
 * has no equivalent short form in general use, so an invented one ("الاث")
 * would read as a typo. These are the phone's, character for character, so the
 * repeat picker and the server say the same word.
 */
const WEEKDAYS_AR = [
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
  'الأحد',
];

/**
 * The rule in words, or `null` when these words cannot say it.
 *
 * Null rather than an approximation, for the reason the phone gives: a
 * `BYSETPOS` rule rendered as "every month" describes a series the member never
 * asked for, and a member who cannot trust the sentence cannot trust the
 * picker that wrote it.
 */
export function ruleWords(parts: RuleParts, locale: string): string | null {
  if (parts.interval < 1) return null;
  if (parts.byWeekday.some((day) => day < 0 || day > 6)) return null;
  if (parts.freq !== 'weekly' && parts.byWeekday.length > 0) return null;
  if (parts.freq !== 'monthly' && parts.byMonthDay.length > 0) return null;
  // One month-day, or the last day. "The 3rd and the 17th" is a rule neither
  // picker writes and a clause neither language has a short form for.
  if (parts.byMonthDay.length > 1) return null;
  const monthDay = parts.byMonthDay[0];
  if (
    monthDay !== undefined &&
    monthDay !== -1 &&
    (monthDay < 1 || monthDay > 31)
  )
    return null;
  if (parts.count !== null && parts.until !== null) return null;

  return isArabic(locale) ? arabic(parts, monthDay) : english(parts, monthDay);
}

function english(parts: RuleParts, monthDay: number | undefined): string {
  const every =
    parts.interval === 1
      ? { daily: 'every day', weekly: 'every week', monthly: 'every month' }[
          parts.freq
        ]
      : `every ${parts.interval} ${{ daily: 'days', weekly: 'weeks', monthly: 'months' }[parts.freq]}`;

  let where = '';
  if (parts.freq === 'weekly' && parts.byWeekday.length > 0) {
    const ordered = [...parts.byWeekday].sort((a, b) => a - b);
    where = ` on ${ordered.map((day) => WEEKDAYS_EN[day]).join(', ')}`;
  } else if (monthDay === -1) {
    where = ' on the last day';
  } else if (monthDay !== undefined) {
    where = ` on the ${ordinal(monthDay)}`;
  }

  const stops =
    parts.count !== null
      ? `, ${parts.count} times`
      : parts.until !== null
        ? `, until ${isoDate(parts.until)}`
        : '';

  return `${every}${where}${stops}`;
}

/**
 * The same rule in Arabic.
 *
 * Every number goes through `arabicCounted`, because agreement is the whole
 * substance of this function. The plural of شهر is given as أشهر rather than
 * شهور — both are correct and أشهر is the one in ordinary written use — and
 * the separator between days is the Arabic comma ، (U+060C); a Latin comma in
 * Arabic text is a foreign mark.
 */
function arabic(parts: RuleParts, monthDay: number | undefined): string {
  const every = `كل ${{
    daily: () =>
      arabicCounted(parts.interval, {
        one: 'يوم',
        two: 'يومين',
        few: 'أيام',
        many: 'يومًا',
      }),
    weekly: () =>
      arabicCounted(parts.interval, {
        one: 'أسبوع',
        two: 'أسبوعين',
        few: 'أسابيع',
        many: 'أسبوعًا',
      }),
    monthly: () =>
      arabicCounted(parts.interval, {
        one: 'شهر',
        two: 'شهرين',
        few: 'أشهر',
        many: 'شهرًا',
      }),
  }[parts.freq]()}`;

  let where = '';
  if (parts.freq === 'weekly' && parts.byWeekday.length > 0) {
    const ordered = [...parts.byWeekday].sort((a, b) => a - b);
    // يوم for one day and أيام for several — the same singular/plural question
    // as the interval, one step down.
    const head = ordered.length === 1 ? 'يوم' : 'أيام';
    where = ` ${head} ${ordered.map((day) => WEEKDAYS_AR[day]).join('، ')}`;
  } else if (monthDay === -1) {
    where = ' في آخر يوم من الشهر';
  } else if (monthDay !== undefined) {
    // A cardinal with يوم, not an ordinal. Arabic ordinals inflect for gender
    // and case — "the 31st" written out is اليوم الحادي والثلاثين — which is a
    // heavier register than a task row wants and one more thing to get wrong
    // for each of thirty-one days. `يوم 31 من الشهر` is what a calendar says.
    where = ` في يوم ${monthDay} من الشهر`;
  }

  const stops =
    parts.count !== null
      ? `، ${arabicCounted(parts.count, {
          one: 'مرة واحدة',
          two: 'مرتين',
          few: 'مرات',
          many: 'مرةً',
        })}`
      : parts.until !== null
        ? `، حتى ${isoDate(parts.until)}`
        : '';

  return `${every}${where}${stops}`;
}

/**
 * `2026-12-31`, shared by both languages: an ISO date carries no words to
 * translate, and it is the shape the rest of the product writes a bare date in.
 *
 * UTC, because the rule's `UNTIL` is written as the end of the member's chosen
 * local day — `rule_words.dart` explains why — so its date parts are already
 * the ones the member picked.
 */
function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

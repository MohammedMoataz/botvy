import { RRule, rrulestr } from 'rrule';
import {
  localDate,
  localHhMm,
  wallClockToUtc,
} from '../../../shared/time/time.js';

export type RecurrenceMode = 'schedule' | 'completion';

/**
 * A repeating task's rule, as stored: a start, an RRULE string, the mode that
 * decides what "next" means, and the occurrences the member removed.
 *
 * Never expanded into rows. A recurring task is one document; the occurrences
 * are computed for the window somebody asked about, and a moved occurrence is
 * an override rather than an edit to the series.
 */
export interface RecurrenceRule {
  dtstart: Date;
  rrule: string;
  mode: RecurrenceMode;
  exdates: Date[];
}

/**
 * The two modes, in the member's words:
 *
 *   - **schedule** — "water the plants every Tuesday". Tuesday comes whether or
 *     not last Tuesday's watering happened. The next occurrence is measured
 *     from the *scheduled* one.
 *   - **completion** — "change the bedsheets every two weeks". Two weeks from
 *     when you actually did it, not from when you were supposed to. The next
 *     occurrence is measured from the completion.
 *
 * They differ only when a task is completed late or early, which is most of the
 * time, and getting it wrong is the difference between a chore list that drifts
 * with your life and one that piles up accusingly.
 */

/**
 * Every recurrence computation happens in the member's own zone.
 *
 * This is not a nicety. `rrule` has no notion of a time zone: it treats a Date
 * as a bag of fields and steps them forward, so handing it a real instant makes
 * every occurrence a fixed *UTC* offset from the first one. A weekly task set
 * for 18:00 in Cairo would then fire at 18:00 through the winter and 17:00
 * after the clocks moved — the same class of bug that once shifted every
 * extracted reminder by three hours, arriving by a different route.
 *
 * So the rule is evaluated on *floating* dates: a Date whose UTC fields hold
 * the member's wall clock. `rrule` steps those, and each result is converted
 * back to a real instant through `shared/time`, which knows what the member's
 * clock read that day. "Every Tuesday at 18:00" then means 18:00 on the
 * member's clock every Tuesday, across a daylight-saving change, which is what
 * the member asked for.
 *
 * Minute granularity: seconds are dropped on the way through. Nothing in this
 * product schedules to the second, and carrying a field no feature reads would
 * only be a place for the two representations to disagree.
 */
function toFloating(instant: Date, timezone: string): Date {
  const date = localDate(instant, timezone); // YYYY-MM-DD in the member's zone
  const time = localHhMm(instant, timezone); // HH:mm on the member's clock
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0),
  );
}

/**
 * The inverse. A floating Date's UTC fields are read as a wall clock and
 * resolved against the zone, so an occurrence landing in a daylight-saving gap
 * comes back as the first valid instant after it rather than as an hour that
 * never happened.
 */
function fromFloating(floating: Date, timezone: string): Date | null {
  const wallClock =
    `${floating.getUTCFullYear()}-` +
    `${String(floating.getUTCMonth() + 1).padStart(2, '0')}-` +
    `${String(floating.getUTCDate()).padStart(2, '0')}T` +
    `${String(floating.getUTCHours()).padStart(2, '0')}:` +
    `${String(floating.getUTCMinutes()).padStart(2, '0')}`;
  return wallClockToUtc(wallClock, timezone);
}

/** Same minute on the member's clock, which is how an exdate is matched. */
function sameMinute(a: Date, b: Date): boolean {
  return Math.floor(a.getTime() / 60_000) === Math.floor(b.getTime() / 60_000);
}

/**
 * How far apart two occurrences of this rule are, as a calendar step rather
 * than a duration.
 *
 * A duration would be wrong twice over: adding 24 hours to an instant crosses a
 * daylight-saving boundary an hour off, and "every month" has no fixed length
 * at all. So the step is expressed in the unit the rule is written in and
 * applied to the member's local calendar date, where "a month later" means the
 * same day number in the next month and "a day later" means tomorrow whatever
 * happened to the clocks.
 */
interface CalendarStep {
  unit: 'day' | 'week' | 'month' | 'year';
  count: number;
}

function stepOf(rule: RRule): CalendarStep {
  const count = rule.options.interval || 1;
  switch (rule.options.freq) {
    case RRule.YEARLY:
      return { unit: 'year', count };
    case RRule.MONTHLY:
      return { unit: 'month', count };
    case RRule.WEEKLY:
      return { unit: 'week', count };
    default:
      // DAILY, and anything finer. Sub-daily recurrence is not a thing this
      // product offers — the editor only writes daily, weekly, monthly and
      // yearly rules — so an HOURLY rule arriving from somewhere is treated as
      // daily rather than accepted as a rule nothing else in the system can
      // render or explain to the member.
      return { unit: 'day', count };
  }
}

/**
 * Advances a local calendar date, then re-imposes a wall-clock time.
 *
 * The clamp on month and year steps is the one every calendar has to make: the
 * 31st plus one month has no answer in February, and the choice here is the
 * last day of the shorter month rather than spilling into March. A monthly task
 * set for the 31st therefore lands on the 28th, 29th or 30th and then returns
 * to the 31st, because the step is always measured from the rule's own start
 * rather than from wherever the last clamp landed.
 */
function addStep(
  fromLocalDate: string,
  step: CalendarStep,
  occurrence: number,
): string {
  const [year, month, day] = fromLocalDate.split('-').map(Number);
  const y = year ?? 1970;
  const m = (month ?? 1) - 1;
  const d = day ?? 1;
  const amount = step.count * occurrence;

  if (step.unit === 'day' || step.unit === 'week') {
    const days = step.unit === 'week' ? amount * 7 : amount;
    const moved = new Date(Date.UTC(y, m, d + days));
    return isoDate(moved);
  }

  const months = step.unit === 'year' ? amount * 12 : amount;
  const targetMonth = m + months;
  const targetYear = y + Math.floor(targetMonth / 12);
  const normalisedMonth = ((targetMonth % 12) + 12) % 12;
  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(
    Date.UTC(targetYear, normalisedMonth + 1, 0),
  ).getUTCDate();
  return isoDate(
    new Date(Date.UTC(targetYear, normalisedMonth, Math.min(d, lastDay))),
  );
}

function isoDate(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}-${String(
    at.getUTCDate(),
  ).padStart(2, '0')}`;
}

/**
 * The rule, parsed once and asked questions.
 *
 * Constructed through `parse`, which returns null for a rule string the library
 * refuses. A task carrying an unparseable rule is a task that cannot be
 * completed — the advance would throw on the one operation the member most
 * wants to succeed — so the aggregate treats a refused rule as "no recurrence"
 * and says so at the boundary instead.
 */
export class Recurrence {
  private constructor(
    private readonly rule: RRule,
    readonly spec: RecurrenceRule,
  ) {}

  /**
   * `null` rather than a throw, because the caller is a domain method with a
   * better answer available: refuse the write at the edge, where the member can
   * be told, rather than half-way through completing a task.
   */
  static parse(spec: RecurrenceRule, timezone: string): Recurrence | null {
    try {
      const parsed = rrulestr(
        spec.rrule.startsWith('RRULE:') || spec.rrule.startsWith('DTSTART')
          ? spec.rrule
          : `RRULE:${spec.rrule}`,
        { dtstart: toFloating(spec.dtstart, timezone) },
      );
      // `rrulestr` also parses RRULESET, which carries its own exdates and its
      // own semantics for them. This context stores exceptions in `exdates` and
      // applies them here, so a set arriving from outside would have two
      // exception lists disagreeing about the same series.
      if (!(parsed instanceof RRule)) return null;
      return new Recurrence(parsed, spec);
    } catch {
      return null;
    }
  }

  get mode(): RecurrenceMode {
    return this.spec.mode;
  }

  /**
   * The next occurrence strictly after `after`, or null when the series has
   * run out — a rule with `COUNT` or `UNTIL` ends, and a task whose series has
   * ended simply completes for the last time.
   *
   * In **schedule** mode this is the rule's own next occurrence: the calendar
   * decides, and completing late does not move the series.
   *
   * In **completion** mode the rule supplies only the step; the step is applied
   * to the day the work was actually done, keeping the series' own time of day.
   * "Every two weeks from when I do it" is then two weeks from the doing, at
   * the hour the member originally chose — not at whatever hour they happened
   * to tick it off, which would let a task done at 23:50 drift into the night.
   */
  next(after: Date, timezone: string): Date | null {
    if (this.spec.mode === 'completion')
      return this.nextFromCompletion(after, timezone);

    const floatingAfter = toFloating(after, timezone);
    // Walk forward rather than take the first hit, because an exdate is an
    // occurrence the member removed and the one after it is the answer. The
    // bound is a guard against a rule whose every remaining occurrence has been
    // excluded: 200 is far past any real exdate list and stops a pathological
    // rule from spinning.
    let cursor = floatingAfter;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const occurrence = this.rule.after(cursor, false);
      if (!occurrence) return null;

      const instant = fromFloating(occurrence, timezone);
      if (!instant) return null;
      if (!this.isExcluded(instant)) return instant;
      cursor = occurrence;
    }
    return null;
  }

  /**
   * Mode `completion`: the step applied to the completion's own local day, with
   * the series' time of day re-imposed.
   *
   * The time of day comes from `dtstart` and not from the completion, which is
   * the whole point — see `next`.
   */
  private nextFromCompletion(completedAt: Date, timezone: string): Date | null {
    const step = stepOf(this.rule);
    const timeOfDay = localHhMm(this.spec.dtstart, timezone);

    // Occurrence 1 is one step out. If the member removed that day, take the
    // next step, and so on: the exception list means "not this day", and it
    // means it whichever mode moved us there.
    for (let occurrence = 1; occurrence <= 200; occurrence += 1) {
      const day = addStep(localDate(completedAt, timezone), step, occurrence);
      const instant = wallClockToUtc(`${day}T${timeOfDay}`, timezone);
      if (!instant) return null;
      if (!this.isExcluded(instant)) return instant;
    }
    return null;
  }

  /**
   * Every occurrence inside a window, for a caller rendering a calendar.
   *
   * `completion`-mode series have no calendar of their own — where the next one
   * lands depends on when the current one is done, which has not happened yet —
   * so such a series reports only the occurrence it is currently sitting on.
   * Projecting a speculative chain onto a month view would show the member
   * appointments they never made.
   */
  between(from: Date, to: Date, timezone: string): Date[] {
    if (this.spec.mode === 'completion') return [];

    return this.rule
      .between(toFloating(from, timezone), toFloating(to, timezone), true)
      .map((occurrence) => fromFloating(occurrence, timezone))
      .filter(
        (instant): instant is Date =>
          instant !== null && !this.isExcluded(instant),
      );
  }

  /**
   * The rule with one occurrence removed. Returns the new spec rather than
   * mutating, because the aggregate is what decides to keep it — skipping an
   * occurrence is an event, not a side effect of asking a question.
   */
  skip(occurrence: Date): RecurrenceRule {
    if (this.isExcluded(occurrence)) return this.spec;
    return { ...this.spec, exdates: [...this.spec.exdates, occurrence] };
  }

  isExcluded(occurrence: Date): boolean {
    return this.spec.exdates.some((exdate) => sameMinute(exdate, occurrence));
  }

  /**
   * "every 2 weeks on Tuesday", for a confirmation line.
   *
   * English only, and deliberately not localised here: `rrule`'s own
   * translation needs a gettext table per language, and the client already
   * holds the strings for its locale. The server sends the rule; the phone
   * renders it in Arabic when that is what the member reads.
   */
  humanText(): string {
    try {
      return this.rule.toText();
    } catch {
      return this.spec.rrule;
    }
  }
}

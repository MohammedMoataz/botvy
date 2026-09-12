import rrule from 'rrule';
import type { RRule as RRuleClass } from 'rrule';
import {
  localDate,
  localHhMm,
  wallClockToUtc,
} from '../../../shared/time/time.js';

/**
 * `rrule` is CommonJS and this package is `"type": "module"`, so the named
 * import type-checks, passes every vitest run and is `undefined` under plain
 * `node`. Destructuring off the default export is what works in both; the type
 * comes from a type-only named import, which is erased and so unaffected.
 * Planning's `recurrence.ts` carries the long version of this note.
 */
const { RRule, rrulestr } = rrule;
type ParsedRule = RRuleClass;

/**
 * Where a meeting is. At least one half is always present — a meeting with
 * neither is refused at the write (FR-001) — and both may be, because a room
 * that is also dialled into is one meeting rather than two.
 */
export interface MeetingLocation {
  onlineLink: string | null;
  address: string | null;
}

/**
 * One occurrence the member changed, keyed by the moment the *rule* produced.
 *
 * `originalStart` is the key and it never moves. That is the whole design: a
 * moved occurrence stays attached to the date the rule generated, so editing
 * the series later can still find it, and moving the same occurrence twice
 * updates one override rather than accumulating two.
 *
 * Every other field is optional and means "unchanged" when absent — `startAt`
 * absent is a skip-shaped override that has moved nowhere, which is not a state
 * this context writes; a skip is an `exdate`, because a skip has nothing left
 * to say about the occurrence and an override would keep a row alive to
 * describe an absence.
 */
export interface OccurrenceOverride {
  originalStart: Date;
  startAt?: Date | null;
  durationMin?: number | null;
  title?: string | null;
  location?: MeetingLocation | null;
}

/**
 * A repeat, as stored: a start, a rule, the dates the member removed and the
 * occurrences they moved. Never expanded into rows (FR-006), so a series of any
 * length costs one document.
 *
 * This is Meetings' own shape and it is deliberately *not* Planning's
 * `RecurrenceRule`. Planning carries a `mode` (from-schedule versus
 * from-completion) that a meeting has no meaning for, and Meetings carries
 * `overrides`, which a task has no use for — a task's occurrence is a moment,
 * a meeting's is a thing with a title and a place. Constitution IX: the second
 * copy is cheaper than a shared abstraction that has to be true of both.
 */
export interface MeetingRecurrence {
  dtstart: Date;
  /** RFC 5545, without the `DTSTART` line — `dtstart` above carries it. */
  rrule: string;
  exdates: Date[];
  overrides: OccurrenceOverride[];
}

/** What the expander produces. Derived on read, never stored. */
export interface Occurrence {
  /** The rule's own moment: the override key, and what a client sends back. */
  originalStart: Date;
  /** Where it actually sits, after any override. */
  startAt: Date;
  endAt: Date;
  durationMin: number;
  title: string;
  location: MeetingLocation;
  /** True when an override moved it, so a client can mark it. */
  moved: boolean;
}

/** Everything the expander needs, from a meeting or from a personal event. */
export interface Repeating {
  title: string;
  startAt: Date;
  durationMin: number;
  location: MeetingLocation;
  recurrence: MeetingRecurrence | null;
  /** The zone the series is pinned to, or null to follow the member (FR-007). */
  lockTimezone: string | null;
  /**
   * The zone whose clock the member was reading when they wrote this. Never
   * null, never changed afterwards.
   *
   * This field is what makes FR-007's travel clause expressible at all, and
   * the reason is worth stating because the first implementation here did not
   * have it and was quietly wrong.
   *
   * A stored instant does not remember what the member typed. "18:00" in Cairo
   * is one instant; read in Berlin the same instant is 17:00, so a series
   * expanded from the instant alone lands a member who has flown at 17:00 —
   * neither the 18:00 they asked for nor the Cairo time they might have wanted,
   * and it drifts again with every further move. Recovering "18:00" needs the
   * instant *and* the zone it was written in, so the zone is stored.
   *
   * With it, both halves of FR-007 fall out of one line: the wall-clock digits
   * come from `lockTimezone ?? authoredTimezone` and the expansion happens in
   * `lockTimezone ?? the member's current zone`. A pinned series therefore
   * keeps its instants when the member moves, and an unpinned one keeps its
   * digits and moves its instants — which is exactly what FR-014 then asks
   * Notifications to re-plan.
   */
  authoredTimezone: string;
}

/**
 * Occurrences inside a window, in the member's own wall clock.
 *
 * ## Wall time, not a fixed offset (FR-007, SC-005)
 *
 * `rrule` has no notion of a zone: it treats a Date as a bag of fields and
 * steps them. Handing it a real instant therefore makes every occurrence a
 * fixed *UTC* offset from the first, so a weekly 18:00 meeting in Cairo becomes
 * 17:00 the week the clocks move. So the rule is evaluated on **floating**
 * dates — a Date whose UTC fields hold the member's wall clock — and each
 * result is resolved back through `shared/time`, which knows what that zone's
 * clock read on that day.
 *
 * ## Two zones, and they are not the same question (FR-007)
 *
 * **Which digits** — 18:00 — comes from `lockTimezone ?? authoredTimezone`:
 * the zone the series' wall clock is written in, which never changes.
 * **Which clock those digits are read on** comes from
 * `lockTimezone ?? zone`, `zone` being the member's own right now. So a
 * pinned series keeps its instants when the member flies ("keep this on
 * Cairo's clock"), and an unpinned one keeps its digits and moves its instants
 * — the member's 18:00 routine is at 18:00 wherever they are, which is what
 * FR-014 then has Notifications re-plan the warnings for. `authoredTimezone`
 * carries the note on why an instant alone cannot answer this.
 *
 * ## Monthly on the 31st, both ways (spec story 2, scenario 1)
 *
 * Not decided here, deliberately. `BYMONTHDAY=31` is RFC 5545 for "the 31st",
 * and the 31st does not exist in February — `rrule` skips the month, which is
 * the standard's answer and the right one for "pay the rent on the 31st, and
 * February has its own arrangement". `BYMONTHDAY=-1` is "the last day of the
 * month" and lands on the 28th or 29th. Both are expanded correctly by the code
 * below because both are ordinary rules; the *choice* belongs to the editor,
 * which says it in the member's words ("monthly on the last day") rather than
 * guessing from the start date. Guessing is how a meeting either disappears in
 * February or silently moves for somebody who meant the 31st.
 *
 * ## A rule the library refuses still shows its first occurrence
 *
 * Writes validate the rule (`Meeting.schedule` refuses one that cannot be
 * parsed), so an unparseable rule here means a row written by an older build or
 * repaired by hand. It expands to the single occurrence at `startAt` rather
 * than to nothing: a meeting the member can see and fix beats a meeting that
 * vanished.
 */
export function expandOccurrences(
  item: Repeating,
  from: Date,
  to: Date,
  zone: string,
): Occurrence[] {
  const digits = item.lockTimezone ?? item.authoredTimezone;
  const timezone = item.lockTimezone ?? zone;

  if (!item.recurrence) {
    /*
     * A one-off follows the same rule as a series, deliberately.
     *
     * Its single occurrence is re-read in the member's current zone, so a
     * meeting written as 10:00 in Cairo is 10:00 in Berlin once they land —
     * unless it is pinned, which is what pinning is for. One rule rather than
     * two: a one-off that behaved differently from a series of one would be a
     * distinction the member cannot see in the editor and cannot predict.
     */
    const startAt = reread(item.startAt, digits, timezone) ?? item.startAt;
    const single = occurrenceOf(item, startAt, startAt, null);
    return withinWindow([single], from, to);
  }

  const rule = parseRule(item.recurrence, digits);
  const overrides = overridesByKey(item.recurrence.overrides);

  /*
   * The window is widened before the rule is asked, and narrowed after.
   *
   * Two reasons, and both are occurrences the naive window would lose. An
   * occurrence that *starts* before `from` and runs into the window is part of
   * the day the caller asked about — a meeting from 09:30 to 10:30 belongs on
   * an agenda for 10:00 onwards. And an override may have moved an occurrence
   * *into* the window from a rule date outside it, which `expandedFor` handles
   * below by scanning a wider band of rule dates rather than by guessing how
   * far an override could have travelled.
   *
   * A day either side is enough for the first and is a deliberate bound on the
   * second: an override that moved an occurrence more than a day is found
   * through `orphansIntoWindow`, which reads the override list directly and so
   * has no bound at all.
   */
  const scanFrom = new Date(from.getTime() - DAY_MS);
  const scanTo = new Date(to.getTime() + DAY_MS);

  const items: Occurrence[] = [];
  const ruleDates = rule
    ? rule
        .between(toFloating(scanFrom, timezone), toFloating(scanTo, timezone), true)
        .map((floating: Date) => fromFloating(floating, timezone))
        .filter((instant: Date | null): instant is Date => instant !== null)
    : [item.startAt];

  for (const originalStart of ruleDates) {
    if (isExcluded(item.recurrence.exdates, originalStart)) continue;
    const override = overrides.get(key(originalStart));
    items.push(occurrenceOf(item, originalStart, originalStart, override));
  }

  items.push(...orphansIntoWindow(item, ruleDates, from, to));

  return withinWindow(items, from, to).sort(
    (left, right) => left.startAt.getTime() - right.startAt.getTime(),
  );
}

/**
 * Overrides whose rule date the scan above did not reach, but whose moved
 * moment lands in the window.
 *
 * The case is a member who dragged next Tuesday's meeting into the following
 * month. The rule still generates next Tuesday, so the override is not orphaned
 * from the *series* — it is orphaned from this *window*, and a month view of
 * the following month would show nothing at all without this pass. It reads the
 * override list rather than widening the scan because there is no distance an
 * override cannot have travelled, and a scan wide enough for the worst case
 * would be a scan of the whole series on every read.
 */
function orphansIntoWindow(
  item: Repeating,
  ruleDates: Date[],
  from: Date,
  to: Date,
): Occurrence[] {
  const seen = new Set(ruleDates.map(key));
  const found: Occurrence[] = [];

  for (const override of item.recurrence?.overrides ?? []) {
    if (seen.has(key(override.originalStart))) continue;
    const startAt = override.startAt ?? override.originalStart;
    if (startAt.getTime() < from.getTime() || startAt.getTime() > to.getTime()) {
      continue;
    }
    // An excluded rule date whose override moved it here: the move wins, which
    // is the rule `Meeting.moveOccurrence` enforces by clearing the exdate. A
    // row written before that rule existed is read the same way rather than
    // being shown twice or not at all.
    found.push(occurrenceOf(item, override.originalStart, startAt, override));
  }

  return found;
}

/** The next occurrence at or after `at`, or null when the series has run out. */
export function nextOccurrenceAfter(
  item: Repeating,
  at: Date,
  zone: string,
  horizonDays = 400,
): Date | null {
  const to = new Date(at.getTime() + horizonDays * DAY_MS);
  const found = expandOccurrences(item, at, to, zone);
  return found[0]?.startAt ?? null;
}

/**
 * The rule with one occurrence removed (FR-005).
 *
 * Returns a new recurrence rather than mutating, because whether to keep it is
 * the aggregate's decision — skipping an occurrence is an event, not a side
 * effect of asking a question. The override for that date goes too: an
 * occurrence that is not happening has nothing left to say about its own title.
 */
export function skipInRule(
  recurrence: MeetingRecurrence,
  originalStart: Date,
): MeetingRecurrence {
  if (isExcluded(recurrence.exdates, originalStart)) return recurrence;
  return {
    ...recurrence,
    exdates: [...recurrence.exdates, originalStart],
    overrides: recurrence.overrides.filter(
      (override) => key(override.originalStart) !== key(originalStart),
    ),
  };
}

/**
 * The rule with one occurrence moved (FR-005).
 *
 * **Moving onto a skipped date clears the skip** — the spec's edge case, and it
 * is enforced here rather than in the handler so the sync adapter and the REST
 * command cannot disagree about it. A member who skipped Tuesday and then
 * dragged another occurrence onto Tuesday means Tuesday to happen; leaving the
 * exdate would silently discard the drag.
 */
export function moveInRule(
  recurrence: MeetingRecurrence,
  originalStart: Date,
  patch: Omit<OccurrenceOverride, 'originalStart'>,
): MeetingRecurrence {
  const existing = recurrence.overrides.find(
    (override) => key(override.originalStart) === key(originalStart),
  );
  const merged: OccurrenceOverride = {
    ...(existing ?? { originalStart }),
    ...patch,
    originalStart,
  };

  return {
    ...recurrence,
    /*
     * The exclusion on the occurrence **being moved** is cleared, and no other.
     *
     * This is the spec's edge case — "an occurrence moved onto a date that is
     * already skipped: the move wins and the skip is cleared" — read against
     * the model that is actually stored, which took one wrong turn to find.
     *
     * Exceptions here are keyed by `originalStart`, the moment the rule
     * produced, and the expander filters *rule dates* through `exdates` before
     * it applies overrides. So moving occurrence A onto occurrence B's instant
     * needs nothing done about B's exdate: A's override is keyed by A, B's
     * exclusion is keyed by B, and the move already wins. Clearing the
     * *destination* instead — which is what this did first — resurrects B, so a
     * member who skipped Tuesday and then dragged another meeting onto Tuesday
     * ended up with two meetings and the one they had cancelled back.
     *
     * The case that genuinely needs clearing is skipping A and then moving A:
     * without this, the rule date is excluded, the override keyed to it is
     * never reached, and the member's drag silently does nothing. Skipping and
     * moving are the member's two ways of dealing with one date (FR-005), so
     * the second overrides the first.
     */
    exdates: recurrence.exdates.filter(
      (exdate) => key(exdate) !== key(originalStart),
    ),
    overrides: [
      ...recurrence.overrides.filter(
        (override) => key(override.originalStart) !== key(originalStart),
      ),
      merged,
    ],
  };
}

/**
 * Overrides the *new* rule no longer generates.
 *
 * The spec's edge case: a series edited so that an already-moved occurrence
 * would fall outside the new rule warns the member before discarding it. This
 * answers "which ones", and the caller decides — `Meeting.edit` refuses the
 * patch unless it is forced, so the warning is a refusal the client can turn
 * into a dialog rather than a silent loss the member discovers weeks later.
 *
 * The horizon is the rule's own reach: an override is orphaned when the rule
 * does not produce its `originalStart` at all, so the search runs from the
 * earliest override to the latest and asks the rule about exactly that span.
 * A `COUNT`-limited rule that no longer reaches an override's date is the
 * ordinary way this happens — "every week, six times" shortened to three.
 */
export function orphanedOverrides(
  recurrence: MeetingRecurrence,
  digitsZone: string,
  expansionZone: string = digitsZone,
): OccurrenceOverride[] {
  if (recurrence.overrides.length === 0) return [];

  const rule = parseRule(recurrence, digitsZone);
  if (!rule) return [];

  const moments = recurrence.overrides.map((override) =>
    override.originalStart.getTime(),
  );
  const from = new Date(Math.min(...moments) - DAY_MS);
  const to = new Date(Math.max(...moments) + DAY_MS);

  const generated = new Set(
    rule
      .between(
        toFloating(from, expansionZone),
        toFloating(to, expansionZone),
        true,
      )
      .map((floating: Date) => fromFloating(floating, expansionZone))
      .filter((instant: Date | null): instant is Date => instant !== null)
      .map(key),
  );

  return recurrence.overrides.filter(
    (override) => !generated.has(key(override.originalStart)),
  );
}

/** True for a rule string `rrule` can read. The write refuses anything else. */
export function isReadableRule(
  recurrence: MeetingRecurrence,
  zone: string,
): boolean {
  return parseRule(recurrence, zone) !== null;
}

/** "every 2 weeks on Tuesday", for a confirmation line. English; see Planning. */
export function humanRule(
  recurrence: MeetingRecurrence,
  zone: string,
): string {
  const rule = parseRule(recurrence, zone);
  if (!rule) return recurrence.rrule;
  try {
    return rule.toText();
  } catch {
    return recurrence.rrule;
  }
}

// ------------------------------------------------------------------ internals

const DAY_MS = 86_400_000;

function parseRule(
  recurrence: MeetingRecurrence,
  timezone: string,
): ParsedRule | null {
  try {
    const parsed = rrulestr(
      recurrence.rrule.startsWith('RRULE:') ||
        recurrence.rrule.startsWith('DTSTART')
        ? recurrence.rrule
        : `RRULE:${recurrence.rrule}`,
      { dtstart: toFloating(recurrence.dtstart, timezone) },
    );
    // `rrulestr` also parses an RRULESET, which carries its own exception list
    // and its own semantics for it. This context stores exceptions in `exdates`
    // and applies them here, so a set arriving from outside would leave two
    // exception lists disagreeing about one series.
    if (!(parsed instanceof RRule)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function occurrenceOf(
  item: Repeating,
  originalStart: Date,
  ruleStart: Date,
  override: OccurrenceOverride | null | undefined,
): Occurrence {
  const startAt = override?.startAt ?? ruleStart;
  const durationMin = override?.durationMin ?? item.durationMin;
  return {
    originalStart,
    startAt,
    endAt: new Date(startAt.getTime() + durationMin * 60_000),
    durationMin,
    title: override?.title ?? item.title,
    location: override?.location ?? item.location,
    moved:
      override?.startAt !== undefined &&
      override?.startAt !== null &&
      override.startAt.getTime() !== originalStart.getTime(),
  };
}

/**
 * An occurrence is in the window when any part of it is.
 *
 * `startAt <= to && endAt >= from` rather than `startAt` alone, so a meeting
 * already under way when the window opens is on the agenda. A day view that
 * dropped it would show a member as free during a call they are on.
 */
function withinWindow(items: Occurrence[], from: Date, to: Date): Occurrence[] {
  return items.filter(
    (item) =>
      item.startAt.getTime() <= to.getTime() &&
      item.endAt.getTime() >= from.getTime(),
  );
}

function overridesByKey(
  overrides: OccurrenceOverride[],
): Map<number, OccurrenceOverride> {
  return new Map(overrides.map((override) => [key(override.originalStart), override]));
}

/**
 * Minute granularity, which is how an exdate and an override key are matched.
 *
 * Nothing here schedules to the second, and carrying a field no feature reads
 * would only be a place for two representations of one moment to disagree — a
 * client sending `10:00:00.000` and a stored `10:00:00.123` would otherwise
 * name different occurrences.
 */
function key(at: Date): number {
  return Math.floor(at.getTime() / 60_000);
}

function isExcluded(exdates: Date[], occurrence: Date): boolean {
  const target = key(occurrence);
  return exdates.some((exdate) => key(exdate) === target);
}

/**
 * The same wall clock, read on a different zone's clock.
 *
 * `2026-09-10T18:00` written in Cairo, re-read in Berlin, is a different
 * instant naming the same digits. That is the whole of FR-007's travel clause
 * for a non-repeating meeting, and it is one round trip through the floating
 * representation rather than any arithmetic on offsets — which is the form of
 * this that goes wrong across a clock change.
 *
 * Returns null only when the digits name an hour that does not exist in the
 * target zone, which `wallClockToUtc` resolves to the first instant after the
 * gap; the caller falls back to the stored instant rather than dropping the
 * meeting.
 */
function reread(instant: Date, from: string, to: string): Date | null {
  if (from === to) return instant;
  return fromFloating(toFloating(instant, from), to);
}

/** A Date whose UTC fields hold the member's wall clock. See `expandOccurrences`. */
function toFloating(instant: Date, timezone: string): Date {
  const date = localDate(instant, timezone);
  const time = localHhMm(instant, timezone);
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

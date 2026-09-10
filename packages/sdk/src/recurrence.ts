/**
 * A repeat rule, expanded into the occurrences a client has to draw.
 *
 * ## Why a client expands at all
 *
 * **Recurrence is a rule plus exceptions, never expanded rows.** The pull sends
 * `{ dtstart, rrule, exdates, overrides }` and one document, so a series of any
 * length costs the same to sync — which means the surface holding those rows is
 * the one that has to work out where they land. The extension's side panel does
 * exactly that: it draws the next seven days of meetings out of Dexie, and it
 * has to do it without asking the server (FR-010).
 *
 * ## Why this is not `rrule`
 *
 * The backend's `recurrence-expander.ts` uses the `rrule` package and this is a
 * deliberate hand-rolled subset of it, not an oversight. `rrule` is not
 * installed in this workspace outside the backend; adding it would change the
 * root lockfile, ship a CommonJS package into an extension bundle that is ESM
 * throughout (the backend carries a note about the interop dance that needs),
 * and buy a full RFC 5545 engine for a seven-day window. What the window needs
 * is `FREQ` daily/weekly/monthly/yearly with `INTERVAL`, `BYDAY`, `BYMONTHDAY`,
 * `COUNT` and `UNTIL` — which is what the repeat picker can produce.
 *
 * The safety valve is that **anything this parser cannot read degrades to the
 * series' single first occurrence** rather than to silence or to a guess: a
 * meeting the member can see and fix beats a meeting that vanished, and it is
 * the same fallback the server takes for a rule `rrule` itself refuses.
 *
 * Everything below that is not the parser — the two zones, the wall-clock
 * expansion, exdates matched to the minute, overrides keyed by `originalStart`,
 * orphan overrides, the window test — mirrors the server case for case, because
 * a panel that shows an occurrence the phone does not is worse than a panel
 * that shows none.
 */

/**
 * Where a meeting is. At least one half is always present — the server refuses
 * a meeting with neither — and both may be, because a room that is also dialled
 * into is one meeting rather than two.
 */
export interface MeetingLocation {
  onlineLink: string | null;
  address: string | null;
}

/**
 * One occurrence the member changed, keyed by the moment the *rule* produced.
 *
 * `originalStart` is the key and it never moves, which is what lets a later
 * edit to the series still find it and what makes moving the same occurrence
 * twice update one override instead of accumulating two. Every other field
 * means "unchanged" when absent.
 *
 * ISO strings, not `Date`s: this is the shape the pull sends. Typing it with
 * `Date` would type-check and then fail on the first `.getTime()` days later,
 * inside this file.
 */
export interface OccurrenceOverride {
  originalStart: string;
  startAt?: string | null;
  durationMin?: number | null;
  title?: string | null;
  location?: MeetingLocation | null;
}

/** A repeat, as stored and as pulled: a start, a rule, the skips, the moves. */
export interface MeetingRecurrence {
  dtstart: string;
  /** RFC 5545, without the `DTSTART` line — `dtstart` above carries it. */
  rrule: string;
  exdates: string[];
  overrides: OccurrenceOverride[];
}

/** What the expander produces. Derived on read, never stored. */
export interface Occurrence {
  /** The rule's own moment: the override key, and what a client sends back. */
  originalStart: string;
  /** Where it actually sits, after any override. */
  startAt: string;
  endAt: string;
  durationMin: number;
  title: string;
  location: MeetingLocation;
  /** True when an override moved it, so a list can mark it. */
  moved: boolean;
}

/** Everything the expander needs, from a meeting or from a personal event. */
export interface Repeating {
  title: string;
  startAt: string;
  durationMin: number;
  location: MeetingLocation;
  recurrence: MeetingRecurrence | null;
  /** The zone the series is pinned to, or null to follow the member. */
  lockTimezone: string | null;
  /** The zone whose clock the member was reading when they wrote this. */
  authoredTimezone: string;
}

/**
 * Occurrences inside a window, in the member's own wall clock.
 *
 * ## Wall time, not a fixed offset
 *
 * A rule has no notion of a zone: it steps calendar fields. Stepping a real
 * instant therefore makes every occurrence a fixed *UTC* offset from the first,
 * so a weekly 18:00 meeting in Cairo becomes 17:00 the week the clocks move.
 * The rule is evaluated on **floating** dates — a Date whose UTC fields hold
 * the member's wall clock — and each result is resolved back against the zone,
 * which knows what that zone's clock read on that day.
 *
 * ## Two zones, and they are not the same question
 *
 * **Which digits** — 18:00 — comes from `lockTimezone ?? authoredTimezone`: the
 * zone the series' wall clock was written in, which never changes. **Which
 * clock those digits are read on** comes from `lockTimezone ?? zone`, `zone`
 * being the member's own right now. So a pinned series keeps its instants when
 * the member flies, and an unpinned one keeps its digits and moves its
 * instants. Getting these two the same way round as the server is the whole
 * reason the panel and the phone agree.
 *
 * `zone` is required and has no default: reading the browser's own zone here is
 * the mistake that once shifted every extracted reminder by three hours, and a
 * laptop in a hotel is no more authoritative than a server in Frankfurt. The
 * caller passes the profile's zone.
 */
export function expandOccurrences(
  item: Repeating,
  from: Date,
  to: Date,
  zone: string,
): Occurrence[] {
  const digits = item.lockTimezone ?? item.authoredTimezone;
  const timezone = item.lockTimezone ?? zone;
  const startAt = new Date(item.startAt);

  if (!item.recurrence) {
    /*
     * A one-off follows the same rule as a series: its single occurrence is
     * re-read in the member's current zone, so a meeting written as 10:00 in
     * Cairo is 10:00 in Berlin once they land — unless it is pinned, which is
     * what pinning is for.
     */
    const single = reread(startAt, digits, timezone) ?? startAt;
    return withinWindow([occurrenceOf(item, single, single, null)], from, to);
  }

  const recurrence = item.recurrence;
  const rule = parseRule(recurrence.rrule);

  /*
   * The window is widened before the rule is asked, and narrowed after.
   *
   * An occurrence that *starts* before `from` and runs into the window is part
   * of the day the caller asked about — a meeting from 09:30 to 10:30 belongs
   * on a list that begins at 10:00. A day either side is a deliberate bound; an
   * override that moved an occurrence further than that is found through
   * `orphansIntoWindow`, which reads the override list directly and so has no
   * bound at all.
   */
  const scanFrom = new Date(from.getTime() - DAY_MS);
  const scanTo = new Date(to.getTime() + DAY_MS);

  const ruleDates = rule
    ? generate(
        rule,
        // `?? item.startAt` is a runtime guard and not a type one: the field is
        // required and the server always fills it, and a JSON payload crosses
        // the boundary as `unknown` all the same. `new Date(undefined)` is an
        // invalid date and `new Date(null)` is 1970 — either would expand the
        // whole series onto the wrong dates rather than fail.
        toFloating(new Date(recurrence.dtstart ?? item.startAt), digits),
        toFloating(scanFrom, timezone),
        toFloating(scanTo, timezone),
      )
        .map((floating) => fromFloating(floating, timezone))
        .filter((instant): instant is Date => instant !== null)
    : // A rule nothing here can read still shows its first occurrence, exactly
      // as the server does for a rule `rrule` refuses. The stored instant, not
      // a re-read one, so the two agree field for field.
      [startAt];

  const overrides = overridesByKey(recurrence.overrides ?? []);
  const items: Occurrence[] = [];

  for (const originalStart of ruleDates) {
    if (isExcluded(recurrence.exdates ?? [], originalStart)) continue;
    items.push(
      occurrenceOf(
        item,
        originalStart,
        originalStart,
        overrides.get(key(originalStart)),
      ),
    );
  }

  items.push(...orphansIntoWindow(item, ruleDates, from, to));

  return withinWindow(items, from, to).sort(
    (left, right) =>
      new Date(left.startAt).getTime() - new Date(right.startAt).getTime(),
  );
}

/**
 * Overrides whose rule date the scan did not reach, but whose moved moment
 * lands in the window.
 *
 * The case is a member who dragged next Tuesday's meeting into the following
 * month. The rule still generates next Tuesday, so the override is not orphaned
 * from the *series* — it is orphaned from this *window*, and a list of the
 * following week would show nothing at all without this pass. It reads the
 * override list rather than widening the scan because there is no distance an
 * override cannot have travelled.
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
    const originalStart = new Date(override.originalStart);
    if (seen.has(key(originalStart))) continue;
    const startAt = override.startAt
      ? new Date(override.startAt)
      : originalStart;
    if (startAt.getTime() < from.getTime() || startAt.getTime() > to.getTime())
      continue;
    // An excluded rule date whose override moved it here: the move wins, which
    // is the rule the server enforces by clearing the exdate on a move.
    found.push(occurrenceOf(item, originalStart, startAt, override));
  }

  return found;
}

/**
 * Turns a wall-clock time written without a zone ("2026-09-11T15:00") into the
 * instant it names in `timeZone`.
 *
 * Exported because a form is the other half of this file's problem: an
 * `<input type="datetime-local">` hands back wall-clock digits with no zone at
 * all, and `new Date(thoseDigits)` resolves them against the *browser's* zone.
 * A member whose profile says Cairo, filling that form from a laptop in Berlin,
 * would place the meeting an hour out — silently, and only for the trips where
 * it matters.
 *
 * Returns null for anything unparseable, which the caller treats as "no time".
 */
export function wallClockToUtc(
  wallClock: string,
  timeZone: string,
): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(
    wallClock.trim(),
  );
  if (!match) return null;

  const [, y, mo, d, h, mi, s] = match;
  const naiveUtcMs = Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, s ? +s : 0);
  if (Number.isNaN(naiveUtcMs)) return null;

  // Guess using the offset at the naive instant, then correct once: near a
  // clock change the offset before and after the guess differ, and the second
  // pass is what lands on the right side of it.
  const first =
    naiveUtcMs -
    (wallClockAsUtcMs(new Date(naiveUtcMs), timeZone) - naiveUtcMs);
  const drift = wallClockAsUtcMs(new Date(first), timeZone) - naiveUtcMs;
  if (drift === 0) return new Date(first);

  const corrected = first - drift;
  if (wallClockAsUtcMs(new Date(corrected), timeZone) === naiveUtcMs)
    return new Date(corrected);

  /*
   * Neither pass reads back as the time asked for, which means it never
   * happens: the hour a spring-forward skips. The occurrence belongs *after*
   * the gap, not before it — a 02:30 meeting must not become 01:30, which is
   * the one direction a time may never move.
   *
   * Which candidate lands after the gap depends on the sign of the zone's
   * offset, so both are asked rather than one assumed: this is the server's own
   * correction, and the version that assumed `first` was right for zones behind
   * UTC and wrong for every zone ahead of it — including Africa/Cairo, which is
   * this installation's default.
   */
  const afterTheGap = [first, corrected]
    .filter(
      (candidate) =>
        wallClockAsUtcMs(new Date(candidate), timeZone) > naiveUtcMs,
    )
    .sort((left, right) => left - right);

  return new Date(afterTheGap[0] ?? first);
}

// ------------------------------------------------------------------ internals

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/**
 * A hard bound on how many periods one series is stepped through.
 *
 * ponytail: the loop starts at `dtstart` rather than seeking to the window,
 * because `COUNT` is an occurrence *index* and seeking would mean deriving that
 * index arithmetically per frequency — with `BYMONTHDAY=31` skipping months, it
 * is not `k`. 20 000 steps is ~54 years of a daily series of trivial integer
 * arithmetic; if a surface ever holds enough series for that to show up in a
 * render, the upgrade is to seek when `COUNT` is absent and only walk when it
 * is present.
 */
const STEP_CAP = 20_000;

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/**
 * The parts of RFC 5545 the repeat picker can produce. Anything else makes
 * `parseRule` answer null, and the series degrades to its first occurrence.
 */
const KNOWN_PARTS = new Set([
  'FREQ',
  'INTERVAL',
  'COUNT',
  'UNTIL',
  'BYDAY',
  'BYMONTHDAY',
  'WKST',
]);

type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

interface ParsedRule {
  freq: Frequency;
  interval: number;
  count: number | null;
  /** Compared against the *floating* candidate, as the server's library does. */
  until: number | null;
  /** Days of the week as `Date#getUTCDay` numbers, or null for "dtstart's". */
  byday: number[] | null;
  /** Negative counts back from the end of the month: -1 is the last day. */
  bymonthday: number | null;
}

/**
 * The rule string, or null for one this subset cannot read.
 *
 * Null is not a failure path to be minimised — it is the documented degradation
 * (the caller shows the first occurrence), so an unrecognised part answers null
 * rather than being ignored. Ignoring `BYSETPOS` would draw "the last Friday of
 * the month" as *every* Friday, which is a wrong calendar rather than a thin
 * one.
 */
function parseRule(rrule: string): ParsedRule | null {
  const parts = new Map<string, string>();
  for (const chunk of rrule.replace(/^RRULE:/i, '').trim().split(';')) {
    if (!chunk) continue;
    const eq = chunk.indexOf('=');
    if (eq <= 0) return null;
    const name = chunk.slice(0, eq).trim().toUpperCase();
    if (!KNOWN_PARTS.has(name)) return null;
    parts.set(name, chunk.slice(eq + 1).trim().toUpperCase());
  }

  const freq = parts.get('FREQ');
  if (
    freq !== 'DAILY' &&
    freq !== 'WEEKLY' &&
    freq !== 'MONTHLY' &&
    freq !== 'YEARLY'
  )
    return null;

  const interval = parts.has('INTERVAL') ? Number(parts.get('INTERVAL')) : 1;
  if (!Number.isInteger(interval) || interval < 1) return null;

  // WKST decides which weeks an interval lands on, and only for a weekly rule
  // stepping more than one week at a time. `MO` is the default every producer
  // here writes and the only one this file anchors to; a different one with a
  // real interval would silently shift every other week.
  const wkst = parts.get('WKST');
  if (wkst !== undefined && wkst !== 'MO' && interval > 1) return null;

  let count: number | null = null;
  if (parts.has('COUNT')) {
    count = Number(parts.get('COUNT'));
    if (!Number.isInteger(count) || count < 1) return null;
  }

  let until: number | null = null;
  if (parts.has('UNTIL')) {
    until = parseUntil(parts.get('UNTIL')!);
    if (until === null) return null;
  }

  let byday: number[] | null = null;
  if (parts.has('BYDAY')) {
    // Weekly only. On a monthly rule `BYDAY` means "the second Tuesday", which
    // needs an ordinal this parser does not carry — so it degrades instead.
    if (freq !== 'WEEKLY') return null;
    byday = [];
    for (const token of parts.get('BYDAY')!.split(',')) {
      const day = WEEKDAYS.indexOf(token.trim());
      if (day < 0) return null;
      byday.push(day);
    }
    if (!byday.length) return null;
  }

  let bymonthday: number | null = null;
  if (parts.has('BYMONTHDAY')) {
    if (freq !== 'MONTHLY') return null;
    const raw = parts.get('BYMONTHDAY')!;
    // One value only: a list would need the occurrences interleaved in date
    // order, and the picker writes one day.
    if (raw.includes(',')) return null;
    bymonthday = Number(raw);
    if (
      !Number.isInteger(bymonthday) ||
      bymonthday === 0 ||
      bymonthday > 31 ||
      bymonthday < -31
    )
      return null;
  }

  return { freq, interval, count, until, byday, bymonthday };
}

/** `UNTIL` as RFC 5545 writes it: `20261231T235959Z`, or a bare date. */
function parseUntil(value: string): number | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(
    value,
  );
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  // A bare date means the whole of that day is still in the series.
  const ms = Date.UTC(
    +y!,
    +mo! - 1,
    +d!,
    h ? +h : 23,
    mi ? +mi : 59,
    s ? +s : 59,
  );
  return Number.isNaN(ms) ? null : ms;
}

/**
 * The rule's floating dates that fall in the scan window, in order.
 *
 * Floating throughout: a Date whose UTC fields hold the member's wall clock, so
 * stepping is plain integer arithmetic with no zone in it. `COUNT` is why the
 * walk starts at `dtstart` and not at the window — see `STEP_CAP`.
 */
function generate(
  rule: ParsedRule,
  dtstart: Date,
  scanFrom: Date,
  scanTo: Date,
): Date[] {
  const year = dtstart.getUTCFullYear();
  const month = dtstart.getUTCMonth();
  const day = dtstart.getUTCDate();
  const timeOfDay =
    dtstart.getUTCHours() * 3_600_000 + dtstart.getUTCMinutes() * MINUTE_MS;

  const dtstartMs = dtstart.getTime();
  const fromMs = scanFrom.getTime();
  const toMs = scanTo.getTime();

  const found: Date[] = [];
  let emitted = 0;
  let steps = 0;

  /**
   * One generated occurrence. Answers false when the series is over, so the
   * caller stops: `COUNT` and `UNTIL` are both counted against every occurrence
   * the rule produces, whether or not the window wanted it.
   */
  const take = (candidate: number): boolean => {
    if (candidate < dtstartMs) return true;
    if (rule.until !== null && candidate > rule.until) return false;
    if (rule.count !== null && emitted >= rule.count) return false;
    emitted += 1;
    if (candidate >= fromMs && candidate <= toMs) found.push(new Date(candidate));
    return true;
  };

  if (rule.freq === 'DAILY') {
    const start = Date.UTC(year, month, day) + timeOfDay;
    for (let k = 0; steps < STEP_CAP; k += 1, steps += 1) {
      const candidate = start + k * rule.interval * DAY_MS;
      if (candidate > toMs) break;
      if (!take(candidate)) break;
    }
    return found;
  }

  if (rule.freq === 'WEEKLY') {
    const days = [...(rule.byday ?? [dtstart.getUTCDay()])]
      // Monday-relative and sorted, so the occurrences of one week come out in
      // date order — which `COUNT` depends on.
      .map((weekday) => (weekday + 6) % 7)
      .sort((left, right) => left - right);
    // The Monday of dtstart's own week is the anchor every interval steps from.
    const monday =
      Date.UTC(year, month, day) - ((dtstart.getUTCDay() + 6) % 7) * DAY_MS;

    for (let week = 0; steps < STEP_CAP; week += 1) {
      const weekStart = monday + week * rule.interval * 7 * DAY_MS;
      if (weekStart > toMs) break;
      let live = true;
      for (const offset of days) {
        steps += 1;
        if (!take(weekStart + offset * DAY_MS + timeOfDay)) {
          live = false;
          break;
        }
      }
      if (!live) break;
    }
    return found;
  }

  if (rule.freq === 'MONTHLY') {
    for (let k = 0; steps < STEP_CAP; k += 1, steps += 1) {
      const absolute = month + k * rule.interval;
      const y = year + Math.floor(absolute / 12);
      const m = ((absolute % 12) + 12) % 12;
      if (Date.UTC(y, m, 1) > toMs) break;

      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const wanted = rule.bymonthday ?? day;
      const resolved = wanted < 0 ? last + 1 + wanted : wanted;
      /*
       * A month that has no such day is **skipped**, and it costs no `COUNT`.
       * `BYMONTHDAY=31` is RFC 5545 for "the 31st", and the 31st does not exist
       * in February — the standard's answer is that February has no occurrence,
       * which is also the right answer for "pay the rent on the 31st".
       * `BYMONTHDAY=-1` is "the last day" and lands on the 28th or 29th. The
       * choice belongs to the editor, in the member's words, never to a guess
       * from the start date.
       */
      if (resolved < 1 || resolved > last) continue;
      if (!take(Date.UTC(y, m, resolved) + timeOfDay)) break;
    }
    return found;
  }

  for (let k = 0; steps < STEP_CAP; k += 1, steps += 1) {
    const y = year + k * rule.interval;
    if (Date.UTC(y, 0, 1) > toMs) break;
    // 29 February in a common year is skipped, for the same reason as the 31st.
    const last = new Date(Date.UTC(y, month + 1, 0)).getUTCDate();
    if (day > last) continue;
    if (!take(Date.UTC(y, month, day) + timeOfDay)) break;
  }
  return found;
}

function occurrenceOf(
  item: Repeating,
  originalStart: Date,
  ruleStart: Date,
  override: OccurrenceOverride | null | undefined,
): Occurrence {
  const startAt = override?.startAt ? new Date(override.startAt) : ruleStart;
  const durationMin = override?.durationMin ?? item.durationMin;
  return {
    originalStart: originalStart.toISOString(),
    startAt: startAt.toISOString(),
    endAt: new Date(startAt.getTime() + durationMin * MINUTE_MS).toISOString(),
    durationMin,
    title: override?.title ?? item.title,
    location: override?.location ?? item.location,
    moved:
      Boolean(override?.startAt) &&
      startAt.getTime() !== originalStart.getTime(),
  };
}

/**
 * An occurrence is in the window when any part of it is.
 *
 * `startAt <= to && endAt >= from` rather than `startAt` alone, so a meeting
 * already under way when the window opens is on the list. Dropping it would
 * show a member as free during a call they are on.
 */
function withinWindow(items: Occurrence[], from: Date, to: Date): Occurrence[] {
  return items.filter((item) => {
    const startAt = new Date(item.startAt).getTime();
    const endAt = new Date(item.endAt).getTime();
    return startAt <= to.getTime() && endAt >= from.getTime();
  });
}

function overridesByKey(
  overrides: OccurrenceOverride[],
): Map<number, OccurrenceOverride> {
  return new Map(
    overrides.map((override) => [key(new Date(override.originalStart)), override]),
  );
}

/**
 * Minute granularity, which is how an exdate and an override key are matched.
 *
 * Nothing here schedules to the second, and a finer key would only be a place
 * for two representations of one moment to disagree — a client sending
 * `10:00:00.000` and a stored `10:00:00.123` would otherwise name different
 * occurrences. The server matches to the minute for the same reason, and the
 * two must match the same way or one of them shows an occurrence the other has
 * skipped.
 */
function key(at: Date): number {
  return Math.floor(at.getTime() / MINUTE_MS);
}

function isExcluded(exdates: string[], occurrence: Date): boolean {
  const target = key(occurrence);
  return exdates.some((exdate) => key(new Date(exdate)) === target);
}

/**
 * The same wall clock, read on a different zone's clock.
 *
 * `2026-09-10T18:00` written in Cairo, re-read in Berlin, is a different
 * instant naming the same digits — one round trip through the floating
 * representation rather than any arithmetic on offsets, which is the form of
 * this that goes wrong across a clock change.
 */
function reread(instant: Date, from: string, to: string): Date | null {
  if (from === to) return instant;
  return fromFloating(toFloating(instant, from), to);
}

/** A Date whose UTC fields hold the member's wall clock, to the minute. */
function toFloating(instant: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant);

  const get = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  // `hour12: false` still formats midnight as 24 in some ICU versions.
  return new Date(
    Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute')),
  );
}

/**
 * The inverse. A floating Date's UTC fields are read as a wall clock and
 * resolved against the zone, so an occurrence landing in a daylight-saving gap
 * comes back as the first instant after it rather than as an hour that never
 * happened.
 */
function fromFloating(floating: Date, timeZone: string): Date | null {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const wallClock =
    `${floating.getUTCFullYear()}-${pad(floating.getUTCMonth() + 1)}-` +
    `${pad(floating.getUTCDate())}T${pad(floating.getUTCHours())}:` +
    `${pad(floating.getUTCMinutes())}`;
  return wallClockToUtc(wallClock, timeZone);
}

/** What a zone's clock read, as a UTC-shaped timestamp, for a given instant. */
function wallClockAsUtcMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant);

  const get = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
}

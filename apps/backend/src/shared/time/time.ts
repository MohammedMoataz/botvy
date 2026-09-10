/**
 * Timezone helpers. Every user-facing time in Botvy is a wall-clock time in
 * the user's own zone: reminders are extracted against it, confirmations are
 * rendered in it, coaching days are counted in it. The API's own TZ is
 * never consulted — reading `process.env.TZ` is what silently shifted every
 * natural-language reminder by the user's UTC offset.
 *
 * Ported unchanged from v1 (`legacy/apps/gateway/src/common/time.ts`) with its
 * spec, plus `localHhMm`, which the per-member rhythm tick needs to ask "what
 * does this member's clock read right now".
 */

/**
 * Used when a user has no timezone on their profile yet. Overridable at
 * runtime through the `defaults.timezone` setting.
 */
export const DEFAULT_TIMEZONE = 'Africa/Cairo';

/** Calendar date in a given IANA timezone, as YYYY-MM-DD. */
export function localDate(at: Date, timezone: string): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the storage format.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/**
 * Wall-clock time in a zone as `HH:mm`, the same shape the rhythm preferences
 * are stored in, so a tick can compare the two as strings without arithmetic.
 */
export function localHhMm(at: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  // hourCycle h23 still formats midnight as 24 in some ICU versions.
  const hour = String(Number(get('hour')) % 24).padStart(2, '0');
  return `${hour}:${get('minute')}`;
}

/** Human-readable wall-clock time in a user's zone, e.g. "Tue 2 Sep, 20:00". */
export function formatInTz(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
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

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  // hourCycle h23 still formats midnight as 24 in some ICU versions.
  const hour = get('hour') % 24;
  return Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second'),
  );
}

/**
 * Turns a wall-clock time written without a zone ("2026-09-02T18:00") into the
 * instant it names in `timeZone`.
 *
 * The model is asked for local wall-clock rather than UTC on purpose: a small
 * model gets "tomorrow at 6pm" right and the UTC arithmetic wrong, landing
 * reminders hours off and occasionally on the wrong day. Converting is
 * deterministic, so code does it.
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

  // Guess using the offset at the naive instant, then correct once: near a DST
  // change the offset before and after the guess differ, and the second pass is
  // what lands on the right side of it.
  const first =
    naiveUtcMs -
    (wallClockAsUtcMs(new Date(naiveUtcMs), timeZone) - naiveUtcMs);
  const drift = wallClockAsUtcMs(new Date(first), timeZone) - naiveUtcMs;
  if (drift === 0) return new Date(first);

  const corrected = first - drift;
  if (wallClockAsUtcMs(new Date(corrected), timeZone) === naiveUtcMs)
    return new Date(corrected);

  // Neither pass reads back as the time asked for, which means it never
  // happens: the hour skipped by a spring-forward. A reminder for 02:30 on
  // that morning should fire once the clocks have moved, not read back as
  // 01:30 — the member asked for the small hours and would be woken an hour
  // early, which is the one direction a reminder must never move.
  //
  // Which of the two candidates lands after the gap depends on the sign of the
  // zone's offset, and this used to return `first` unconditionally. That is
  // right for a zone behind UTC and wrong for one ahead of it: in New York
  // `first` reads back as 03:30 and in Berlin as 01:30, so the spec — written
  // against New York — passed while every eastern zone got the hour before the
  // gap. `Africa/Cairo` is a zone ahead of UTC and it is this installation's
  // default, and it has observed daylight saving again since 2023, so the
  // broken half was the half that mattered.
  //
  // So ask both candidates rather than assuming: the one whose read-back is
  // *later* than the wall clock asked for is the one on the far side of the
  // gap, and if both are, the earlier instant is the first one after it.
  const afterTheGap = [first, corrected]
    .filter(
      (candidate) =>
        wallClockAsUtcMs(new Date(candidate), timeZone) > naiveUtcMs,
    )
    .sort((a, b) => a - b);

  return new Date(afterTheGap[0] ?? first);
}

/** True for a string Intl accepts as an IANA zone — rejects "Cairo", "GMT+2". */
export function isValidTimezone(timezone: string): boolean {
  try {
    // Called without `new` on purpose: Intl returns an instance either way, and
    // constructing purely for the throw reads as a mistake to every linter.
    Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

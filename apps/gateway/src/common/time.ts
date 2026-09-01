/**
 * Timezone helpers. Every user-facing time in Botvy is a wall-clock time in
 * the user's own zone: reminders are extracted against it, confirmations are
 * rendered in it, coaching days are counted in it. The gateway's own TZ is
 * never consulted — reading `process.env.TZ` is what silently shifted every
 * natural-language reminder by the user's UTC offset.
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

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // hourCycle h23 still formats midnight as 24 in some ICU versions.
  const hour = get('hour') % 24;
  return Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
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
export function wallClockToUtc(wallClock: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(wallClock.trim());
  if (!match) return null;

  const [, y, mo, d, h, mi, s] = match;
  const naiveUtcMs = Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0);
  if (Number.isNaN(naiveUtcMs)) return null;

  // Guess using the offset at the naive instant, then correct once: near a DST
  // change the offset before and after the guess differ, and the second pass is
  // what lands on the right side of it.
  let guess = naiveUtcMs - (wallClockAsUtcMs(new Date(naiveUtcMs), timeZone) - naiveUtcMs);
  const drift = wallClockAsUtcMs(new Date(guess), timeZone) - naiveUtcMs;
  if (drift !== 0) guess -= drift;

  return new Date(guess);
}

/** True for a string Intl accepts as an IANA zone — rejects "Cairo", "GMT+2". */
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

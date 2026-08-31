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

/** True for a string Intl accepts as an IANA zone — rejects "Cairo", "GMT+2". */
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

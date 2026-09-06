/**
 * Fields whose value must never reach a log line. The release phase scans a
 * sampled day of logs for leaked material; that scan is far easier to pass if
 * nothing was written in the first place.
 */
const SECRET_KEYS = new Set([
  'password',
  'passwordconfirm',
  'passwordhash',
  'token',
  'tokenhash',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'setcookie',
  'secret',
  'apikey',
  'pushtoken',
  'fcmtoken',
  'signature',
  'credentials',
]);

export const REDACTED = '[redacted]';

/**
 * Replaces secret-looking values, in place of dropping the whole object: a log
 * line that says a password field was present and redacted is more useful than
 * one that silently omits it, because the first tells you the shape of what
 * arrived.
 */
export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;

  // A request object can hold a cycle; recursing into one would never return.
  if (seen.has(value as object)) return '[circular]';
  seen.add(value as object);

  if (Array.isArray(value)) return value.map((item) => redact(item, seen));

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEYS.has(key.toLowerCase().replace(/[-_]/g, ''))
      ? REDACTED
      : redact(item, seen);
  }
  return out;
}

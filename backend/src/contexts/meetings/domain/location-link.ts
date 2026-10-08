/**
 * Whether a location string is a link, and whether it is one we may hand a
 * client as one (032, FR-001/FR-002).
 *
 * Meetings' own copy, not the chat executor's `linkish`: that one lives in
 * another context and only has to sort a model's output into two fields. This
 * one decides what a phone opens and what the extension renders as an `href`,
 * so it also has to recognise a scheme with no `//` — `javascript:alert(1)` is
 * exactly the string that must not reach an `href`. The Dart and the extension
 * copies mirror it, because it crosses a language boundary.
 */

/** Schemes that execute or read locally; link-shaped however they are written. */
const HOSTILE = /^\s*(?:javascript|vbscript|data|file|blob|about)\s*:/i;
/**
 * `scheme:` with no dot in the scheme, so `example.com:8080/x` is a host and
 * not the scheme `example.com`.
 */
const SCHEME = /^([a-z][a-z0-9+-]*):/i;

/** The scheme a value names, lower-cased, or null for a scheme-less value. */
export function schemeOf(value: string): string | null {
  const hostile = HOSTILE.exec(value);
  if (hostile) return hostile[0].replace(/[\s:]/g, '').toLowerCase();
  const match = SCHEME.exec(value);
  if (!match) return null;
  /*
   * "Office: 3rd floor" is an address with a colon, not the scheme `office`.
   * A real link has no whitespace, and a `//` after the colon is a link
   * whatever follows it.
   */
  if (/\s/.test(value) && !value.startsWith(`${match[1]}://`)) return null;
  return match[1]!.toLowerCase();
}

/** A scheme, a `www.`, or `host.tld` followed by a path or nothing. */
export function isLinkShaped(raw: string): boolean {
  const value = raw.trim();
  return (
    schemeOf(value) !== null ||
    /^www\./i.test(value) ||
    /^[^\s/:]+\.[a-z]{2,}(\/\S*)?$/i.test(value)
  );
}

/**
 * Null when the value may be stored, or the scheme that refuses it.
 *
 * A scheme-less link (`www.example.com`, `zoom.us/j/1`) is accepted: every
 * client prefixes `https://`, which is the only scheme it could have meant.
 */
export function refusedScheme(raw: string): string | null {
  const scheme = schemeOf(raw.trim());
  if (scheme === null || scheme === 'http' || scheme === 'https') return null;
  return scheme;
}

/** The URL a link-shaped value opens, `https://` added when it has no scheme. */
export function linkUrlOf(raw: string): string | null {
  const value = raw.trim();
  if (!isLinkShaped(value)) return null;
  const scheme = schemeOf(value);
  if (scheme === null) return `https://${value}`;
  return scheme === 'http' || scheme === 'https' ? value : null;
}

/**
 * Whether a meeting's location string is a link, and the `href` it may have
 * (032, FR-002).
 *
 * Mirrors `backend/src/contexts/meetings/domain/location-link.ts`, which
 * refuses anything but `http(s)` at the write. Checked here as well, because a
 * row synced before that rule could still hold `javascript:` and this is the
 * surface that renders it as an `href`.
 */

const HOSTILE = /^\s*(?:javascript|vbscript|data|file|blob|about)\s*:/i;
const SCHEME = /^([a-z][a-z0-9+-]*):/i;

function schemeOf(value: string): string | null {
  const hostile = HOSTILE.exec(value);
  if (hostile) return hostile[0].replace(/[\s:]/g, '').toLowerCase();
  const match = SCHEME.exec(value);
  if (!match) return null;
  // "Office: 3rd floor" is an address with a colon, not a scheme.
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

/** The `http(s)` URL a link-shaped value opens, or null. */
export function safeHref(raw: string): string | null {
  const value = raw.trim();
  if (!isLinkShaped(value)) return null;
  const scheme = schemeOf(value);
  if (scheme === null) return `https://${value}`;
  return scheme === 'http' || scheme === 'https' ? value : null;
}

/** OpenStreetMap's own page for a point, for the side panel's "View on map". */
export function osmLink(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}

export interface LinkPreview {
  title: string | null;
  siteName: string | null;
  image: string | null;
  place: { lat: number; lng: number } | null;
}

const LINK_PREVIEW = `query LinkPreview($url: String, $address: String) {
  linkPreview(url: $url, address: $address) {
    title
    siteName
    image
    place { lat lng }
  }
}`;

/**
 * The server's preview of a link or an address. Null for no preview — offline
 * or refused included, because the plain link is already on screen.
 */
export async function fetchLinkPreview(
  client: {
    query<T>(document: string, variables?: Record<string, unknown>): Promise<T>;
  },
  input: { url?: string | null; address?: string | null },
): Promise<LinkPreview | null> {
  try {
    const data = await client.query<{ linkPreview: LinkPreview | null }>(
      LINK_PREVIEW,
      { url: input.url ?? null, address: input.address ?? null },
    );
    const preview = data.linkPreview;
    if (!preview) return null;
    // The image is the far end's choice, so it gets the same test as a link.
    const image = preview.image ? safeHref(preview.image) : null;
    return { ...preview, image };
  } catch {
    return null;
  }
}

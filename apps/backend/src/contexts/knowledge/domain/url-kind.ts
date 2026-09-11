/**
 * What a member pasted, reduced to two answers: which URL this really is, and
 * what sort of thing it points at (FR-002, FR-005).
 *
 * Both answers are needed before anything is fetched, and both are *decisions*
 * rather than lookups — nothing here touches the network. That is deliberate:
 * `add-link` runs on the request path, and a member who pastes a link must be
 * told "saved" or "you already have that" immediately, not after a round trip
 * to somebody else's server.
 */

/** The four shapes the pipeline knows how to handle. */
export type LinkKind = 'article' | 'website' | 'video' | 'playlist';

/**
 * Query parameters that identify the *sharer* rather than the thing shared.
 *
 * Stripping them is what makes FR-005 true in practice: the same article
 * arriving from a newsletter, from a tweet and from a friend's message is three
 * different URLs and one piece of writing, and a member who saves it twice
 * should be told they already have it rather than made to read it twice.
 *
 * The list is deliberately short and deliberately conservative. Every entry
 * here is a parameter whose *only* documented job is attribution or tracking;
 * anything that might select content — `id`, `p`, `page`, `q` — stays, because
 * dropping a parameter that chooses what the page shows would silently
 * collapse two different articles into one entry and the member would never
 * find out why the second one never appeared.
 */
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'referrer',
  'source',
  'spm',
  'yclid',
  '_ga',
  '_gl',
]);

/** YouTube's own share noise: `si` is the share id, `t`/`start` a timestamp. */
const YOUTUBE_NOISE = new Set(['si', 't', 'start', 'feature', 'pp', 'ab_channel']);

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

/** The longest URL the store will hold. Anything beyond this is not a link. */
export const MAX_URL = 2_000;

export class LinkUrlError extends Error {
  constructor(
    readonly code: 'not_a_url' | 'refused_scheme' | 'too_long',
    message: string,
  ) {
    super(message);
    this.name = 'LinkUrlError';
  }
}

export interface NormalisedLink {
  /** The URL to fetch and to compare for duplicates. */
  url: string;
  kind: LinkKind;
  /** The video id, for a `video`; the list id, for a `playlist`; else null. */
  externalId: string | null;
}

/**
 * The member's URL, canonicalised, with its kind.
 *
 * ## Why one function rather than `normalise` and `detectKind`
 *
 * Because canonicalising a YouTube URL *is* recognising it. `youtu.be/abc`,
 * `youtube.com/shorts/abc` and `youtube.com/watch?v=abc&si=…` are one video, and
 * the only way to know they are is to know what a YouTube video URL looks like.
 * Two functions would each need that knowledge and could disagree about it —
 * which is the failure this codebase already records about lead times and quiet
 * hours: two readers of one rule eventually read it differently.
 */
export function normaliseLink(raw: string): NormalisedLink {
  const trimmed = raw.trim();
  if (trimmed.length > MAX_URL) {
    throw new LinkUrlError('too_long', `A link may be at most ${MAX_URL} characters.`);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new LinkUrlError('not_a_url', `"${trimmed}" is not a web address.`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new LinkUrlError(
      'refused_scheme',
      `Botvy reads http and https links; "${url.protocol}" is neither.`,
    );
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const youtube = describeYoutube(host, url);
  if (youtube) return youtube;

  // The fragment is a position inside a page, never a different page. Keeping
  // it would make "the article" and "the article, third heading" two entries.
  url.hash = '';
  url.hostname = host;
  // `https` is the canonical form for everything that offers it, and a member
  // who pasted `http` for a site that redirects would otherwise hold a second
  // entry for the same reading. The fetcher follows redirects either way.
  url.protocol = 'https:';
  stripParams(url, TRACKING_PARAMS);
  sortParams(url);
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path === '' ? '/' : path;

  return {
    url: url.toString(),
    // A bare origin is the site itself; anything with a path is a page on it.
    // A crude split, and the honest one: telling an article from a landing page
    // needs the page, and this runs before anything has been fetched. The
    // extractor corrects it once it has read the document.
    kind: url.pathname === '/' && url.search === '' ? 'website' : 'article',
    externalId: null,
  };
}

/**
 * YouTube's four shapes, collapsed to two.
 *
 * Returns null for a YouTube URL that is neither a video nor a playlist — a
 * channel page, a search — which then falls through to the ordinary path and is
 * read as a web page. That is the right outcome: a channel is a page, and
 * pretending it is a video would send the transcript reader after something
 * that does not exist.
 *
 * ## `watch?v=…&list=…` is a **video**
 *
 * That URL is what YouTube gives a member who clicked one video *while* a
 * playlist was open, so the thing they meant to save is the video they were
 * watching. Reading it as a playlist would expand fifty videos from one paste
 * and spend the member's daily quota on a list they never asked for. A member
 * who wants the playlist saves the playlist URL, which YouTube also gives them.
 */
function describeYoutube(host: string, url: URL): NormalisedLink | null {
  if (!YOUTUBE_HOSTS.has(host)) return null;

  const path = url.pathname.replace(/\/+$/, '');

  const videoId =
    host === 'youtu.be'
      ? path.slice(1)
      : path === '/watch'
        ? (url.searchParams.get('v') ?? '')
        : path.startsWith('/shorts/')
          ? path.slice('/shorts/'.length)
          : path.startsWith('/embed/')
            ? path.slice('/embed/'.length)
            : '';

  if (isYoutubeId(videoId)) {
    return {
      url: `https://www.youtube.com/watch?v=${videoId}`,
      kind: 'video',
      externalId: videoId,
    };
  }

  if (path === '/playlist') {
    const listId = url.searchParams.get('list') ?? '';
    if (isYoutubeId(listId)) {
      return {
        url: `https://www.youtube.com/playlist?list=${listId}`,
        kind: 'playlist',
        externalId: listId,
      };
    }
  }

  return null;
}

/**
 * YouTube ids are URL-safe base64-ish: letters, digits, `-` and `_`.
 *
 * Checked rather than assumed, because the id goes into a URL this system then
 * fetches. A path segment that is not an id is how `youtube.com/feed/history`
 * would otherwise become a request for a video called `history`.
 */
function isYoutubeId(value: string): boolean {
  return value.length > 0 && value.length <= 64 && /^[A-Za-z0-9_-]+$/.test(value);
}

/**
 * Prefixes whose whole family is tracking.
 *
 * `utm_` is the one that matters and it is a *prefix* rather than five names,
 * because the convention is open-ended — `utm_source`, `utm_medium`,
 * `utm_campaign`, `utm_term`, `utm_content`, `utm_id`, `utm_source_platform`
 * and whatever an analytics vendor adds next. Listing the five everybody knows
 * is how the sixth silently makes one article into two entries, which is
 * exactly the failure FR-005 exists to prevent, and it is the failure this
 * fixture table caught on its first run.
 */
const TRACKING_PREFIXES = ['utm_'];

function stripParams(url: URL, drop: Set<string>): void {
  // The keys are collected before any are deleted, and that is not a style
  // choice: `URLSearchParams.keys()` is a live iterator over the same list
  // `delete` mutates, so deleting mid-iteration skips the next entry. Two
  // adjacent tracking parameters would leave the second one in place.
  const keys: string[] = [];
  for (const key of url.searchParams.keys()) keys.push(key);
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (
      drop.has(lower) ||
      TRACKING_PREFIXES.some((prefix) => lower.startsWith(prefix))
    ) {
      url.searchParams.delete(key);
    }
  }
}

/**
 * Parameters in a fixed order, so two URLs that differ only in the order their
 * query was written compare equal.
 *
 * `?a=1&b=2` and `?b=2&a=1` are the same request to every server in the world
 * and two different strings to a unique index.
 */
function sortParams(url: URL): void {
  const entries = [...url.searchParams.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const sorted = new URLSearchParams();
  for (const [key, value] of entries) sorted.append(key, value);
  url.search = sorted.toString();
}

/** Exported for the YouTube adapter, which strips the same share noise. */
export function stripYoutubeNoise(url: URL): void {
  stripParams(url, YOUTUBE_NOISE);
}

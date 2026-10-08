/**
 * What a meeting's link or address looks like before it is opened (032, US2).
 *
 * Three ports, each with one production adapter in `infrastructure/` and one
 * in-memory adapter for the handler spec: the page fetcher (every hop through
 * the shared SSRF guard), the geocoder (Nominatim, behind
 * `meetings.geocodeEnabled`) and the cache (`link_previews`).
 */

export interface Place {
  lat: number;
  lng: number;
  label: string | null;
}

export interface LinkPreview {
  /** Where the link ended up after its redirects; null for an address. */
  url: string | null;
  title: string | null;
  siteName: string | null;
  /** Absolute, and `http(s)` only. */
  image: string | null;
  place: Place | null;
}

/** What one fetch of a link learnt. */
export interface FetchedPage {
  /**
   * Every URL the chain visited, first to last — only those the SSRF guard
   * allowed. A short map link carries its coordinates in a redirect, not in
   * the page, and Google's last hop is often a consent page.
   */
  hops: string[];
  /** Null when there was no readable HTML at the end of the chain. */
  title: string | null;
  siteName: string | null;
  image: string | null;
}

/**
 * Our end failed — the network, DNS, a timeout. Not cached, unlike the far end
 * answering with nothing, because an outage of ours says nothing about the
 * link.
 */
export class PreviewUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreviewUnavailable';
  }
}

export abstract class PageFetcher {
  /** Throws `PreviewUnavailable` only; a refusal is a page with no facts. */
  abstract fetch(url: string): Promise<FetchedPage>;
}

export abstract class Geocoder {
  /** Null when the address names nowhere the geocoder knows. */
  abstract geocode(address: string): Promise<Place | null>;
}

export interface CachedPreview {
  /** Null records a failure, kept so a dead link is not fetched every view. */
  preview: LinkPreview | null;
}

export abstract class LinkPreviewCache {
  /** The entry for `key` while it has not expired. */
  abstract get(key: string, now: Date): Promise<CachedPreview | null>;
  abstract put(
    key: string,
    entry: CachedPreview & { fetchedAt: Date; expiresAt: Date },
  ): Promise<void>;
}

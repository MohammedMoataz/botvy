import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import {
  Geocoder,
  LinkPreviewCache,
  PageFetcher,
  PreviewUnavailable,
  type LinkPreview,
} from '../../domain/link-preview.ports.js';
import { isLinkShaped, linkUrlOf } from '../../domain/location-link.js';
import { coordinatesFrom } from '../../domain/map-coordinates.js';

const DAY_MS = 86_400_000;

/**
 * A preview of a meeting's link or address (032, US2, FR-003/FR-004).
 *
 * - A link (or an address that is one) is fetched through `PageFetcher`, whose
 *   every hop passes the shared SSRF guard, and the place comes from the URLs
 *   of the chain itself — a short `maps.app.goo.gl` link resolves to one that
 *   carries its coordinates.
 * - A plain-text address is geocoded, and only while `meetings.geocodeEnabled`
 *   is on, because that sends the text to somebody else.
 *
 * Answers are cached in `link_previews` under a hash of the URL or the
 * address, shared across members: a member only ever gets back a preview of a
 * string they supplied, and the row carries no `userId`. A failure is cached
 * too, for `meetings.previewFailureTtlDays`, so a dead link is not fetched on
 * every view; an outage of *ours* is not, because it says nothing about the
 * link.
 *
 * `userId` is taken for the shape every member read has, and so a per-member
 * limit can be added without changing a caller.
 */
@Injectable()
export class LinkPreviewQueryHandler {
  constructor(
    private readonly fetcher: PageFetcher,
    private readonly geocoder: Geocoder,
    private readonly cache: LinkPreviewCache,
    private readonly settings: SettingsService,
  ) {}

  async preview(
    _userId: string,
    input: { url?: string | null; address?: string | null },
    now: Date = new Date(),
  ): Promise<LinkPreview | null> {
    const rawUrl = input.url?.trim() || null;
    const address = input.address?.trim() || null;
    // Longer than any link or address a meeting holds: not worth a request.
    if ((rawUrl?.length ?? 0) > 2048 || (address?.length ?? 0) > 2048) {
      return null;
    }

    let link: string | null = null;
    if (rawUrl) {
      link = linkUrlOf(rawUrl);
      if (!link) return null; // not http(s): nothing we will fetch
    } else if (address && isLinkShaped(address)) {
      link = linkUrlOf(address);
      if (!link) return null;
    }
    if (!link && !address) return null;

    let key: string;
    if (link) {
      try {
        key = cacheKey(`url:${new URL(link).toString()}`);
      } catch {
        return null; // link-shaped but not a URL anything could fetch
      }
    } else {
      key = cacheKey(`address:${address!.toLowerCase()}`);
    }

    const cached = await this.cache.get(key, now);
    if (cached) return cached.preview;

    let preview: LinkPreview | null;
    try {
      if (link) {
        preview = await this.ofLink(link);
      } else {
        // Off means off: nothing is sent, and nothing is cached, so turning it
        // back on works at once.
        if (!(await this.settings.get('meetings.geocodeEnabled'))) return null;
        const place = await this.geocoder.geocode(address!);
        preview = place
          ? { url: null, title: null, siteName: null, image: null, place }
          : null;
      }
    } catch (error) {
      if (error instanceof PreviewUnavailable) return null;
      throw error;
    }

    const days = await this.settings.get(
      preview ? 'meetings.previewTtlDays' : 'meetings.previewFailureTtlDays',
    );
    await this.cache.put(key, {
      preview,
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + days * DAY_MS),
    });
    return preview;
  }

  private async ofLink(link: string): Promise<LinkPreview | null> {
    const page = await this.fetcher.fetch(link);
    // The last hop that names a place wins; the original link is a hop too.
    const hops = page.hops.length > 0 ? page.hops : [link];
    let coords: { lat: number; lng: number } | null = null;
    for (const hop of [...hops].reverse()) {
      coords = coordinatesFrom(hop);
      if (coords) break;
    }
    const preview: LinkPreview = {
      url: hops[hops.length - 1] ?? link,
      title: page.title,
      siteName: page.siteName,
      image: page.image,
      place: coords ? { ...coords, label: page.title } : null,
    };
    const empty =
      !preview.title && !preview.siteName && !preview.image && !preview.place;
    return empty ? null : preview;
  }
}

function cacheKey(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * YouTube, through `youtubei.js`.
 *
 * ## The platform-terms caveat, stated where somebody will read it
 *
 * This library talks to YouTube's internal (InnerTube) API rather than the
 * public Data API, because the public one does not serve captions for videos
 * the caller does not own. Using it is outside YouTube's published terms of
 * service. Botvy is self-hosted and single-household: what happens here is one
 * person's own machine fetching, for that person alone, the metadata and
 * captions of videos they chose to save — nothing is redistributed, nothing is
 * re-hosted, and the link out to the original is on every screen that shows a
 * summary.
 *
 * That is a judgement about a personal tool, not a licence, and the Owner is
 * told so: `SETUP.md` carries the same paragraph, and an Owner who would rather
 * not make it can simply not save video links — every other kind of source goes
 * through `HttpSourceFetcher` and touches none of this.
 *
 * ## What it does not do
 *
 * It does not download audio or video. Nothing here fetches a stream, and the
 * "media" of a video entry is the source it already links to.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Innertube } from 'youtubei.js';
import {
  ContentExtractor,
  SourceFetcher,
  SourceRefused,
  SourceUnavailable,
  type ExtractedContent,
  type FetchLimits,
  type PlaylistItem,
  type RawSource,
} from '../domain/knowledge.ports.js';
import type { Link } from '../domain/link.aggregate.js';
import type { LinkKind } from '../domain/url-kind.js';

/** What `Innertube.create()` gives back, reduced to the two calls used here. */
export interface YoutubeClient {
  getInfo(id: string): Promise<unknown>;
  getPlaylist(id: string): Promise<unknown>;
}

@Injectable()
export class YoutubeSourceFetcher extends SourceFetcher {
  private readonly logger = new Logger(YoutubeSourceFetcher.name);
  #client: Promise<YoutubeClient> | null = null;

  /**
   * The factory is injectable so a spec can substitute one without a network.
   *
   * It is a *factory* rather than a client because `Innertube.create()` makes a
   * request: constructing it eagerly would mean the worker could not start
   * without YouTube being reachable, which is a hard dependency on somebody
   * else's uptime for a feature most members never use.
   */
  constructor(
    private readonly create: () => Promise<YoutubeClient> = () =>
      Innertube.create() as unknown as Promise<YoutubeClient>,
  ) {
    super();
  }

  handles(kind: LinkKind): boolean {
    return kind === 'video' || kind === 'playlist';
  }

  async fetch(link: Link, limits: FetchLimits): Promise<RawSource> {
    const id = link.externalId;
    if (!id) {
      // Unreachable through `normaliseLink`, which only answers `video` or
      // `playlist` when it has recognised an id. Refused rather than thrown so
      // a row that somehow arrived this way fails once with a reason instead of
      // looping through the sweep for ever.
      throw new SourceRefused('This YouTube link carries no video or playlist id.');
    }

    const client = await this.client();
    return link.kind === 'playlist'
      ? this.playlist(client, id, limits)
      : this.video(client, id, link.url);
  }

  private async client(): Promise<YoutubeClient> {
    this.#client ??= this.create().catch((error: Error) => {
      // Not cached as a rejected promise: a session that could not be created
      // because the network was down must be creatable on the next attempt.
      this.#client = null;
      throw new SourceUnavailable(
        `Could not open a YouTube session: ${error.message}`,
      );
    });
    return this.#client;
  }

  /**
   * One video: what it is, and what was said in it.
   *
   * **A missing transcript is not a failure.** It is the spec's own edge case:
   * the entry finishes on title, description and duration alone, and the
   * summary says it was built without captions. A video with no captions is
   * ordinary — most of YouTube has none — and failing on it would leave a
   * member's list full of red rows for videos that are perfectly fine.
   */
  private async video(
    client: YoutubeClient,
    id: string,
    url: string,
  ): Promise<RawSource> {
    const info = await this.call(() => client.getInfo(id), 'video');
    const basic = (info as { basic_info?: Record<string, unknown> }).basic_info;
    if (!basic) throw new SourceRefused('YouTube returned nothing about this video.');

    return {
      url,
      contentType: 'video/youtube',
      html: null,
      video: {
        title: asString(basic.title),
        author: asString(basic.author),
        description: asString(basic.short_description),
        durationSec: typeof basic.duration === 'number' ? basic.duration : null,
        publishedAt: asDate(basic.start_timestamp),
        transcript: await this.transcript(info),
      },
      playlist: null,
    };
  }

  /**
   * The captions, or null.
   *
   * Everything here is optional-chained through shapes `youtubei.js` changes
   * between majors. That is not defensiveness for its own sake: the library
   * talks to an undocumented API, so the *shape* is not a contract either, and
   * a hard field access would turn a YouTube layout change into a crashed
   * worker rather than a video summarised without captions.
   */
  private async transcript(info: unknown): Promise<string | null> {
    const getTranscript = (info as { getTranscript?: () => Promise<unknown> })
      .getTranscript;
    if (typeof getTranscript !== 'function') return null;

    try {
      const transcriptInfo = await getTranscript.call(info);
      const segments = (
        transcriptInfo as {
          transcript?: {
            content?: { body?: { initial_segments?: unknown[] } };
          };
        }
      ).transcript?.content?.body?.initial_segments;
      if (!Array.isArray(segments)) return null;

      const lines = segments
        .map((segment) =>
          asString((segment as { snippet?: { text?: unknown } }).snippet?.text),
        )
        .filter((line): line is string => line !== null);

      return lines.length === 0 ? null : lines.join(' ');
    } catch (error) {
      // "Transcript panel not available" is how this library reports a video
      // with no captions, and it is a normal answer rather than a fault.
      this.logger.debug(`no transcript: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * A playlist's videos, capped at the Owner's limit.
   *
   * `total` is reported from the source's own count so the member can be told
   * how many were left behind (FR-002's edge case) — and it is taken before the
   * slice, because a count derived from the slice would always equal the limit
   * and would never say anything.
   */
  private async playlist(
    client: YoutubeClient,
    id: string,
    limits: FetchLimits,
  ): Promise<RawSource> {
    const playlist = await this.call(() => client.getPlaylist(id), 'playlist');
    const info = (playlist as { info?: Record<string, unknown> }).info ?? {};
    const rawItems = (playlist as { items?: unknown[] }).items ?? [];

    const items: PlaylistItem[] = [];
    for (const raw of rawItems) {
      const videoId = asString((raw as { id?: unknown }).id);
      if (!videoId) continue;
      items.push({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: asString((raw as { title?: { text?: unknown } }).title?.text),
      });
      if (items.length === limits.playlistMaxItems) break;
    }

    if (items.length === 0) {
      throw new SourceRefused('This playlist has no videos Botvy can read.');
    }

    const declared = Number(asString(info.total_items) ?? '0');
    return {
      url: `https://www.youtube.com/playlist?list=${id}`,
      contentType: 'video/youtube-playlist',
      html: null,
      video: null,
      playlist: {
        title: asString(info.title),
        items,
        total: Number.isFinite(declared) && declared > 0 ? declared : rawItems.length,
      },
    };
  }

  /**
   * One call to the library, with its two failures told apart.
   *
   * A video that is private, deleted or age-gated is the source refusing and
   * spends an attempt. Anything else — a network error, a parser that choked on
   * a layout change — is treated as our end failing, which is the safe
   * direction: a link left for the sweep is retried and a link marked `failed`
   * needs a member to notice.
   */
  private async call<T>(work: () => Promise<T>, what: string): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const message = (error as Error).message ?? String(error);
      if (/private|unavailable|deleted|not exist|age|removed/i.test(message)) {
        throw new SourceRefused(`YouTube will not show this ${what}: ${message}`);
      }
      throw new SourceUnavailable(`YouTube did not answer: ${message}`);
    }
  }
}

/**
 * The video's own facts as text to summarise.
 *
 * A separate extractor rather than work done inside the fetcher, so the two
 * halves of the pipeline stay the two halves they are everywhere else — and so
 * the "no captions" sentence has one home. It is *in the text* rather than only
 * in a field, because the text is what the model is shown: a summariser told
 * nothing about the absence would write around it as though it had watched the
 * video.
 */
@Injectable()
export class YoutubeExtractor extends ContentExtractor {
  handles(kind: LinkKind): boolean {
    return kind === 'video' || kind === 'playlist';
  }

  async extract(
    raw: RawSource,
    link: Link,
    limits: FetchLimits,
  ): Promise<ExtractedContent> {
    if (link.kind === 'playlist') {
      const playlist = raw.playlist;
      if (!playlist) throw new SourceRefused('The playlist came back empty.');
      // A playlist is not summarised: its children are. The text exists so the
      // list has something to show while the videos are still being read.
      return {
        title: playlist.title,
        author: null,
        publishedAt: null,
        text: playlist.items
          .map((item, index) => `${index + 1}. ${item.title ?? item.url}`)
          .join('\n')
          .slice(0, limits.maxChars),
        transcript: null,
        media: [],
        durationSec: null,
      };
    }

    const video = raw.video;
    if (!video) throw new SourceRefused('The video came back empty.');

    const parts = [
      video.title ? `Title: ${video.title}` : null,
      video.author ? `Channel: ${video.author}` : null,
      video.durationSec ? `Length: ${minutes(video.durationSec)}` : null,
      video.description ? `Description:\n${video.description}` : null,
      video.transcript
        ? `Transcript:\n${video.transcript}`
        : 'This video has no captions, so only its title and description were available.',
    ].filter((part): part is string => part !== null);

    return {
      title: video.title,
      author: video.author,
      publishedAt: video.publishedAt,
      text: parts.join('\n\n').slice(0, limits.maxChars),
      transcript: video.transcript,
      // A video's media is the video, which the entry already links to.
      media: [],
      durationSec: video.durationSec,
    };
  }
}

function minutes(seconds: number): string {
  const whole = Math.round(seconds / 60);
  return whole <= 1 ? 'about a minute' : `about ${whole} minutes`;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

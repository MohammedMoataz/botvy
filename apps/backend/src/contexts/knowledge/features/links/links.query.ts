import { Injectable } from '@nestjs/common';
import { mediaPath } from '../../../../shared/media/media.signing.js';
import {
  LinkRepository,
  ReadingRepository,
} from '../../domain/knowledge.repositories.js';
import type { Link, LinkStatus } from '../../domain/link.aggregate.js';
import type { Reading } from '../../domain/reading.js';

/** How many rows the Owner's queue view returns in one go. */
const QUEUE_LIMIT = 200;

export interface MediaView {
  type: string;
  /**
   * The **proxied** URL, never the source's own (FR-008).
   *
   * Null when signing is not configured, which is what
   * `mediaPath` answers with no secret. A null is rendered as "no picture" by
   * every client; handing over the source URL as a fallback would quietly
   * defeat the requirement on exactly the installation whose Owner had not
   * finished setting it up.
   */
  url: string | null;
  caption: string | null;
}

export interface ReadingView {
  title: string | null;
  author: string | null;
  publishedAt: Date | null;
  summary: string;
  keyPoints: string[];
  media: MediaView[];
  durationSec: number | null;
  /** How long the original is, in characters. The "is this worth my time" half. */
  lengthChars: number;
  /** False for a video whose captions were not available; null for anything else. */
  hadTranscript: boolean | null;
  readAt: Date;
}

export interface LinkView {
  id: string;
  url: string;
  kind: string;
  title: string | null;
  tags: string[];
  status: LinkStatus;
  failReason: string | null;
  attempts: number;
  parentId: string | null;
  skippedCount: number | null;
  addedAt: Date;
  processedAt: Date | null;
  children: LinkView[];
  doc: ReadingView | null;
}

export interface LinkPageView {
  nodes: LinkView[];
  endCursor: string | null;
  hasNextPage: boolean;
}

/**
 * Knowledge's published reads (FR-006, FR-007, FR-008, FR-014).
 *
 * ## The list is shallow and the detail is deep
 *
 * `list` returns no documents and no children: a member's list is thirty rows
 * and a document is sixty thousand characters, so joining them would move the
 * whole of everything they have ever saved over the wire to render a list of
 * titles. `one` fetches the document and the playlist's videos, because that is
 * the screen that shows them.
 *
 * ## Media is proxied here, at the boundary
 *
 * The stored document holds the *source's* URLs, because that is what was
 * found; the view holds the signed `/media` path, because that is what a client
 * may have (FR-008). Doing it here rather than at extraction time is what makes
 * a signing secret rotatable — the stored rows carry no signature, so changing
 * the secret changes what the next read serves rather than invalidating
 * everything already saved.
 */
@Injectable()
export class LinksQueryHandler {
  constructor(
    private readonly links: LinkRepository,
    private readonly readings: ReadingRepository,
    /** `MEDIA_SIGNING_SECRET`. Undefined leaves every media URL null. */
    private readonly mediaSecret: string | undefined,
  ) {}

  async list(
    userId: string,
    options: {
      status?: LinkStatus;
      kind?: string;
      first?: number;
      after?: string | null;
    } = {},
  ): Promise<LinkPageView> {
    const page = await this.links.listFor(userId, {
      status: options.status,
      kind: options.kind,
      first: Math.min(Math.max(options.first ?? 50, 1), 100),
      after: options.after ?? null,
    });
    return {
      nodes: page.rows.map((link) => this.view(link, null, [])),
      endCursor: page.endCursor,
      hasNextPage: page.hasNextPage,
    };
  }

  async one(userId: string, id: string): Promise<LinkView | null> {
    const link = await this.links.findById(userId, id);
    if (!link || link.isDeleted) return null;

    const [reading, children] = await Promise.all([
      this.readings.forLink(userId, id),
      link.kind === 'playlist'
        ? this.links.childrenOf(userId, id)
        : Promise.resolve([]),
    ]);

    return this.view(
      link,
      reading,
      children.map((child) => this.view(child, null, [])),
    );
  }

  /**
   * The Owner's queue, across every member (FR-014).
   *
   * It returns `LinkView` like the member's own list, which means it carries
   * the URL and the title of things other people saved. That is the point of
   * the screen — an Owner who cannot see *what* failed cannot tell a broken
   * fetcher from a member pasting nonsense — and it is why the resolver behind
   * it is admin-only. What it deliberately does not carry is the **document**:
   * the summary of somebody's reading is not operational information, and the
   * queue is about the pipeline rather than about the content.
   */
  async queue(status?: LinkStatus): Promise<LinkView[]> {
    const rows = await this.links.queueAcrossMembers(status, QUEUE_LIMIT);
    return rows.map((link) => this.view(link, null, []));
  }

  private view(
    link: Link,
    reading: Reading | null,
    children: LinkView[],
  ): LinkView {
    return {
      id: link.id,
      url: link.url,
      kind: link.kind,
      title: link.title,
      tags: [...link.tags],
      status: link.status,
      failReason: link.failReason,
      attempts: link.attempts,
      parentId: link.parentLinkId,
      skippedCount: link.skippedCount,
      addedAt: link.addedAt,
      processedAt: link.processedAt,
      children,
      doc: reading ? this.readingView(link, reading) : null,
    };
  }

  private readingView(link: Link, reading: Reading): ReadingView {
    return {
      title: reading.title,
      author: reading.author,
      publishedAt: reading.publishedAt,
      summary: reading.summary,
      keyPoints: [...reading.keyPoints],
      media: reading.media.map((item) => ({
        type: item.type,
        url: mediaPath(item.url, this.mediaSecret),
        caption: item.caption,
      })),
      durationSec: reading.durationSec,
      lengthChars: reading.text.length,
      // Only a video can be missing captions; for an article the question does
      // not arise, and a `false` there would read as "this article had no
      // transcript", which is true of every article ever written.
      hadTranscript: link.kind === 'video' ? reading.transcript !== null : null,
      readAt: reading.createdAt,
    };
  }
}

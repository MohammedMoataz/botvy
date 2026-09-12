import { Injectable, Logger } from '@nestjs/common';
import { newId } from '../../../../shared/cqrs/ids.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { LinkRepository } from '../../domain/knowledge.repositories.js';
import type { PlaylistItem } from '../../domain/knowledge.ports.js';
import { Link } from '../../domain/link.aggregate.js';
import { normaliseLink } from '../../domain/url-kind.js';

export interface ExpansionResult {
  created: number;
  adopted: number;
  /** How many of the source's videos the Owner's limit left behind. */
  skipped: number;
}

/** Mints the ids the children get. A token so a spec can substitute a counter. */
export type LinkIdFactory = () => string;

/**
 * A playlist becomes one entry per video, grouped (FR-002).
 *
 * ## One entry each rather than one blob
 *
 * Each video has its own state, its own summary and its own way of failing. A
 * single document per playlist would mean one unreadable video killed the lot,
 * and there would be nothing to show a member who wanted the summary of the
 * third one. The price is this file and a `parentLinkId`.
 *
 * ## Idempotent, and by the URL rather than by a flag
 *
 * Expanding twice creates nothing the second time, because every child is
 * looked up by its normalised URL first — the same check `add-link` makes, for
 * the same reason. A "have I expanded this" flag on the parent would be a
 * second source of truth that a crash between the flag and the writes could put
 * out of step.
 *
 * ## A video the member already had is **adopted**
 *
 * It collides with the unique `(userId, normalizedUrl)` index, so a second row
 * cannot exist — and refusing the whole playlist would punish a member for
 * having saved one of its videos already. So the entry they have has its
 * `parentLinkId` set and nothing is re-read, which keeps FR-005 true across the
 * case that looks most like an exception to it. An adopted child that was
 * already `done` stays `done`: the group is complete on the first pass rather
 * than after a redundant re-read.
 */
@Injectable()
export class ExpandPlaylistHandler {
  private readonly logger = new Logger(ExpandPlaylistHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly links: LinkRepository,
    private readonly nextId: LinkIdFactory = newId,
  ) {}

  async handle(
    parent: Link,
    items: PlaylistItem[],
    total: number,
    at: Date = new Date(),
  ): Promise<ExpansionResult> {
    const result: ExpansionResult = {
      created: 0,
      adopted: 0,
      skipped: Math.max(0, total - items.length),
    };

    await this.uow.run(async () => {
      for (const item of items) {
        let normalised;
        try {
          normalised = normaliseLink(item.url);
        } catch (error) {
          // One unreadable entry in somebody else's playlist must not fail the
          // other forty-nine. Logged and skipped; it is not counted as skipped
          // either, because `skipped` is the Owner's limit's doing and this is
          // the source's.
          this.logger.warn(
            `playlist ${parent.id} lists an unusable URL: ${(error as Error).message}`,
          );
          continue;
        }

        const existing = await this.links.findByUrl(parent.userId, normalised.url);
        if (existing) {
          if (existing.id === parent.id) continue;
          if (existing.adopt(parent.id, at)) {
            await this.links.save(existing);
            result.adopted += 1;
          }
          continue;
        }

        const child = Link.save({
          id: this.nextId(),
          userId: parent.userId,
          url: normalised.url,
          normalizedUrl: normalised.url,
          kind: normalised.kind,
          externalId: normalised.externalId,
          parentLinkId: parent.id,
          title: item.title,
          // The parent's tags, so a playlist tagged `gym` produces fifty
          // sources the suggestion saga can find. Tagging each video by hand
          // is not something anybody would do, and an untagged child is a
          // reading that exists and can never be suggested from.
          tags: [...parent.tags],
          addedAt: at,
          createdAt: at,
        });
        await this.links.save(child);
        result.created += 1;
      }

      /*
       * The parent is **mutated and not saved here**, deliberately.
       *
       * `ingest-link` calls this and then finishes the parent in its own
       * transaction, on the same object — so the skipped count rides along with
       * the `done` transition and the two land together. Saving it here as well
       * would be a second write of the same row inside a nested unit of work,
       * and the optimistic `updatedAt` filter would then refuse the outer one.
       */
      if (result.skipped > 0) parent.recordSkipped(result.skipped, at);
    });

    return result;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { AuditPort } from '../../../../shared/audit/audit.port.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import {
  LinkRepository,
  ReadingRepository,
} from '../../domain/knowledge.repositories.js';
import { LinkNotFound } from '../remove-link/remove-link.handler.js';

export interface ClearLinkResult {
  id: string;
  /** The member whose list it left. Logged, so the Owner can tell them. */
  userId: string;
  children: number;
  documents: number;
}

/**
 * The Owner clears a stuck entry (FR-014, T726).
 *
 * ## It tombstones rather than erases, and that is the point of the word
 * "clears"
 *
 * `rest-commands.md` says the route "clears a stuck or failed entry"; this makes
 * it leave the member's list and stop occupying the queue. A hard delete is
 * unreachable by the member's phone — links sync, the pull is a delta, and the
 * client's delete sweep runs only against a full snapshot — so a row removed
 * outright on the server stays on every device for ever. Deletions reach a
 * client as tombstones or they do not reach it at all.
 *
 * The **documents** go immediately, unlike a member's own delete. That is the
 * difference between tidying up and intervening: a member deleting a link may
 * change their mind, and an Owner clearing one is acting on an entry that is in
 * the way. Keeping a sixty-thousand-character extraction for a row nobody will
 * restore is holding somebody else's data for no reason.
 *
 * ## The audit row names the administrator and the member
 *
 * This is the one place in this context where one person acts on another
 * person's data, so it is the one place that writes an `audit_log` row — inside
 * the same transaction as the change, so an audited action that did not happen
 * and an action that happened unaudited are both impossible.
 */
@Injectable()
export class AdminClearLinkHandler {
  private readonly logger = new Logger(AdminClearLinkHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly links: LinkRepository,
    private readonly readings: ReadingRepository,
    private readonly audit: AuditPort,
  ) {}

  async handle(
    actor: Principal,
    linkId: string,
    reason: string | null = null,
    at: Date = new Date(),
  ): Promise<ClearLinkResult> {
    // Unscoped, because the Owner's queue is about the installation rather than
    // about one member — and the repository names that rather than letting a
    // forgotten argument do it silently.
    const link = await this.links.findAnyById(linkId);
    if (!link) throw new LinkNotFound(linkId);

    const children =
      link.kind === 'playlist'
        ? await this.links.childrenOf(link.userId, link.id)
        : [];
    const ids = [link.id, ...children.map((child) => child.id)];

    let documents = 0;
    await this.uow.run(async () => {
      if (!link.isDeleted) {
        link.tombstone(at);
        await this.links.save(link);
      }
      for (const child of children) {
        if (child.isDeleted) continue;
        child.tombstone(at);
        await this.links.save(child);
      }
      documents = await this.readings.removeForLinks(link.userId, ids);

      await this.audit.record({
        actor,
        action: 'knowledge.clear_link',
        target: { type: 'link', id: link.id },
        at,
        meta: {
          userId: link.userId,
          url: link.url,
          status: link.status,
          attempts: link.attempts,
          children: children.length,
          reason,
        },
      });
    });

    this.logger.log(
      `${actor.id} cleared link ${link.id} for ${link.userId} (${children.length} children, ${documents} document(s))`,
    );
    return { id: link.id, userId: link.userId, children: children.length, documents };
  }
}

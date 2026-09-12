import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { LinkRepository } from '../../domain/knowledge.repositories.js';

export class LinkNotFound extends Error {
  constructor(id: string) {
    super(`No link ${id}.`);
  }
}

export interface RemoveLinkResult {
  id: string;
  /** How many playlist children went with it. */
  children: number;
}

/**
 * The member removes a link, and a playlist takes its videos with it (FR-001).
 *
 * ## Tombstoned, never deleted
 *
 * Links sync, the pull is a delta by cursor, and the client's delete sweep runs
 * **only** against a full snapshot — so a row removed outright on the server
 * stays on every device for ever. Deletions reach a client as tombstones or
 * they do not reach it at all. `reminders.tombstoneDays` reaps them later,
 * through the purge every synced collection has.
 *
 * ## The children follow, and the reading does not
 *
 * A playlist is a group the member made in one action, so removing it removes
 * the group — leaving fifty orphaned videos behind would be a tidy-up the
 * member then has to do fifty times. The **documents** stay until the tombstone
 * is reaped: they are server-only and invisible, and deleting them here would
 * make an undo impossible for a member who tapped the wrong row. The purge
 * sweep removes both together, which is the one place that decision lives.
 */
@Injectable()
export class RemoveLinkHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly links: LinkRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    at: Date = new Date(),
  ): Promise<RemoveLinkResult> {
    const link = await this.links.findById(userId, id);
    if (!link) throw new LinkNotFound(id);

    const children =
      link.kind === 'playlist' ? await this.links.childrenOf(userId, id) : [];

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
    });

    return { id: link.id, children: children.length };
  }
}

/**
 * The undo, for a member who tapped the wrong row.
 *
 * It restores the parent alone. A member who deleted a playlist and restores it
 * gets the playlist back with its children still tombstoned, which reads like a
 * half-measure and is the honest one: `childrenOf` filters out tombstones, so
 * there is nothing to walk, and walking *all* rows by `parentLinkId` would
 * resurrect a video the member had deleted individually before they deleted the
 * playlist. The next pass over the playlist re-expands it and adopts whatever
 * is missing.
 */
@Injectable()
export class RestoreLinkHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly links: LinkRepository,
  ) {}

  async handle(userId: string, id: string, at: Date = new Date()): Promise<void> {
    const link = await this.links.findById(userId, id);
    if (!link) throw new LinkNotFound(id);
    if (!link.isDeleted) return;

    link.restore(at);
    await this.uow.run(() => this.links.save(link));
  }
}

/** The hard delete, for a row the member has already tombstoned. */
@Injectable()
export class PurgeLinkHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly links: LinkRepository,
  ) {}

  async handle(userId: string, id: string): Promise<void> {
    const link = await this.links.findById(userId, id);
    if (!link) throw new LinkNotFound(id);
    link.assertPurgeable();
    await this.uow.run(() => this.links.remove(link));
  }
}

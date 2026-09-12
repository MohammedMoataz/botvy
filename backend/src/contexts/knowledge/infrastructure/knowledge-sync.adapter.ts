import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../shared/member/member-context.port.js';
import {
  resolveConflict,
  type SyncChange,
} from '../../../shared/persistence/ports/sync-change.js';
import { SettingsService } from '../../../shared/settings/settings.service.js';
import { UnitOfWork } from '../../../shared/persistence/ports/unit-of-work.js';
import { localDate, wallClockToUtc } from '../../../shared/time/time.js';
import type {
  ApplyOutcome,
  SyncableEntity,
} from '../../sync/domain/syncable-entity.port.js';
import { LinkRepository } from '../domain/knowledge.repositories.js';
import { Link } from '../domain/link.aggregate.js';
import { LinkUrlError, normaliseLink } from '../domain/url-kind.js';

/**
 * 45 — after Training's workouts at 39 and before the chat at 50, which is
 * where `contracts/sync.md`'s `entities` list puts it. Not a dependency: a link
 * references nothing and nothing references a link. The gap at 43 and 44 is
 * P8's meals, which the contract lists between workouts and links.
 */
export const LINK_APPLY_ORDER = 45;

/**
 * Links, over `/sync`.
 *
 * ## The phone reads them and writes only add and remove
 *
 * `contracts/sync.md` types the push as `{ op: 'create' | 'delete' }`, and the
 * omission is the whole design. A link's interesting columns — `status`,
 * `attempts`, `failReason`, `docId`, `title` — are the *server's* record of
 * work it did, and a client that could push them could tell the server it had
 * read an article itself. So an `update` is refused as `invalid` rather than
 * silently ignored: `invalid` tells the phone to stop trying, where a silent
 * accept would leave it believing an edit had landed.
 *
 * `restore` and `purge` are accepted as well, because the Deleted view is a
 * feature of every synced collection in this product and a member who removed a
 * link on a plane must be able to put it back on the same plane.
 *
 * ## The quota is enforced here too
 *
 * A create arriving over `/sync` is a member saving a link — the fact that it
 * arrived in a batch rather than through `POST /links` changes nothing about
 * FR-015, and an unchecked path would be the way round the limit. It is
 * refused as `invalid` rather than `stale`, because retrying tomorrow is the
 * member's decision and a `stale` verdict would put the phone in a loop against
 * a rule it can never satisfy by overwriting anything.
 *
 * ## Why this does not go through `AddLinkHandler`
 *
 * Every other sync adapter in this codebase talks to the aggregate and the
 * repository rather than to a command handler, and there is a reason beyond
 * consistency: the handler answers "here is the row you already had" for a
 * duplicate, which is right for a member pressing Save and wrong for a batch
 * push, where the honest answer is that this id was applied. The two rules that
 * matter — normalisation and the quota — are shared by being small and stated
 * in both places, which is what the constitution asks for before a third copy.
 */
@Injectable()
export class LinkSyncAdapter implements SyncableEntity {
  readonly entity = 'links';
  readonly applyOrder = LINK_APPLY_ORDER;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly links: LinkRepository,
    private readonly member: MemberContextPort,
    private readonly settings: SettingsService,
  ) {}

  async pull(userId: string, since: Date | null): Promise<unknown[]> {
    const rows = await this.links.pullSince(userId, since);
    return rows.map((link) => ({
      id: link.id,
      url: link.url,
      kind: link.kind,
      title: link.title,
      tags: link.tags,
      status: link.status,
      failReason: link.failReason,
      attempts: link.attempts,
      parentLinkId: link.parentLinkId,
      skippedCount: link.skippedCount,
      /*
       * `docId` travels even though the document itself never does.
       *
       * It is what tells the phone that a summary exists to fetch over GraphQL
       * — the difference between "done, tap to read" and "done, nothing here".
       * The document is up to sixty thousand characters and no list shows it,
       * so syncing it would move a member's whole reading history onto their
       * handset to render a row of titles.
       */
      docId: link.docId,
      addedAt: link.addedAt,
      processedAt: link.processedAt,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
      deletedAt: link.deletedAt,
    }));
  }

  async apply(
    userId: string,
    change: SyncChange,
    now: Date,
  ): Promise<ApplyOutcome> {
    const existing = await this.links.findById(userId, change.id);
    const verdict = resolveConflict(change, existing, now);
    if (!verdict.accept) {
      return {
        applied: false,
        rejection: {
          entity: this.entity,
          id: change.id,
          reason: verdict.reason,
          server: existing ?? null,
        },
      };
    }

    const fields = change.fields as { url?: string; tags?: string[] };

    if (!existing) {
      const refusal = await this.refuseCreate(userId, fields, now);
      if (refusal) {
        return {
          applied: false,
          rejection: {
            entity: this.entity,
            id: change.id,
            reason: 'invalid',
            server: null,
          },
        };
      }

      const normalised = normaliseLink(fields.url!);
      // A URL the member already has, arriving under a *different* id: the
      // unique index would refuse the insert, so it is refused here with a
      // reason the phone can act on rather than as a 500 from the driver.
      const duplicate = await this.links.findByUrl(userId, normalised.url);
      if (duplicate) {
        return {
          applied: false,
          rejection: {
            entity: this.entity,
            id: change.id,
            reason: 'invalid',
            server: { id: duplicate.id, url: duplicate.url },
          },
        };
      }

      const link = Link.save({
        id: change.id,
        userId,
        url: normalised.url,
        normalizedUrl: normalised.url,
        kind: normalised.kind,
        externalId: normalised.externalId,
        parentLinkId: null,
        title: null,
        tags: fields.tags ?? [],
        // The member's own moment, not the server's: they saved it on the
        // plane, and the quota that counts their day should count it on the day
        // they did it.
        addedAt: change.updatedAt,
        createdAt: change.updatedAt,
      });
      await this.uow.run(() => this.links.save(link));
      return { applied: true, id: link.id };
    }

    switch (change.op) {
      case 'delete':
        if (!existing.isDeleted) existing.tombstone(now);
        break;
      case 'restore':
        if (existing.isDeleted) existing.restore(now);
        break;
      case 'purge':
        existing.assertPurgeable();
        await this.uow.run(() => this.links.remove(existing));
        return { applied: true, id: existing.id };
      default:
        /*
         * Everything else, including an `update` carrying a status.
         *
         * `invalid` rather than `stale`, deliberately. A stale verdict tells
         * the phone to overwrite its copy from the server and try again, and
         * against a rule that will never accept an edit it would retry for
         * ever — which is the failure this codebase already wrote down about
         * `protected`.
         */
        return {
          applied: false,
          rejection: {
            entity: this.entity,
            id: change.id,
            reason: 'invalid',
            server: null,
          },
        };
    }

    await this.uow.run(() => this.links.save(existing));
    return { applied: true, id: existing.id };
  }

  /**
   * Whether this create must be refused: no URL, an unreadable one, or the
   * member's day already spent (FR-015).
   *
   * Returns a reason string rather than throwing, because the caller has a
   * rejection to build and a `SyncChange` that throws would abort the rest of
   * the batch — a member pushing ten links after a flight must have the first
   * nine applied.
   */
  private async refuseCreate(
    userId: string,
    fields: { url?: string },
    now: Date,
  ): Promise<string | null> {
    if (!fields.url) return 'a link needs a url';
    try {
      normaliseLink(fields.url);
    } catch (error) {
      return error instanceof LinkUrlError ? error.message : 'unreadable url';
    }

    const [{ timezone }, limit] = await Promise.all([
      this.member.clock(userId),
      this.settings.get('knowledge.maxLinksPerDay'),
    ]);
    const today = localDate(now, timezone);
    const midnight =
      wallClockToUtc(`${today}T00:00`, timezone) ??
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const saved = await this.links.countAddedSince(userId, midnight);
    return saved >= limit ? `the daily limit of ${limit} is reached` : null;
  }
}

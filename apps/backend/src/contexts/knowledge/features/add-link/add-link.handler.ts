import { Injectable } from '@nestjs/common';
import { isUuid } from '../../../../shared/cqrs/ids.js';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import { localDate, wallClockToUtc } from '../../../../shared/time/time.js';
import { LinkRepository } from '../../domain/knowledge.repositories.js';
import { Link, type LinkStatus } from '../../domain/link.aggregate.js';
import { normaliseLink, type LinkKind } from '../../domain/url-kind.js';

export class InvalidLinkId extends Error {
  constructor(id: string) {
    super(
      `"${id}" is not a UUID. The client mints the id, and it has to be a UUIDv7.`,
    );
  }
}

export class DailyLinkQuotaReached extends Error {
  constructor(readonly limit: number) {
    super(
      `You have saved ${limit} links today, which is this installation's limit. The ones already queued are still being read.`,
    );
  }
}

export interface AddLinkCommand {
  /** Minted by the client, so a save made offline has a reference at once. */
  id: string;
  url: string;
  tags?: string[];
  /** Set by the playlist expander; never by a member. */
  parentLinkId?: string | null;
}

export interface AddLinkResult {
  id: string;
  kind: LinkKind;
  status: LinkStatus;
  /** True when this URL was already saved and nothing new was created. */
  duplicate: boolean;
}

/**
 * A link the member saved (FR-001, FR-002, FR-005, FR-015).
 *
 * ## Three decisions before anything is written, in this order
 *
 * **Normalise first.** The kind and the duplicate check both depend on the
 * canonical URL, and the quota must not be spent finding out that the member
 * already had this one. So a second paste of an article the member saved this
 * morning costs nothing at all: it is not a save, so it is not counted.
 *
 * **Duplicate second.** The existing entry is *returned*, not refused, and it
 * is returned with `duplicate: true` so the client can say "you already have
 * this" and open it rather than showing an error. That is also what makes a
 * retried offline create a no-op: the phone mints the id, so a retry with the
 * same id finds the same row.
 *
 * **Quota last**, and counted over the member's own local day through
 * `shared/time` — never the server's. A member in Cairo saving links at
 * half past midnight is on today's allowance; a server reading its own `TZ`
 * would put them on yesterday's, which is the three-hour bug this codebase
 * already shipped once.
 *
 * The refusal names the number and says the queue is unaffected, because
 * FR-015 asks for a save past the quota to be *refused with a reason* rather
 * than queued — and a member who has just pasted ten links wants to know the
 * first nine are still coming.
 */
@Injectable()
export class AddLinkHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly links: LinkRepository,
    private readonly member: MemberContextPort,
    private readonly settings: SettingsService,
  ) {}

  async handle(
    userId: string,
    command: AddLinkCommand,
    at: Date = new Date(),
  ): Promise<AddLinkResult> {
    if (!isUuid(command.id)) throw new InvalidLinkId(command.id);

    const normalised = normaliseLink(command.url);

    const existing = await this.links.findByUrl(userId, normalised.url);
    if (existing) {
      return {
        id: existing.id,
        kind: existing.kind,
        status: existing.status,
        duplicate: true,
      };
    }

    await this.checkQuota(userId, at);

    const link = Link.save({
      id: command.id,
      userId,
      url: normalised.url,
      normalizedUrl: normalised.url,
      kind: normalised.kind,
      externalId: normalised.externalId,
      parentLinkId: command.parentLinkId ?? null,
      title: null,
      tags: command.tags ?? [],
      addedAt: at,
      createdAt: at,
    });

    await this.uow.run(() => this.links.save(link));
    return {
      id: link.id,
      kind: link.kind,
      status: link.status,
      duplicate: false,
    };
  }

  /**
   * The member's own day, resolved through their zone (principle XI).
   *
   * `wallClockToUtc` of their local midnight rather than "now minus 24 hours",
   * because a rolling window would let a member who saves twenty links every
   * evening be refused every evening for ever. A quota that resets at their
   * midnight is the one they can reason about.
   *
   * A zone that will not resolve falls back to counting from the last midnight
   * UTC rather than skipping the check: an unreadable profile must not become a
   * way of turning the limit off.
   */
  private async checkQuota(userId: string, at: Date): Promise<void> {
    const [{ timezone }, limit] = await Promise.all([
      this.member.clock(userId),
      this.settings.get('knowledge.maxLinksPerDay'),
    ]);

    const today = localDate(at, timezone);
    const midnight =
      wallClockToUtc(`${today}T00:00`, timezone) ??
      new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));

    const saved = await this.links.countAddedSince(userId, midnight);
    if (saved >= limit) throw new DailyLinkQuotaReached(limit);
  }
}

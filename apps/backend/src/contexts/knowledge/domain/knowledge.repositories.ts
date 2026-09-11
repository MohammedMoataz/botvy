import { Repository } from '../../../shared/persistence/ports/repository.js';
import { SyncableRepository } from '../../../shared/persistence/ports/syncable-repository.js';
import type { Link, LinkStatus } from './link.aggregate.js';
import type { Reading } from './reading.js';
import type { Suggestion, SuggestionStatus } from './suggestion.aggregate.js';

/** One page of the member's list. `contracts/graphql` types it as a connection. */
export interface LinkPage {
  rows: Link[];
  endCursor: string | null;
  hasNextPage: boolean;
}

export abstract class LinkRepository extends SyncableRepository<Link> {
  /**
   * The member's live entry for this URL, or null.
   *
   * **Live only**, and the omission is the design. The unique index is partial
   * on `deletedAt: null`, so a tombstone holds no URL — a member who removed an
   * article and saves it again is asking to read it again, and answering them
   * with the row they deleted would be the settings-registry mistake in another
   * costume: a rule stated once and then applied to a case it was not about.
   * FR-005 is about saving the same link twice, not about ever having saved it.
   */
  abstract findByUrl(userId: string, normalizedUrl: string): Promise<Link | null>;

  /** The member's list, newest first, filtered and paged (`links` query). */
  abstract listFor(
    userId: string,
    options: {
      status?: LinkStatus;
      kind?: string;
      first: number;
      after?: string | null;
    },
  ): Promise<LinkPage>;

  /** A playlist's videos, for the detail view and for the delete cascade. */
  abstract childrenOf(userId: string, parentLinkId: string): Promise<Link[]>;

  /**
   * The oldest `queued` rows across every member, soonest-added first.
   *
   * Across members and not scoped, which is the one read in this context that
   * is: the pipeline is an installation-wide queue with an Owner-set
   * concurrency, and a per-member drain would let one enthusiast's fifty links
   * hold everybody else's behind them. `knowledge.maxLinksPerDay` is what keeps
   * that fair on the way in; this is what keeps it fair on the way out.
   */
  abstract nextQueued(limit: number): Promise<Link[]>;

  /**
   * Rows parked mid-pipeline since before `before` (FR-016).
   *
   * Across members for the same reason as `nextQueued`, and by `updatedAt`
   * rather than by any claim field — the pipeline claims by *moving the state*,
   * so a row that has been `fetching` for an hour is a row whose worker is gone.
   */
  abstract stalledSince(before: Date, limit: number): Promise<Link[]>;

  /**
   * When the oldest thing still waiting was last touched, or null for an empty
   * queue.
   *
   * `/health` needs it (FR-017): a heartbeat alone cannot tell a draining queue
   * from a stuck one, because the sweep stamps its heartbeat whether or not it
   * managed to move anything.
   */
  abstract oldestQueuedAt(): Promise<Date | null>;

  /**
   * One link by its id alone, whoever owns it.
   *
   * The **only** unscoped point read in this context, and it exists for the two
   * callers that genuinely have no member: `POST /internal/knowledge/ingest/:linkId`,
   * which a service token calls, and the Owner's `DELETE /admin/knowledge/:linkId`,
   * which is about the installation's queue rather than about one member's list.
   *
   * Named `findAnyById` rather than overloading `findById`, so that every
   * ordinary caller keeps the scoped signature and reaching past it has to be
   * spelled out. A repository whose default read crossed members is a
   * repository one forgotten argument away from serving somebody else's rows.
   */
  abstract findAnyById(id: string): Promise<Link | null>;

  /** The Owner's queue, across members (`ingestionQueue`). */
  abstract queueAcrossMembers(
    status: LinkStatus | undefined,
    limit: number,
  ): Promise<Link[]>;

  /**
   * How many links this member has saved since an instant — the daily quota
   * (FR-015).
   *
   * Tombstones are counted. Deleting a link does not give the allowance back:
   * the cost the quota exists to bound is the *reading*, which has already been
   * queued, and a quota a member can reset by tidying up is not a quota.
   */
  abstract countAddedSince(userId: string, since: Date): Promise<number>;

  /**
   * Finished entries whose tags overlap any of `tags`, newest first.
   *
   * The suggestion saga's selection (FR-009). Tag matching happens in the store
   * rather than in the saga because the alternative is reading every finished
   * link a member has ever saved in order to filter three of them out.
   */
  abstract doneWithTags(
    userId: string,
    tags: string[],
    limit: number,
  ): Promise<Link[]>;

  /**
   * The tombstones the next sweep will erase, before it erases them.
   *
   * Its own read rather than a return value from `purgeTombstonesBefore`,
   * because the sweep needs the ids to find each link's *document*, and a
   * delete that also returned the rows it deleted would be a different kind of
   * method on every adapter. One extra read per sweep, against a result that is
   * empty on almost every run.
   */
  abstract tombstonesBefore(before: Date, userId?: string): Promise<Link[]>;

  abstract purgeTombstonesBefore(before: Date, userId?: string): Promise<number>;

  abstract removeAllFor(userId: string): Promise<number>;
}

export abstract class ReadingRepository extends Repository<Reading> {
  /** The document behind one link, for the detail view. */
  abstract forLink(userId: string, linkId: string): Promise<Reading | null>;

  /** The documents behind several links, for the suggestion prompt. */
  abstract forLinks(userId: string, linkIds: string[]): Promise<Reading[]>;

  /** Used by the delete cascade and the admin clear. */
  abstract removeForLinks(userId: string, linkIds: string[]): Promise<number>;

  abstract removeAllFor(userId: string): Promise<number>;
}

export abstract class SuggestionRepository extends Repository<Suggestion> {
  abstract listFor(
    userId: string,
    status?: SuggestionStatus,
  ): Promise<Suggestion[]>;

  /**
   * Any suggestion already made about this session, whatever became of it.
   *
   * Whatever became of it, because FR-010's "not proposed again" covers the
   * dismissed ones — which is the whole point of keeping a dismissed row rather
   * than deleting it — and because re-proposing over a *pending* one would put
   * two cards in the member's inbox about one evening.
   */
  abstract forSession(userId: string, sessionId: string): Promise<Suggestion | null>;

  /** The suggestion an accepted session came from, for the outcome (T734). */
  abstract byAcceptedSession(
    userId: string,
    sessionId: string,
  ): Promise<Suggestion | null>;

  abstract removeAllFor(userId: string): Promise<number>;
}

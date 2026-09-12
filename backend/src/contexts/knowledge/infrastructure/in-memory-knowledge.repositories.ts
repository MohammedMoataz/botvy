import { InMemoryRepositoryBase } from '../../../shared/persistence/memory/in-memory-repository.base.js';
import type { Link, LinkStatus } from '../domain/link.aggregate.js';
import {
  LinkRepository,
  ReadingRepository,
  SuggestionRepository,
  type LinkPage,
} from '../domain/knowledge.repositories.js';
import type { Reading } from '../domain/reading.js';
import type {
  Suggestion,
  SuggestionStatus,
} from '../domain/suggestion.aggregate.js';

/**
 * The stores a handler spec runs against.
 *
 * Two things about this context make the in-memory half worth reading rather
 * than skimming.
 *
 * **Three of the link reads are not scoped to a member.** `nextQueued`,
 * `stalledSince`, `oldestQueuedAt` and `queueAcrossMembers` walk the whole
 * collection, because the pipeline is an installation-wide queue with an
 * Owner-set concurrency. The base class keys its map by `userId:id` precisely
 * so a spec that forgets to scope a lookup fails here — so these four have to
 * opt out of that protection deliberately, which is why they are written out
 * rather than inherited.
 *
 * **The pagination is a slice and the cursor is an index.** The Mongo adapter
 * uses a keyset cursor over `(addedAt, _id)`; reproducing that here would be
 * reimplementing the thing under test. What the two share is the *contract* —
 * newest first, `endCursor` null on the last page — and that is what the specs
 * assert.
 */
export class InMemoryLinkRepository extends LinkRepository {
  readonly #rows: InnerLinkStore;

  constructor(inner: InnerLinkStore) {
    super();
    this.#rows = inner;
  }

  async findById(userId: string, id: string): Promise<Link | null> {
    return this.#rows.findById(userId, id);
  }

  async save(link: Link): Promise<void> {
    await this.#rows.save(link);
  }

  async remove(link: Link): Promise<void> {
    await this.#rows.remove(link);
  }

  async findByUrl(userId: string, normalizedUrl: string): Promise<Link | null> {
    return (
      this.#rows
        .all()
        .find(
          (link) =>
            link.userId === userId &&
            link.normalizedUrl === normalizedUrl &&
            !link.isDeleted,
        ) ?? null
    );
  }

  async listFor(
    userId: string,
    options: {
      status?: LinkStatus;
      kind?: string;
      first: number;
      after?: string | null;
    },
  ): Promise<LinkPage> {
    const matching = this.#rows
      .all()
      .filter((link) => link.userId === userId && !link.isDeleted)
      .filter((link) => !options.status || link.status === options.status)
      .filter((link) => !options.kind || link.kind === options.kind)
      .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());

    const from = options.after ? Number(options.after) : 0;
    const page = matching.slice(from, from + options.first);
    const hasNextPage = from + options.first < matching.length;
    return {
      rows: page,
      hasNextPage,
      endCursor: hasNextPage ? String(from + options.first) : null,
    };
  }

  async childrenOf(userId: string, parentLinkId: string): Promise<Link[]> {
    return this.#rows
      .all()
      .filter(
        (link) =>
          link.userId === userId &&
          link.parentLinkId === parentLinkId &&
          !link.isDeleted,
      )
      .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime());
  }

  async nextQueued(limit: number): Promise<Link[]> {
    return this.#rows
      .all()
      .filter((link) => link.status === 'queued' && !link.isDeleted)
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .slice(0, limit);
  }

  async stalledSince(before: Date, limit: number): Promise<Link[]> {
    return this.#rows
      .all()
      .filter(
        (link) =>
          (link.status === 'fetching' ||
            link.status === 'extracting' ||
            link.status === 'summarising') &&
          link.updatedAt < before &&
          !link.isDeleted,
      )
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .slice(0, limit);
  }

  async oldestQueuedAt(): Promise<Date | null> {
    const oldest = this.#rows
      .all()
      .filter((link) => link.status === 'queued' && !link.isDeleted)
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())[0];
    return oldest?.updatedAt ?? null;
  }

  async findAnyById(id: string): Promise<Link | null> {
    return this.#rows.all().find((link) => link.id === id) ?? null;
  }

  async queueAcrossMembers(
    status: LinkStatus | undefined,
    limit: number,
  ): Promise<Link[]> {
    return this.#rows
      .all()
      .filter((link) => !link.isDeleted)
      .filter((link) =>
        status ? link.status === status : link.status !== 'done',
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit);
  }

  async countAddedSince(userId: string, since: Date): Promise<number> {
    return this.#rows
      .all()
      .filter((link) => link.userId === userId && link.addedAt >= since).length;
  }

  async doneWithTags(
    userId: string,
    tags: string[],
    limit: number,
  ): Promise<Link[]> {
    if (tags.length === 0) return [];
    const wanted = new Set(tags);
    return this.#rows
      .all()
      .filter(
        (link) =>
          link.userId === userId &&
          link.status === 'done' &&
          link.docId !== null &&
          !link.isDeleted &&
          link.tags.some((tag) => wanted.has(tag)),
      )
      .sort(
        (a, b) =>
          (b.processedAt?.getTime() ?? 0) - (a.processedAt?.getTime() ?? 0),
      )
      .slice(0, limit);
  }

  async pullSince(userId: string, since: Date | null): Promise<Link[]> {
    return this.#rows
      .all()
      .filter((link) => link.userId === userId)
      .filter((link) => !since || link.updatedAt > since)
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
  }

  async tombstonesBefore(before: Date, userId?: string): Promise<Link[]> {
    return this.#rows
      .all()
      .filter((link) => link.isDeleted && link.deletedAt! < before)
      .filter((link) => !userId || link.userId === userId);
  }

  async purgeTombstonesBefore(before: Date, userId?: string): Promise<number> {
    const doomed = this.#rows
      .all()
      .filter((link) => link.isDeleted && link.deletedAt! < before)
      .filter((link) => !userId || link.userId === userId);
    for (const link of doomed) await this.#rows.remove(link);
    return doomed.length;
  }

  async removeAllFor(userId: string): Promise<number> {
    const doomed = this.#rows.all().filter((link) => link.userId === userId);
    for (const link of doomed) await this.#rows.remove(link);
    return doomed.length;
  }

  /** Test affordance, matching every other in-memory adapter in this codebase. */
  all(): Link[] {
    return this.#rows.all();
  }
}

export class InnerLinkStore extends InMemoryRepositoryBase<Link> {}

export class InMemoryReadingRepository extends ReadingRepository {
  readonly #rows: InnerReadingStore;

  constructor(inner: InnerReadingStore) {
    super();
    this.#rows = inner;
  }

  async findById(userId: string, id: string): Promise<Reading | null> {
    return this.#rows.findById(userId, id);
  }

  async save(reading: Reading): Promise<void> {
    await this.#rows.save(reading);
  }

  async remove(reading: Reading): Promise<void> {
    await this.#rows.remove(reading);
  }

  async forLink(userId: string, linkId: string): Promise<Reading | null> {
    return (
      this.#rows
        .all()
        .filter(
          (reading) => reading.userId === userId && reading.linkId === linkId,
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    );
  }

  async forLinks(userId: string, linkIds: string[]): Promise<Reading[]> {
    const wanted = new Set(linkIds);
    return this.#rows
      .all()
      .filter(
        (reading) => reading.userId === userId && wanted.has(reading.linkId),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async removeForLinks(userId: string, linkIds: string[]): Promise<number> {
    const wanted = new Set(linkIds);
    const doomed = this.#rows
      .all()
      .filter(
        (reading) => reading.userId === userId && wanted.has(reading.linkId),
      );
    for (const reading of doomed) await this.#rows.remove(reading);
    return doomed.length;
  }

  async removeAllFor(userId: string): Promise<number> {
    const doomed = this.#rows
      .all()
      .filter((reading) => reading.userId === userId);
    for (const reading of doomed) await this.#rows.remove(reading);
    return doomed.length;
  }

  all(): Reading[] {
    return this.#rows.all();
  }
}

export class InnerReadingStore extends InMemoryRepositoryBase<Reading> {}

export class InMemorySuggestionRepository extends SuggestionRepository {
  readonly #rows: InnerSuggestionStore;

  constructor(inner: InnerSuggestionStore) {
    super();
    this.#rows = inner;
  }

  async findById(userId: string, id: string): Promise<Suggestion | null> {
    return this.#rows.findById(userId, id);
  }

  async save(suggestion: Suggestion): Promise<void> {
    await this.#rows.save(suggestion);
  }

  async remove(suggestion: Suggestion): Promise<void> {
    await this.#rows.remove(suggestion);
  }

  async listFor(
    userId: string,
    status?: SuggestionStatus,
  ): Promise<Suggestion[]> {
    return this.#rows
      .all()
      .filter((row) => row.userId === userId)
      .filter((row) => !status || row.status === status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async forSession(
    userId: string,
    sessionId: string,
  ): Promise<Suggestion | null> {
    return (
      this.#rows
        .all()
        .filter((row) => row.userId === userId && row.sessionId === sessionId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    );
  }

  async byAcceptedSession(
    userId: string,
    sessionId: string,
  ): Promise<Suggestion | null> {
    return (
      this.#rows
        .all()
        .find(
          (row) =>
            row.userId === userId && row.acceptedSessionId === sessionId,
        ) ?? null
    );
  }

  async removeAllFor(userId: string): Promise<number> {
    const doomed = this.#rows.all().filter((row) => row.userId === userId);
    for (const row of doomed) await this.#rows.remove(row);
    return doomed.length;
  }

  all(): Suggestion[] {
    return this.#rows.all();
  }
}

export class InnerSuggestionStore extends InMemoryRepositoryBase<Suggestion> {}

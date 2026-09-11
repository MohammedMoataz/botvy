import { Injectable } from '@nestjs/common';
import { Types, type Model } from 'mongoose';
import {
  decodeCursor,
  encodeCursor,
  mongoAfter,
  mongoSort,
  positionOf,
  type SortKey,
} from '../../../shared/persistence/keyset-cursor.js';
import {
  MongoRepositoryBase,
  type OutboxInsert,
} from '../../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../../shared/persistence/mongo/mongo-unit-of-work.js';
import type { Mapper } from '../../../shared/persistence/ports/mapper.js';
import {
  Link,
  type LinkState,
  type LinkStatus,
} from '../domain/link.aggregate.js';
import {
  LinkRepository,
  ReadingRepository,
  SuggestionRepository,
  type LinkPage,
} from '../domain/knowledge.repositories.js';
import { Reading, type ReadingState } from '../domain/reading.js';
import {
  Suggestion,
  type SuggestionState,
  type SuggestionStatus,
} from '../domain/suggestion.aggregate.js';
import type { LinkKind } from '../domain/url-kind.js';

/**
 * A fresh ObjectId as a string, for the two server-only collections.
 *
 * `knowledge_docs` and `suggestions` are never created by a client, so there is
 * nothing to mint offline and no retried create to make idempotent — which is
 * the whole reason the rest of this system uses client-minted UUIDv7. An
 * ObjectId sorts by creation time like a v7 does and is four bytes smaller.
 */
export function newServerId(): string {
  return new Types.ObjectId().toHexString();
}

// --------------------------------------------------------------------- links

export interface LinkDoc extends Omit<LinkState, 'id'> {
  _id: string;
  schemaVersion: number;
}

const linkMapper: Mapper<Link, LinkDoc> = {
  toDomain(doc) {
    return Link.rehydrate({
      id: doc._id,
      userId: doc.userId,
      url: doc.url,
      normalizedUrl: doc.normalizedUrl,
      kind: doc.kind,
      externalId: doc.externalId ?? null,
      parentLinkId: doc.parentLinkId ?? null,
      title: doc.title ?? null,
      tags: doc.tags ?? [],
      status: doc.status ?? 'queued',
      failReason: doc.failReason ?? null,
      attempts: doc.attempts ?? 0,
      docId: doc.docId ?? null,
      skippedCount: doc.skippedCount ?? null,
      addedAt: doc.addedAt,
      processedAt: doc.processedAt ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      deletedAt: doc.deletedAt ?? null,
    });
  },
  toPersistence(link) {
    return {
      _id: link.id,
      userId: link.userId,
      url: link.url,
      normalizedUrl: link.normalizedUrl,
      kind: link.kind,
      externalId: link.externalId,
      parentLinkId: link.parentLinkId,
      title: link.title,
      tags: link.tags,
      status: link.status,
      failReason: link.failReason,
      attempts: link.attempts,
      docId: link.docId,
      skippedCount: link.skippedCount,
      addedAt: link.addedAt,
      processedAt: link.processedAt,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
      deletedAt: link.deletedAt,
      schemaVersion: link.schemaVersion,
    };
  },
};

/** Newest first, `_id` as the tie-break, which is what the cursor encodes. */
const LINK_SORT: SortKey[] = [
  { field: 'addedAt', direction: 'desc' },
  { field: '_id', direction: 'desc' },
];

@Injectable()
export class MongoLinkRepository extends LinkRepository {
  readonly #inner: InnerLinkRepository;

  constructor(
    private readonly model: Model<LinkDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerLinkRepository(model, outbox);
  }

  async findById(userId: string, id: string): Promise<Link | null> {
    return this.#inner.findById(userId, id);
  }

  async save(link: Link): Promise<void> {
    await this.#inner.save(link);
  }

  async remove(link: Link): Promise<void> {
    await this.#inner.remove(link);
  }

  async findByUrl(
    userId: string,
    normalizedUrl: string,
  ): Promise<Link | null> {
    const doc = await this.model
      .findOne({ userId, normalizedUrl, deletedAt: null })
      .session(MongoUnitOfWork.currentSession())
      .lean<LinkDoc>()
      .exec();
    return doc ? linkMapper.toDomain(doc) : null;
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
    const query: Record<string, unknown> = { userId, deletedAt: null };
    if (options.status) query.status = options.status;
    if (options.kind) query.kind = options.kind;

    if (options.after) {
      const position = decodeCursor(options.after);
      if (position) Object.assign(query, mongoAfter(LINK_SORT, position));
    }

    const docs = await this.model
      .find(query)
      .sort(mongoSort(LINK_SORT))
      .limit(options.first + 1)
      .session(MongoUnitOfWork.currentSession())
      .lean<LinkDoc[]>()
      .exec();

    const hasNextPage = docs.length > options.first;
    const page = hasNextPage ? docs.slice(0, options.first) : docs;
    const last = page.at(-1);

    return {
      rows: page.map((doc) => linkMapper.toDomain(doc)),
      hasNextPage,
      endCursor:
        hasNextPage && last
          ? encodeCursor(
              positionOf(
                LINK_SORT,
                last as unknown as Record<string, unknown>,
                last._id,
              ),
            )
          : null,
    };
  }

  async childrenOf(userId: string, parentLinkId: string): Promise<Link[]> {
    const docs = await this.model
      .find({ userId, parentLinkId, deletedAt: null })
      .sort({ addedAt: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<LinkDoc[]>()
      .exec();
    return docs.map((doc) => linkMapper.toDomain(doc));
  }

  async nextQueued(limit: number): Promise<Link[]> {
    const docs = await this.model
      .find({ status: 'queued', deletedAt: null })
      .sort({ updatedAt: 1 })
      .limit(limit)
      .session(MongoUnitOfWork.currentSession())
      .lean<LinkDoc[]>()
      .exec();
    return docs.map((doc) => linkMapper.toDomain(doc));
  }

  async stalledSince(before: Date, limit: number): Promise<Link[]> {
    const docs = await this.model
      .find({
        status: { $in: ['fetching', 'extracting', 'summarising'] },
        updatedAt: { $lt: before },
        deletedAt: null,
      })
      .sort({ updatedAt: 1 })
      .limit(limit)
      .session(MongoUnitOfWork.currentSession())
      .lean<LinkDoc[]>()
      .exec();
    return docs.map((doc) => linkMapper.toDomain(doc));
  }

  async oldestQueuedAt(): Promise<Date | null> {
    const doc = await this.model
      .findOne({ status: 'queued', deletedAt: null })
      .sort({ updatedAt: 1 })
      .select({ updatedAt: 1 })
      .lean<{ updatedAt: Date }>()
      .exec();
    return doc?.updatedAt ?? null;
  }

  async findAnyById(id: string): Promise<Link | null> {
    const doc = await this.model
      .findOne({ _id: id })
      .session(MongoUnitOfWork.currentSession())
      .lean<LinkDoc>()
      .exec();
    return doc ? linkMapper.toDomain(doc) : null;
  }

  async queueAcrossMembers(
    status: LinkStatus | undefined,
    limit: number,
  ): Promise<Link[]> {
    const query: Record<string, unknown> = { deletedAt: null };
    if (status) query.status = status;
    // Unfinished first, then most recently touched — which is what an Owner
    // opening the queue is looking for. A `done` row is in the list only
    // because they asked for that status by name.
    else query.status = { $ne: 'done' };

    const docs = await this.model
      .find(query)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean<LinkDoc[]>()
      .exec();
    return docs.map((doc) => linkMapper.toDomain(doc));
  }

  async countAddedSince(userId: string, since: Date): Promise<number> {
    return this.model
      .countDocuments({ userId, addedAt: { $gte: since } })
      .session(MongoUnitOfWork.currentSession())
      .exec();
  }

  async doneWithTags(
    userId: string,
    tags: string[],
    limit: number,
  ): Promise<Link[]> {
    if (tags.length === 0) return [];
    const docs = await this.model
      .find({
        userId,
        status: 'done',
        deletedAt: null,
        docId: { $ne: null },
        tags: { $in: tags },
      })
      .sort({ processedAt: -1 })
      .limit(limit)
      .session(MongoUnitOfWork.currentSession())
      .lean<LinkDoc[]>()
      .exec();
    return docs.map((doc) => linkMapper.toDomain(doc));
  }

  async pullSince(userId: string, since: Date | null): Promise<Link[]> {
    const filter: Record<string, unknown> = { userId };
    if (since) filter.updatedAt = { $gt: since };
    const docs = await this.model
      .find(filter)
      .sort({ updatedAt: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<LinkDoc[]>()
      .exec();
    return docs.map((doc) => linkMapper.toDomain(doc));
  }

  async tombstonesBefore(before: Date, userId?: string): Promise<Link[]> {
    const filter: Record<string, unknown> = {
      deletedAt: { $ne: null, $lt: before },
    };
    if (userId) filter.userId = userId;
    const docs = await this.model
      .find(filter)
      .session(MongoUnitOfWork.currentSession())
      .lean<LinkDoc[]>()
      .exec();
    return docs.map((doc) => linkMapper.toDomain(doc));
  }

  async purgeTombstonesBefore(before: Date, userId?: string): Promise<number> {
    const filter: Record<string, unknown> = {
      deletedAt: { $ne: null, $lt: before },
    };
    if (userId) filter.userId = userId;
    const result = await this.model
      .deleteMany(filter, {
        session: MongoUnitOfWork.currentSession() ?? undefined,
      })
      .exec();
    return result.deletedCount;
  }

  async removeAllFor(userId: string): Promise<number> {
    const result = await this.model
      .deleteMany(
        { userId },
        { session: MongoUnitOfWork.currentSession() ?? undefined },
      )
      .exec();
    return result.deletedCount;
  }
}

class InnerLinkRepository extends MongoRepositoryBase<Link, LinkDoc> {
  protected readonly mapper = linkMapper;

  constructor(
    protected readonly model: Model<LinkDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

// ------------------------------------------------------------------ readings

export interface ReadingDoc extends Omit<ReadingState, 'id'> {
  _id: string;
}

const readingMapper: Mapper<Reading, ReadingDoc> = {
  toDomain(doc) {
    return Reading.rehydrate({
      id: doc._id,
      userId: doc.userId,
      linkId: doc.linkId,
      sourceUrl: doc.sourceUrl,
      title: doc.title ?? null,
      author: doc.author ?? null,
      publishedAt: doc.publishedAt ?? null,
      text: doc.text ?? '',
      transcript: doc.transcript ?? null,
      summary: doc.summary,
      keyPoints: doc.keyPoints ?? [],
      media: doc.media ?? [],
      durationSec: doc.durationSec ?? null,
      model: doc.model,
      tokens: doc.tokens ?? 0,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  },
  toPersistence(reading) {
    return {
      _id: reading.id,
      userId: reading.userId,
      linkId: reading.linkId,
      sourceUrl: reading.sourceUrl,
      title: reading.title,
      author: reading.author,
      publishedAt: reading.publishedAt,
      text: reading.text,
      transcript: reading.transcript,
      summary: reading.summary,
      keyPoints: reading.keyPoints,
      media: reading.media,
      durationSec: reading.durationSec,
      model: reading.model,
      tokens: reading.tokens,
      createdAt: reading.createdAt,
      updatedAt: reading.updatedAt,
    };
  },
};

@Injectable()
export class MongoReadingRepository extends ReadingRepository {
  readonly #inner: InnerReadingRepository;

  constructor(
    private readonly model: Model<ReadingDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerReadingRepository(model, outbox);
  }

  async findById(userId: string, id: string): Promise<Reading | null> {
    return this.#inner.findById(userId, id);
  }

  async save(reading: Reading): Promise<void> {
    await this.#inner.save(reading);
  }

  async remove(reading: Reading): Promise<void> {
    await this.#inner.remove(reading);
  }

  /**
   * The newest document for a link.
   *
   * Newest, because re-reading writes a second document rather than editing the
   * first — see `Reading`'s note on why. The link's own `docId` names the one
   * that is current, and this is the read for callers that have the link id and
   * not the document id.
   */
  async forLink(userId: string, linkId: string): Promise<Reading | null> {
    const doc = await this.model
      .findOne({ userId, linkId })
      .sort({ createdAt: -1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<ReadingDoc>()
      .exec();
    return doc ? readingMapper.toDomain(doc) : null;
  }

  async forLinks(userId: string, linkIds: string[]): Promise<Reading[]> {
    if (linkIds.length === 0) return [];
    const docs = await this.model
      .find({ userId, linkId: { $in: linkIds } })
      .sort({ createdAt: -1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<ReadingDoc[]>()
      .exec();
    return docs.map((doc) => readingMapper.toDomain(doc));
  }

  async removeForLinks(userId: string, linkIds: string[]): Promise<number> {
    if (linkIds.length === 0) return 0;
    const result = await this.model
      .deleteMany(
        { userId, linkId: { $in: linkIds } },
        { session: MongoUnitOfWork.currentSession() ?? undefined },
      )
      .exec();
    return result.deletedCount;
  }

  async removeAllFor(userId: string): Promise<number> {
    const result = await this.model
      .deleteMany(
        { userId },
        { session: MongoUnitOfWork.currentSession() ?? undefined },
      )
      .exec();
    return result.deletedCount;
  }
}

class InnerReadingRepository extends MongoRepositoryBase<Reading, ReadingDoc> {
  protected readonly mapper = readingMapper;

  constructor(
    protected readonly model: Model<ReadingDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

// --------------------------------------------------------------- suggestions

export interface SuggestionDoc extends Omit<SuggestionState, 'id'> {
  _id: string;
}

const suggestionMapper: Mapper<Suggestion, SuggestionDoc> = {
  toDomain(doc) {
    return Suggestion.rehydrate({
      id: doc._id,
      userId: doc.userId,
      kind: doc.kind ?? 'session',
      forDate: doc.forDate,
      sport: doc.sport,
      sessionId: doc.sessionId ?? null,
      draft: doc.draft,
      sourceLinkIds: doc.sourceLinkIds ?? [],
      rationale: doc.rationale ?? '',
      status: doc.status ?? 'pending',
      acceptedSessionId: doc.acceptedSessionId ?? null,
      outcome: doc.outcome ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  },
  toPersistence(suggestion) {
    return {
      _id: suggestion.id,
      userId: suggestion.userId,
      kind: suggestion.kind,
      forDate: suggestion.forDate,
      sport: suggestion.sport,
      sessionId: suggestion.sessionId,
      draft: suggestion.draft,
      sourceLinkIds: suggestion.sourceLinkIds,
      rationale: suggestion.rationale,
      status: suggestion.status,
      acceptedSessionId: suggestion.acceptedSessionId,
      outcome: suggestion.outcome,
      createdAt: suggestion.createdAt,
      updatedAt: suggestion.updatedAt,
    };
  },
};

@Injectable()
export class MongoSuggestionRepository extends SuggestionRepository {
  readonly #inner: InnerSuggestionRepository;

  constructor(
    private readonly model: Model<SuggestionDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerSuggestionRepository(model, outbox);
  }

  async findById(userId: string, id: string): Promise<Suggestion | null> {
    return this.#inner.findById(userId, id);
  }

  async save(suggestion: Suggestion): Promise<void> {
    await this.#inner.save(suggestion);
  }

  async remove(suggestion: Suggestion): Promise<void> {
    await this.#inner.remove(suggestion);
  }

  async listFor(
    userId: string,
    status?: SuggestionStatus,
  ): Promise<Suggestion[]> {
    const query: Record<string, unknown> = { userId };
    if (status) query.status = status;
    const docs = await this.model
      .find(query)
      .sort({ createdAt: -1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<SuggestionDoc[]>()
      .exec();
    return docs.map((doc) => suggestionMapper.toDomain(doc));
  }

  async forSession(
    userId: string,
    sessionId: string,
  ): Promise<Suggestion | null> {
    const doc = await this.model
      .findOne({ userId, sessionId })
      .sort({ createdAt: -1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<SuggestionDoc>()
      .exec();
    return doc ? suggestionMapper.toDomain(doc) : null;
  }

  async byAcceptedSession(
    userId: string,
    sessionId: string,
  ): Promise<Suggestion | null> {
    const doc = await this.model
      .findOne({ userId, acceptedSessionId: sessionId })
      .session(MongoUnitOfWork.currentSession())
      .lean<SuggestionDoc>()
      .exec();
    return doc ? suggestionMapper.toDomain(doc) : null;
  }

  async removeAllFor(userId: string): Promise<number> {
    const result = await this.model
      .deleteMany(
        { userId },
        { session: MongoUnitOfWork.currentSession() ?? undefined },
      )
      .exec();
    return result.deletedCount;
  }
}

class InnerSuggestionRepository extends MongoRepositoryBase<
  Suggestion,
  SuggestionDoc
> {
  protected readonly mapper = suggestionMapper;

  constructor(
    protected readonly model: Model<SuggestionDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

/** Narrowing helper for the module's factories. */
export type { LinkKind };

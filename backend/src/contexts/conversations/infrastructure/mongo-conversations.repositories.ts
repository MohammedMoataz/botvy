import { Injectable } from '@nestjs/common';
import { Types, type Model } from 'mongoose';
import {
  MongoRepositoryBase,
  type OutboxInsert,
} from '../../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../../shared/persistence/mongo/mongo-unit-of-work.js';
import type { Mapper } from '../../../shared/persistence/ports/mapper.js';
import {
  Conversation,
  type ConversationKind,
  type ConversationState,
} from '../domain/conversation.aggregate.js';
import { Message, type MessageState } from '../domain/message.aggregate.js';
import {
  ConversationRepository,
  MessageRepository,
} from '../domain/conversations.repositories.js';

export interface ConversationDoc extends Omit<ConversationState, 'id'> {
  _id: string;
  schemaVersion: number;
}

/**
 * The stored message.
 *
 * `_id` is typed as either, and that is not hedging — it is the round trip.
 * `MessageSchema` declares no `_id: false`, so the path keeps its default
 * ObjectId type: what goes in as a 24-character hex string comes back out as an
 * `ObjectId`, and a mapper that read `doc._id` straight into the aggregate's
 * `id: string` would hand every caller `[object Object]` — a value that looks
 * like a string to TypeScript and is not one at runtime. So `toDomain` calls
 * `String()` on it, which is a no-op for the string a spec inserts and the hex
 * digits for the ObjectId Mongo hands back.
 *
 * There is no `updatedAt` here, because `MessageState` has none: a message is
 * immutable, the phone pulls it by `seq` rather than by a modification cursor,
 * and a column added to this document can never reach a device that already
 * holds the row. Which incidentally means the base's optimistic filter always
 * takes its `{ updatedAt: { $exists: false } }` branch for this collection —
 * correct rather than lucky, since the only write that ever happens here is the
 * first insert and a repeated one is the same `$set` over the same values.
 */
export interface MessageDoc extends Omit<MessageState, 'id'> {
  _id: Types.ObjectId | string;
  schemaVersion: number;
}

/**
 * Exported, unlike its sibling below, and for one reason: it is the standard
 * the backfill migration is held to.
 *
 * `migrations/mongo/20260912000000-backfill-pinned-conversations.cjs` writes
 * this same document by hand, because a CommonJS migration cannot reach a Nest
 * handler or a Mongoose model. Two writers of one document is a drift risk, and
 * the only honest way to close it is a test that compares them —
 * `backfill-pinned.spec.ts` asserts the migration's row is key-for-key and
 * value-for-value what `toPersistence` produces here. A field added to the
 * aggregate and to this mapper, and forgotten there, fails that test.
 */
export const conversationMapper: Mapper<Conversation, ConversationDoc> = {
  toDomain(doc) {
    return Conversation.rehydrate({
      id: doc._id,
      userId: doc.userId,
      kind: doc.kind,
      title: doc.title,
      pinned: doc.pinned ?? false,
      archived: doc.archived ?? false,
      clearedUpToSeq: doc.clearedUpToSeq ?? 0,
      lastMessageAt: doc.lastMessageAt ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      deletedAt: doc.deletedAt ?? null,
    });
  },
  toPersistence(conversation) {
    return {
      _id: conversation.id,
      userId: conversation.userId,
      kind: conversation.kind,
      title: conversation.title,
      pinned: conversation.pinned,
      archived: conversation.archived,
      clearedUpToSeq: conversation.clearedUpToSeq,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      deletedAt: conversation.deletedAt,
      schemaVersion: conversation.schemaVersion,
    };
  },
};

const messageMapper: Mapper<Message, MessageDoc> = {
  toDomain(doc) {
    return Message.rehydrate({
      id: String(doc._id),
      userId: doc.userId,
      conversationId: doc.conversationId,
      seq: doc.seq,
      role: doc.role,
      content: doc.content,
      clientId: doc.clientId ?? null,
      composedAt: doc.composedAt ?? null,
      /*
       * Both nullable, both defaulted, and both were missing from this mapper
       * for the length of the change that added them to `MessageState`.
       *
       * `MessageSchema` declared `usage` and `intent` and the aggregate carried
       * them, so the fields looked implemented from either end — but the mapper
       * is the only thing that moves a value between the two, and a round trip
       * that drops a field is indistinguishable from a field nobody set. What
       * that would have cost is exactly the loop `message.aggregate.ts`
       * describes: `conversations.MessageSent` carries the usage from the
       * aggregate, so the event would still have been right and Operations
       * would still have written its `usage_log` row, while the row an operator
       * reads beside the message stayed null for ever. `intent` is worse in a
       * quieter way — `{ cancelled: true }` is the only record that a partial
       * answer was stopped by the member rather than truncated by a crash, and
       * messages are immutable, so a value not written on the insert can never
       * be written at all.
       */
      usage: doc.usage ?? null,
      intent: doc.intent ?? null,
      createdAt: doc.createdAt,
    });
  },
  toPersistence(message) {
    return {
      // The aggregate's id, sent explicitly rather than left to Mongo.
      //
      // The alternative — insert without an `_id` and let the server mint one —
      // would mean the aggregate that raised `conversations.MessageSent` and
      // the row that was written disagree about their own identity, because the
      // event's `aggregate.id` is stamped from `this.id` before any store is
      // touched. A consumer following that id would find nothing. So the id is
      // minted where the aggregate is built (`MESSAGE_ID` in the handler) and
      // travels here; the string is a valid ObjectId hex, so Mongoose casts it
      // to the path's declared type and the stored `_id` is exactly the id the
      // event named.
      _id: message.id,
      userId: message.userId,
      conversationId: message.conversationId,
      seq: message.seq,
      role: message.role,
      content: message.content,
      clientId: message.clientId,
      composedAt: message.composedAt,
      // Written explicitly as null rather than omitted, because `$set` leaves
      // a key it is not given alone: an omitted `usage` could never *clear* a
      // stored one. It cannot arise for an immutable row whose only write is
      // its insert, and it is written this way so that the mapper says what the
      // document contains rather than what this one write path happens to need.
      usage: message.usage,
      intent: message.intent,
      createdAt: message.createdAt,
      schemaVersion: message.schemaVersion,
    };
  },
};

/** A fresh ObjectId as a string, for `Message.write`. */
export function newMessageId(): string {
  return new Types.ObjectId().toHexString();
}

@Injectable()
export class MongoConversationRepository extends ConversationRepository {
  readonly #inner: InnerConversationRepository;

  constructor(
    private readonly model: Model<ConversationDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerConversationRepository(model, outbox);
  }

  async findById(userId: string, id: string): Promise<Conversation | null> {
    return this.#inner.findById(userId, id);
  }

  async save(conversation: Conversation): Promise<void> {
    await this.#inner.save(conversation);
  }

  async remove(conversation: Conversation): Promise<void> {
    await this.#inner.remove(conversation);
  }

  /**
   * The lookup that makes a replayed `identity.UserRegistered` a no-op.
   *
   * Deliberately a read the bootstrap handler branches on, not a duplicate-key
   * error it catches. The partial unique index on `{ userId, kind }` is still
   * there and still the last word — two relay workers delivering the same event
   * at the same instant is a race no read can close — but a handler whose only
   * idempotency is a caught write error is a handler that also swallows a
   * failing connection, a validation refusal and a full disk, and reports all
   * three as "already there".
   *
   * Scoped away from tombstones on purpose: the two pinned kinds are
   * `isProtected` and cannot be deleted, so a `deletedAt` row here can only be
   * a `free` chat the member removed, and treating it as the member's current
   * chat of that kind would write a touch into something they threw away.
   */
  async byKind(
    userId: string,
    kind: ConversationKind,
  ): Promise<Conversation | null> {
    const doc = await this.model
      .findOne({ userId, kind, deletedAt: null })
      .session(MongoUnitOfWork.currentSession())
      .lean<ConversationDoc>()
      .exec();
    return doc ? conversationMapper.toDomain(doc) : null;
  }

  /**
   * The member's chat list, most recently spoken-in first.
   *
   * `lastMessageAt` is null for a chat nobody has written in, and Mongo sorts
   * null before every date on an ascending sort and after it on a descending
   * one — so a freshly registered member's two pinned chats sort last here,
   * which is right: `createdAt` breaks the tie so the pair still come back in a
   * stable order rather than whichever the index happened to walk first.
   */
  async listFor(
    userId: string,
    includeArchived: boolean,
  ): Promise<Conversation[]> {
    const filter: Record<string, unknown> = { userId, deletedAt: null };
    if (!includeArchived) filter.archived = false;
    const docs = await this.model
      .find(filter)
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<ConversationDoc[]>()
      .exec();
    return docs.map((doc) => conversationMapper.toDomain(doc));
  }

  /** Tombstones included — on a delta they are the only way a deletion travels. */
  async pullSince(userId: string, since: Date | null): Promise<Conversation[]> {
    const filter: Record<string, unknown> = { userId };
    if (since) filter.updatedAt = { $gt: since };
    const docs = await this.model
      .find(filter)
      .sort({ updatedAt: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<ConversationDoc[]>()
      .exec();
    return docs.map((doc) => conversationMapper.toDomain(doc));
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

@Injectable()
export class MongoMessageRepository extends MessageRepository {
  readonly #inner: InnerMessageRepository;

  constructor(
    private readonly model: Model<MessageDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerMessageRepository(model, outbox);
  }

  async findById(userId: string, id: string): Promise<Message | null> {
    // A malformed id would otherwise be a `CastError` out of Mongoose rather
    // than the "no such message" this port promises, and the caller cannot tell
    // the two apart. Same guard, same reason, as the alert repository's claim.
    if (!Types.ObjectId.isValid(id)) return null;
    return this.#inner.findById(userId, id);
  }

  async save(message: Message): Promise<void> {
    await this.#inner.save(message);
  }

  async remove(message: Message): Promise<void> {
    await this.#inner.remove(message);
  }

  /**
   * The phone's pull: everything after a sequence number, oldest first.
   *
   * Across every conversation, because the cursor is one number for the whole
   * transcript — which is the entire reason the counter is per member and not
   * per chat. A client that has never opened a chat still knows where it is.
   */
  /**
   * The prompt's window: sorted **descending** to take the newest, then
   * reversed so the caller reads them in the order they were said.
   *
   * Descending-then-limit is the whole difference from `inConversation`, and
   * it is why this is its own method rather than a flag: the index
   * `{ conversationId, seq }` serves both directions, and a boolean parameter
   * would leave two callers one typo apart from silently reading opposite ends
   * of a member's transcript.
   */
  async latestInConversation(
    userId: string,
    conversationId: string,
    floorSeq: number,
    beforeSeq: number,
    limit: number,
  ): Promise<Message[]> {
    const docs = await this.model
      .find({
        userId,
        conversationId,
        seq: { $gt: floorSeq, $lt: beforeSeq },
      })
      .sort({ seq: -1 })
      .limit(limit)
      .session(MongoUnitOfWork.currentSession())
      .lean<MessageDoc[]>()
      .exec();
    return docs.reverse().map((doc) => messageMapper.toDomain(doc));
  }

  /**
   * The replay check for the offline batch.
   *
   * Served by the partial unique index on `(userId, clientId)` — partial on
   * `$exists: true` because every message this server writes has none, and
   * Mongo treats missing and null as one value for uniqueness.
   */
  async byClientId(userId: string, clientId: string): Promise<Message | null> {
    const doc = await this.model
      .findOne({ userId, clientId })
      .session(MongoUnitOfWork.currentSession())
      .lean<MessageDoc>()
      .exec();
    return doc ? messageMapper.toDomain(doc) : null;
  }

  async afterSeq(
    userId: string,
    afterSeq: number,
    limit: number,
  ): Promise<Message[]> {
    const docs = await this.model
      .find({ userId, seq: { $gt: afterSeq } })
      .sort({ seq: 1 })
      .limit(limit)
      .session(MongoUnitOfWork.currentSession())
      .lean<MessageDoc[]>()
      .exec();
    return docs.map((doc) => messageMapper.toDomain(doc));
  }

  /**
   * One chat's transcript, oldest first from a floor.
   *
   * Ascending, like the pull above, and not "newest first" as a screen paging
   * backwards might want: `seq > afterSeq` walked in descending order is the
   * mismatch that returned the wrong page from the Reminders read model — a
   * descending sort with an ascending filter. A screen that wants the newest
   * page asks for the floor it already holds and reverses in the client, or P4
   * adds a `beforeSeq` method whose filter and sort agree with each other.
   */
  async inConversation(
    userId: string,
    conversationId: string,
    afterSeq: number,
    limit: number,
  ): Promise<Message[]> {
    const docs = await this.model
      .find({ userId, conversationId, seq: { $gt: afterSeq } })
      .sort({ seq: 1 })
      .limit(limit)
      .session(MongoUnitOfWork.currentSession())
      .lean<MessageDoc[]>()
      .exec();
    return docs.map((doc) => messageMapper.toDomain(doc));
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

class InnerConversationRepository extends MongoRepositoryBase<
  Conversation,
  ConversationDoc
> {
  protected readonly mapper = conversationMapper;

  constructor(
    protected readonly model: Model<ConversationDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

class InnerMessageRepository extends MongoRepositoryBase<Message, MessageDoc> {
  protected readonly mapper = messageMapper;

  constructor(
    protected readonly model: Model<MessageDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

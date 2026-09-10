import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/cqrs/domain-event.js';
import type { InMemoryUnitOfWork } from '../../../shared/persistence/memory/in-memory-unit-of-work.js';
import { StaleWriteError } from '../../../shared/persistence/ports/errors.js';
import {
  Conversation,
  type ConversationKind,
  type ConversationState,
} from '../domain/conversation.aggregate.js';
import { Message, type MessageState } from '../domain/message.aggregate.js';
import {
  ConversationRepository,
  MessageRepository,
  SeqPort,
} from '../domain/conversations.repositories.js';

/**
 * The three adapters every Conversations handler spec binds.
 *
 * Held to the same promises as the Mongo ones, because a handler that passes
 * here and misbehaves against a real database is worse than no test at all:
 *
 * 1. **Events are pulled on save**, so an assertion that a handler raised
 *    `conversations.MessageSent` means something. An adapter that left the
 *    events on the aggregate would let every such assertion pass vacuously.
 * 2. **`StaleWriteError` on an older copy**, the refusal the optimistic filter
 *    gives.
 * 3. **`byKind` skips tombstones**, matching the Mongo filter — the difference
 *    decides whether a touch can be written into a chat the member deleted, and
 *    a spec proving the handler's behaviour against a looser adapter proves the
 *    adapter, not the handler.
 * 4. **`next()` is atomic**, in the only sense a single-threaded runtime has:
 *    read and write in one synchronous turn with no `await` between them, which
 *    is what lets a spec assert consecutive sequence numbers and have the
 *    assertion mean the same thing the `$inc` means.
 */
@Injectable()
export class InMemoryConversationRepository extends ConversationRepository {
  readonly rows = new Map<string, ConversationState>();
  readonly events: DomainEvent[] = [];

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows, this.events);
  }

  async findById(userId: string, id: string): Promise<Conversation | null> {
    const row = this.rows.get(id);
    // Scoped by owner, not merely by id — a spec that forgets the scope should
    // fail here rather than in production.
    if (!row || row.userId !== userId) return null;
    return Conversation.rehydrate(structuredClone(row));
  }

  async save(conversation: Conversation): Promise<void> {
    const existing = this.rows.get(conversation.id);
    if (existing && existing.updatedAt > conversation.updatedAt) {
      throw new StaleWriteError(conversation.id);
    }
    this.#raise(conversation.pullEvents());
    this.rows.set(conversation.id, stateOf(conversation));
  }

  async remove(conversation: Conversation): Promise<void> {
    this.#raise(conversation.pullEvents());
    this.rows.delete(conversation.id);
  }

  async byKind(
    userId: string,
    kind: ConversationKind,
  ): Promise<Conversation | null> {
    const row = [...this.rows.values()].find(
      (candidate) =>
        candidate.userId === userId &&
        candidate.kind === kind &&
        candidate.deletedAt === null,
    );
    return row ? Conversation.rehydrate(structuredClone(row)) : null;
  }

  async listFor(
    userId: string,
    includeArchived: boolean,
  ): Promise<Conversation[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.userId === userId &&
          row.deletedAt === null &&
          (includeArchived || !row.archived),
      )
      .sort(byRecency)
      .map((row) => Conversation.rehydrate(structuredClone(row)));
  }

  async pullSince(userId: string, since: Date | null): Promise<Conversation[]> {
    return [...this.rows.values()]
      .filter(
        (row) => row.userId === userId && (!since || row.updatedAt > since),
      )
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .map((row) => Conversation.rehydrate(structuredClone(row)));
  }

  async removeAllFor(userId: string): Promise<number> {
    let removed = 0;
    for (const [id, row] of this.rows) {
      if (row.userId === userId) {
        this.rows.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  /**
   * To the unit of work, which is what a handler spec asserts against, and to
   * this adapter's own list, which is what a spec needs when it wants the
   * events one aggregate raised rather than everything the transaction did.
   */
  #raise(events: DomainEvent[]): void {
    this.uow.collect(events);
    this.events.push(...events);
  }
}

@Injectable()
export class InMemoryMessageRepository extends MessageRepository {
  readonly rows = new Map<string, MessageState>();
  readonly events: DomainEvent[] = [];

  #sequence = 0;

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows, this.events);
  }

  /**
   * Stands in for an ObjectId. Monotonic and zero-padded, so insertion order
   * is recoverable from the id the way it is from a real one — a spec that
   * sorts by id must not accidentally depend on lexicographic luck.
   */
  nextId(): string {
    this.#sequence += 1;
    return `message-${String(this.#sequence).padStart(8, '0')}`;
  }

  async findById(userId: string, id: string): Promise<Message | null> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return null;
    return Message.rehydrate(structuredClone(row));
  }

  async save(message: Message): Promise<void> {
    // No stale check, and no `updatedAt` to run one against: a message is
    // immutable, so the only save that can happen is the first, and a second
    // one with the same id is the same values written twice.
    this.#raise(message.pullEvents());
    this.rows.set(message.id, stateOfMessage(message));
  }

  async remove(message: Message): Promise<void> {
    this.#raise(message.pullEvents());
    this.rows.delete(message.id);
  }

  async latestInConversation(
    userId: string,
    conversationId: string,
    floorSeq: number,
    beforeSeq: number,
    limit: number,
  ): Promise<Message[]> {
    // The same window and the same order as the Mongo adapter: newest `limit`
    // inside the bounds, handed back oldest first. Two adapters that disagreed
    // about which end of a transcript "latest" means would make every handler
    // spec prove nothing about production.
    const rows = this.#bySeq(
      (row) =>
        row.userId === userId &&
        row.conversationId === conversationId &&
        row.seq > floorSeq &&
        row.seq < beforeSeq,
    );
    return rows
      .slice(-limit)
      .map((row) => Message.rehydrate(structuredClone(row)));
  }

  async byClientId(userId: string, clientId: string): Promise<Message | null> {
    const found = this.#bySeq(
      (row) => row.userId === userId && row.clientId === clientId,
    )[0];
    return found ? Message.rehydrate(structuredClone(found)) : null;
  }

  async afterSeq(
    userId: string,
    afterSeq: number,
    limit: number,
  ): Promise<Message[]> {
    return this.#bySeq((row) => row.userId === userId && row.seq > afterSeq)
      .slice(0, limit)
      .map((row) => Message.rehydrate(structuredClone(row)));
  }

  async inConversation(
    userId: string,
    conversationId: string,
    afterSeq: number,
    limit: number,
  ): Promise<Message[]> {
    return this.#bySeq(
      (row) =>
        row.userId === userId &&
        row.conversationId === conversationId &&
        row.seq > afterSeq,
    )
      .slice(0, limit)
      .map((row) => Message.rehydrate(structuredClone(row)));
  }

  async removeAllFor(userId: string): Promise<number> {
    let removed = 0;
    for (const [id, row] of this.rows) {
      if (row.userId === userId) {
        this.rows.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  /** Ascending by `seq`, matching the Mongo adapter's sort on both reads. */
  #bySeq(predicate: (row: MessageState) => boolean): MessageState[] {
    return [...this.rows.values()]
      .filter(predicate)
      .sort((a, b) => a.seq - b.seq);
  }

  #raise(events: DomainEvent[]): void {
    this.uow.collect(events);
    this.events.push(...events);
  }
}

/**
 * The counter, in memory.
 *
 * Not enlisted with the unit of work, and that asymmetry is deliberate: the
 * Mongo adapter issues its `$inc` outside the caller's session on purpose, so a
 * rolled-back transaction there leaves the number consumed. An in-memory
 * adapter that rolled the counter back would make the two disagree about the
 * one thing the sequence promises, and a spec asserting "a failed append does
 * not reuse a number" would pass here and fail in production.
 */
@Injectable()
export class InMemorySeq extends SeqPort {
  readonly values = new Map<string, number>();

  async next(userId: string): Promise<number> {
    // Read and write in one synchronous turn, no `await` between them, which is
    // the runtime's version of the atomic `findOneAndUpdate`.
    const issued = (this.values.get(userId) ?? 0) + 1;
    this.values.set(userId, issued);
    return issued;
  }

  async current(userId: string): Promise<number> {
    return this.values.get(userId) ?? 0;
  }

  async reset(userId: string): Promise<void> {
    this.values.delete(userId);
  }
}

/** Most recently spoken-in first; `createdAt` breaks the tie for silent chats. */
function byRecency(a: ConversationState, b: ConversationState): number {
  const left = a.lastMessageAt?.getTime() ?? 0;
  const right = b.lastMessageAt?.getTime() ?? 0;
  if (left !== right) return right - left;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

function stateOf(conversation: Conversation): ConversationState {
  return {
    id: conversation.id,
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
  };
}

function stateOfMessage(message: Message): MessageState {
  return {
    id: message.id,
    userId: message.userId,
    conversationId: message.conversationId,
    seq: message.seq,
    role: message.role,
    content: message.content,
    clientId: message.clientId,
    composedAt: message.composedAt,
    // The same two fields the Mongo mapper had dropped. Held to the same
    // promise for the reason the class comment gives: a handler spec that
    // asserts a stored `intent` of `{ cancelled: true }` has to be asserting
    // something the real adapter would also have kept, or the spec proves the
    // adapter rather than the handler.
    usage: message.usage,
    intent: message.intent,
    createdAt: message.createdAt,
  };
}

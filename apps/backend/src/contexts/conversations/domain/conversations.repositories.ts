import { Repository } from '../../../shared/persistence/ports/repository.js';
import { SyncableRepository } from '../../../shared/persistence/ports/syncable-repository.js';
import type { Conversation, ConversationKind } from './conversation.aggregate.js';
import type { Message } from './message.aggregate.js';

/**
 * Conversations sync as rows — the member can rename one offline in P4 — so
 * this is the syncable port. `byKind` is what makes a replayed
 * `identity.UserRegistered` a no-op without relying on the unique index to
 * throw: an idempotent handler that works by catching a duplicate-key error is
 * a handler that also swallows every other write error.
 */
export abstract class ConversationRepository extends SyncableRepository<Conversation> {
  abstract byKind(
    userId: string,
    kind: ConversationKind,
  ): Promise<Conversation | null>;

  abstract listFor(
    userId: string,
    includeArchived: boolean,
  ): Promise<Conversation[]>;

  abstract removeAllFor(userId: string): Promise<number>;
}

/**
 * Messages are immutable and pulled by sequence, so this port is deliberately
 * not `SyncableRepository`: there is no `updatedAt` cursor and no tombstone to
 * carry, and inheriting `pullSince` would be inheriting a method whose contract
 * this collection cannot honour.
 */
export abstract class MessageRepository extends Repository<Message> {
  /** The phone's pull: everything after a sequence number, oldest first. */
  abstract afterSeq(
    userId: string,
    afterSeq: number,
    limit: number,
  ): Promise<Message[]>;

  /** One conversation's transcript, newest-first for a screen that pages back. */
  abstract inConversation(
    userId: string,
    conversationId: string,
    afterSeq: number,
    limit: number,
  ): Promise<Message[]>;

  abstract removeAllFor(userId: string): Promise<number>;
}

/**
 * Where a `seq` comes from.
 *
 * Its own port because it is the one operation in this context that is neither
 * a read nor an aggregate save: `findOneAndUpdate` with `$inc` on a shared
 * counter document, atomic across concurrent writers. Two members appending at
 * once must get different numbers, and two *devices* of one member appending at
 * once must too — which an aggregate-level counter cannot promise, since both
 * would load the same value.
 */
export abstract class SeqPort {
  /** The next sequence number for this member. Never returns the same twice. */
  abstract next(userId: string): Promise<number>;

  /** The highest issued so far, without issuing one. For a cursor's baseline. */
  abstract current(userId: string): Promise<number>;

  /**
   * Forgets the member's counter entirely. Only `purge-on-deleted` calls it.
   *
   * On the port rather than reached for through the model in a purge handler,
   * because a handler that imports a driver to delete one document is the
   * violation constitution IX names, and `no-restricted-imports` refuses it
   * outright. The counter is a third collection this context owns; the purge
   * has to be able to empty all three, and "all three" is only expressible if
   * the third one has a removal path of its own.
   *
   * Resetting to zero rather than deleting the row would be worse than either:
   * a member id is a uuid and is never reissued, but a *restored* backup that
   * put messages back while the counter said zero would hand out sequence
   * numbers the phone has already seen, and immutable rows pulled by `seq`
   * cannot be corrected afterwards. Gone means gone.
   */
  abstract reset(userId: string): Promise<void>;
}

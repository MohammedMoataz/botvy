import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';

/**
 * The two pinned chats plus everything the member starts themselves.
 *
 * `coach` and `planner` are singletons per member, which is enforced by a
 * partial unique index on `{ userId, kind }` restricted to those two values —
 * a member may have any number of `free` chats, and Mongo would otherwise read
 * two of them as duplicates.
 */
export type ConversationKind = 'coach' | 'planner' | 'free';

/** The two that are created with the account and cannot be deleted. */
export const PINNED_KINDS: readonly ConversationKind[] = ['coach', 'planner'];

export interface ConversationState {
  id: string;
  userId: string;
  kind: ConversationKind;
  title: string;
  pinned: boolean;
  archived: boolean;
  clearedUpToSeq: number;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * A chat.
 *
 * ## Why this exists in P3 at all
 *
 * Because the three rhythm touches have to be written down somewhere, and the
 * blueprint puts the skeleton here for a reason worth restating: v1 sent the
 * evening question as a notification only, so a member who opened the app was
 * expected to answer a question that was nowhere on screen. The touch is a
 * message in a conversation, and the conversation has to exist before the first
 * touch is due — which is why it is created on `identity.UserRegistered` rather
 * than lazily on first use.
 *
 * ## What is deliberately not here
 *
 * No assistant turn, no free chats, no quick questions, no clearing. P4 grows
 * this into a conversation the member can talk back to, on exactly these two
 * collections. `clearedUpToSeq` is carried because the field is part of the
 * document's shape and adding it later would be a migration over rows the phone
 * already holds — but nothing in this phase moves it.
 */
export class Conversation extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  readonly kind: ConversationKind;
  title: string;
  pinned: boolean;
  archived: boolean;
  clearedUpToSeq: number;
  lastMessageAt: Date | null;
  readonly createdAt: Date;
  deletedAt: Date | null;

  private constructor(state: ConversationState) {
    super();
    this.id = state.id;
    this.userId = state.userId;
    this.kind = state.kind;
    this.title = state.title;
    this.pinned = state.pinned;
    this.archived = state.archived;
    this.clearedUpToSeq = state.clearedUpToSeq;
    this.lastMessageAt = state.lastMessageAt;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
    this.deletedAt = state.deletedAt;
  }

  static rehydrate(state: ConversationState): Conversation {
    return new Conversation(state);
  }

  static create(input: {
    id: string;
    userId: string;
    kind: ConversationKind;
    title: string;
    at: Date;
  }): Conversation {
    const conversation = new Conversation({
      id: input.id,
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      pinned: PINNED_KINDS.includes(input.kind),
      archived: false,
      clearedUpToSeq: 0,
      lastMessageAt: null,
      createdAt: input.at,
      updatedAt: input.at,
      deletedAt: null,
    });
    conversation.raise(
      'conversations.ConversationCreated',
      'conversation',
      { conversationId: input.id, kind: input.kind, pinned: conversation.pinned },
      input.at,
    );
    return conversation;
  }

  /** A member may not delete or unpin the two the account came with. */
  get isProtected(): boolean {
    return PINNED_KINDS.includes(this.kind);
  }

  /**
   * A message landed. Moves `lastMessageAt`, which is what orders the chat list.
   *
   * No event: `append-message` raises `conversations.MessageSent` once, from
   * the message itself, and a second event from this side would make one
   * message two rows in the outbox for every consumer to de-duplicate.
   */
  touch(at: Date): void {
    this.lastMessageAt = at;
    this.updatedAt = at;
  }

  /**
   * A new title, from the member or from the first words of an off-topic
   * message that was moved here.
   *
   * The pinned two *can* be renamed — that is not one of the three things they
   * refuse. A member who wants to call their coach something else is not
   * breaking anything; what they may not do is make either one disappear.
   */
  rename(title: string, at: Date): boolean {
    const trimmed = title.trim().slice(0, MAX_TITLE);
    if (trimmed.length === 0 || trimmed === this.title) return false;
    this.title = trimmed;
    this.updatedAt = at;
    this.raise(
      'conversations.ConversationRenamed',
      'conversation',
      { conversationId: this.id, title: trimmed },
      at,
    );
    return true;
  }

  /**
   * Pin or unpin. **Unpinning `coach` or `planner` is refused.**
   *
   * `ProtectedConversationError` and not a boolean, because the three refusals
   * are the same product rule read three ways and the endpoint answers each of
   * them with the same `protected` code — a `false` return would leave each of
   * three call sites to remember to turn it into that. The error carries which
   * operation was refused so the message can offer clearing instead.
   */
  setPinned(pinned: boolean, at: Date): void {
    if (!pinned && this.isProtected) {
      throw new ProtectedConversationError(this.kind, 'unpin');
    }
    if (this.pinned === pinned) return;
    this.pinned = pinned;
    this.updatedAt = at;
  }

  /** Archive or restore. **Archiving `coach` or `planner` is refused.** */
  setArchived(archived: boolean, at: Date): void {
    if (archived && this.isProtected) {
      throw new ProtectedConversationError(this.kind, 'archive');
    }
    if (this.archived === archived) return;
    this.archived = archived;
    this.updatedAt = at;
  }

  /**
   * Tombstone. **Refused for `coach` and `planner`** — clearing is what those
   * two offer instead, and the endpoint says so.
   */
  tombstone(at: Date): void {
    if (this.isProtected) {
      throw new ProtectedConversationError(this.kind, 'delete');
    }
    if (this.deletedAt) return;
    this.deletedAt = at;
    this.updatedAt = at;
    this.raise(
      'conversations.ConversationDeleted',
      'conversation',
      { conversationId: this.id, kind: this.kind },
      at,
    );
  }

  /**
   * Hide everything at or below a sequence number.
   *
   * ## A watermark, and never a delete
   *
   * Messages are immutable — that is what makes the phone's cursor one number —
   * so clearing cannot remove rows. It raises a floor instead, and every read
   * starts at `max(afterSeq, clearedUpToSeq)`.
   *
   * That is also what makes it work across devices *and* survive a catch-up,
   * which FR-011 asks for in two halves that a delete could not both satisfy.
   * A second device pulls the conversation row, sees the new watermark and
   * empties its own view; a device that was away for a week pulls messages
   * from the watermark rather than from its own stale `lastSeq`, so nothing
   * cleared arrives late. Deleting the rows would have emptied the first
   * device and left the third one holding a copy nothing would ever correct.
   *
   * Monotonic on purpose: a clear is not reversible (FR-011), so a lower
   * watermark arriving late — from a device whose clock or cursor is behind —
   * must not un-clear anything.
   */
  clearUpTo(seq: number, at: Date): boolean {
    if (!Number.isFinite(seq) || seq <= this.clearedUpToSeq) return false;
    this.clearedUpToSeq = Math.floor(seq);
    this.updatedAt = at;
    this.raise(
      'conversations.ConversationCleared',
      'conversation',
      { conversationId: this.id, clearedUpToSeq: this.clearedUpToSeq },
      at,
    );
    return true;
  }

  /** Where a reader must start, whatever cursor it brought. */
  floorFor(afterSeq: number): number {
    return Math.max(afterSeq, this.clearedUpToSeq);
  }
}

/** Titles are shown in a list; a paragraph pasted as a title is not a title. */
export const MAX_TITLE = 60;

/**
 * The one refusal the two pinned chats make, in three flavours.
 *
 * `protected` is the rejection reason `contracts/sync.md` names, and the reason
 * it is not `stale` matters: a stale verdict tells the phone to overwrite its
 * copy and retry, and against a row it will never be allowed to change it would
 * retry for ever.
 */
export class ProtectedConversationError extends Error {
  constructor(
    readonly kind: ConversationKind,
    readonly operation: 'delete' | 'unpin' | 'archive',
  ) {
    super(
      `The ${kind} conversation cannot be ${
        operation === 'delete' ? 'deleted' : `${operation}d`
      }. You can clear it instead.`,
    );
    this.name = 'ProtectedConversationError';
  }
}

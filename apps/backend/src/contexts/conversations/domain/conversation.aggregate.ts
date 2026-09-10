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
}

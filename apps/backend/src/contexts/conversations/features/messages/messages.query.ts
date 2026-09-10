import { Injectable } from '@nestjs/common';
import { loadOwn } from '../../domain/conversation-access.js';
import {
  ConversationRepository,
  MessageRepository,
} from '../../domain/conversations.repositories.js';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/**
 * A message as a screen reads it.
 *
 * No `id`: the contract's `Message` type does not carry one, and `seq` is the
 * identity a client needs — it is unique per member, it is the cursor, and it
 * is the only thing that orders two messages written in the same millisecond.
 * The `_id` is an ObjectId minted by the server and means nothing to a phone
 * that pulls by sequence.
 *
 * No `usage` either, and that one is a decision rather than an absence in the
 * contract: what a turn cost is an operator's number, it reaches Operations on
 * `conversations.MessageSent`, and the admin Usage screen (P10) reads it from
 * `usage_log`. Publishing it on the member's own transcript would put a token
 * count under every answer in the chat.
 */
export interface MessageView {
  seq: number;
  conversationId: string;
  role: string;
  content: string;
  clientId: string | null;
  composedAt: Date | null;
  intent: Record<string, unknown> | null;
  createdAt: Date;
}

/** `MessageConnection` from the contract: nodes, a cursor, and one flag. */
export interface MessagePage {
  nodes: MessageView[];
  /**
   * The last `seq` in this page, as a string, or null for an empty page.
   *
   * A string because the contract types it `String` and because a cursor is an
   * opaque token to a client — one that reads it as a number is one that will
   * try arithmetic on it. It happens to *be* the sequence number, which is what
   * makes paging a member's transcript a single index seek rather than a skip.
   *
   * Null on an empty page rather than the floor that was asked for: a client
   * that stored a cursor from an empty page would have advanced past nothing.
   */
  endCursor: string | null;
  hasNextPage: boolean;
}

export interface MessagesQuery {
  conversationId: string;
  afterSeq?: number | null;
  first?: number | null;
}

/**
 * One chat's transcript, from a floor.
 *
 * ## The floor is the whole feature
 *
 * `conversation.floorFor(afterSeq)` is `max(afterSeq, clearedUpToSeq)`, and
 * applying it here rather than trusting the caller's cursor is what makes a
 * clear irreversible (FR-011). A caller passing `afterSeq: 0` — a fresh install,
 * a browser tab that has never opened the chat, a client that lost its local
 * state — gets **nothing** from a cleared conversation, because the floor
 * overrides the cursor rather than being combined with it in the client.
 *
 * Which is why the conversation is loaded before the messages are read even
 * though the message rows carry the `conversationId` themselves: the read needs
 * the watermark, and the watermark lives on the parent. A query that went
 * straight to the messages collection would be a query that showed a cleared
 * transcript to anybody who asked from zero, and it would look correct on every
 * device that had been present for the clear.
 *
 * ## And it is the ownership check
 *
 * `loadOwn` refuses a conversation belonging to another member with
 * `ConversationForbidden`, never a "not found" — FR-020. The repository read is
 * scoped by `userId`, so a foreign id and an id that never existed are the same
 * null and the same refusal; nothing here can tell them apart, which is the
 * property being preserved rather than a limitation being worked around.
 *
 * Reading the messages by `conversationId` *and* `userId` after that is not
 * belt-and-braces for its own sake: it means a bug in the conversation lookup
 * can never widen into another member's transcript.
 */
@Injectable()
export class MessagesQueryHandler {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
  ) {}

  async page(userId: string, query: MessagesQuery): Promise<MessagePage> {
    const conversation = await loadOwn(
      this.conversations,
      userId,
      query.conversationId,
    );

    const first = clamp(query.first);
    const floor = conversation.floorFor(Math.max(0, query.afterSeq ?? 0));

    /*
     * One row more than the page, then dropped.
     *
     * `hasNextPage` cannot be answered from a full page alone — a transcript of
     * exactly 50 messages would report a next page that turns out to be empty,
     * and a client that keeps paging while the flag is true would make one
     * pointless round trip per open. Asking for 51 and returning 50 costs a
     * single row and answers it exactly. A `countDocuments` beside the find
     * would be a second query over the same index for a boolean.
     */
    const rows = await this.messages.inConversation(
      userId,
      conversation.id,
      floor,
      first + 1,
    );

    const nodes = rows.slice(0, first).map(
      (message): MessageView => ({
        seq: message.seq,
        conversationId: message.conversationId,
        role: message.role,
        content: message.content,
        clientId: message.clientId,
        composedAt: message.composedAt,
        intent: message.intent,
        createdAt: message.createdAt,
      }),
    );

    return {
      nodes,
      endCursor:
        nodes.length > 0 ? String(nodes[nodes.length - 1]!.seq) : null,
      hasNextPage: rows.length > first,
    };
  }
}

/**
 * A page size the caller cannot use to ask for the whole transcript.
 *
 * The cap is not politeness: messages are the largest rows this member owns and
 * a chat that has been running for a year is thousands of them. Zero and
 * negative numbers fall back to the default rather than returning an empty page
 * — a client that sent `first: 0` gets the first page, which is the reading
 * that cannot be mistaken for "there are no messages".
 */
function clamp(first: number | null | undefined): number {
  if (!first || first <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(first, MAX_PAGE_SIZE);
}

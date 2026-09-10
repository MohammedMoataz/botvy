import { Injectable } from '@nestjs/common';
import type { Conversation } from '../../domain/conversation.aggregate.js';
import { ConversationRepository } from '../../domain/conversations.repositories.js';

/**
 * A chat as a screen reads it.
 *
 * ## `unread` is missing, and that is a reported divergence rather than an
 * oversight
 *
 * `contracts/graphql.schema.graphql` types `Conversation.unread: Int!`. There
 * is nothing in this system that could answer it: neither `conversations` nor
 * `messages` carries a read watermark, `devices` (in Identity, and another
 * context's table besides) holds `lastSeenAt` for the alert sweep and not a
 * per-conversation cursor, and the phone's own `lastSeq` is a single number for
 * the whole transcript that never leaves the device.
 *
 * So the honest options were a field that lies and a field that is absent. A
 * hardcoded `0` renders as "nothing new" on a chat the coach wrote into an hour
 * ago — a wrong number a client will happily draw a badge from — and the
 * blueprint's own rule is that a hard-coded default is a bug. `messages.length`
 * would be worse: every chat permanently unread. The field is therefore not
 * published, the generated schema is one field short of the contract, and
 * whichever phase adds the read cursor (a `lastReadSeq` on the conversation
 * row, written by the client through `/sync` like any other column) adds the
 * field in the same change as the thing that can answer it.
 *
 * `createdAt` is published although the contract does not name it, because the
 * chat list sorts by `lastMessageAt` and needs a tie-break for chats nobody has
 * written in yet — both pinned chats, on the day a member registers.
 */
export interface ConversationView {
  id: string;
  kind: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  clearedUpToSeq: number;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Field by field rather than a spread, so publishing a new field is a decision.
 * A `{ ...conversation }` would ship `pendingEvents` and every private the
 * class grows.
 *
 * This is the *read model*, and it is deliberately not the same function as
 * `conversations-sync.adapter.ts`'s `toWire`, which looks almost identical. The
 * difference is `deletedAt`: the sync protocol carries tombstones because a
 * delta is the only way a deletion reaches the phone, and a read model never
 * shows a deleted chat at all. Merging them would mean one of the two callers
 * getting a field it should not have — either a GraphQL client having to filter
 * tombstones, or the phone's delete sweep losing the only signal it has.
 */
export function toConversationView(
  conversation: Conversation,
): ConversationView {
  return {
    id: conversation.id,
    kind: conversation.kind,
    title: conversation.title,
    pinned: conversation.pinned,
    archived: conversation.archived,
    clearedUpToSeq: conversation.clearedUpToSeq,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

/**
 * The member's chat list.
 *
 * `listFor` filters tombstones in both adapters and orders by `lastMessageAt`
 * descending with `createdAt` as the tie-break, which is the order the screen
 * wants — the pinned section is a *client* concern, drawn from `kind`, not a
 * second query. Two queries would have to agree about which chats belong in
 * neither list.
 */
@Injectable()
export class ConversationsQueryHandler {
  constructor(private readonly conversations: ConversationRepository) {}

  async list(
    userId: string,
    includeArchived = false,
  ): Promise<ConversationView[]> {
    const rows = await this.conversations.listFor(userId, includeArchived);
    return rows.map(toConversationView);
  }
}

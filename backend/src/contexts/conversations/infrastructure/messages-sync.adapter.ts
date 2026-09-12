import { Injectable } from '@nestjs/common';
import type { SyncChange } from '../../../shared/persistence/ports/sync-change.js';
import {
  MESSAGE_PAGE_SIZE,
  type ApplyOutcome,
  type SyncableEntity,
} from '../../sync/domain/syncable-entity.port.js';
import type { Message } from '../domain/message.aggregate.js';
import {
  ConversationRepository,
  MessageRepository,
} from '../domain/conversations.repositories.js';
import { CONVERSATION_APPLY_ORDER } from './conversations-sync.adapter.js';

/**
 * After conversations, which are the parent. Pulls run in the reverse of this
 * order — children first — so this being the higher number is also what makes
 * messages come back *before* the conversations they name, which is what
 * `contracts/sync.md` step 5 asks for.
 */
export const MESSAGE_APPLY_ORDER = CONVERSATION_APPLY_ORDER + 1;

/**
 * The member's messages on the phone's round trip. **Pull only, by `seq`.**
 *
 * ## Why the cursor is a number and not the date every other entity uses
 *
 * Because messages are immutable, and that immutability is the design rather
 * than a property they happen to have. There is no `updatedAt` on the row and
 * no tombstone, so a date cursor has nothing to compare against — and the
 * absence is what makes the cursor one integer and one index. `SyncableEntity`
 * therefore hands every adapter both cursors and each reads the one its
 * collection has; the port carries the full argument for why that is a third
 * parameter rather than a second port.
 *
 * ## The floor, which is the whole of FR-011's second half
 *
 * The pull is not `seq > lastSeq`. It is `seq > max(lastSeq, clearedUpToSeq)`
 * **per conversation**, and the difference is the requirement: a device that
 * has been away for a week holds a `lastSeq` from before a clear that happened
 * on another device, and pulling from its own cursor would deliver every
 * message the member cleared — arriving *after* the clear, so nothing would
 * ever correct it. Rows cannot be deleted (they are immutable and the phone has
 * copies), so the floor travels on the conversation row and is applied here, on
 * the read.
 *
 * Which is why this adapter reads two collections: the conversations to learn
 * each floor, then the messages. That is not a cross-context read — both
 * belong to Conversations — and it is the reason this adapter lives in this
 * context's `infrastructure/` rather than in the facade.
 *
 * ## Why filtering in memory rather than in the query
 *
 * The floors differ per conversation, so an exact query would be an `$or` of
 * one clause per chat — unbounded in the number of chats a member has, and
 * unable to use the `{ userId, seq }` index for any of them. Instead the page
 * is read from the *lowest* applicable floor through the one index, and rows
 * below their own conversation's floor are dropped on the way out. A member
 * with one cleared chat and twenty others pays a few extra rows on one round
 * trip; the alternative pays a query planner on every one.
 *
 * The page can therefore come back short of `MESSAGE_PAGE_SIZE` while more
 * messages remain, which is safe in the direction that matters: the facade's
 * `moreMessages` reports "full page" and a short page ends the paging loop with
 * the client's cursor advanced past the rows it did receive, so the next round
 * trip continues from there. Nothing is skipped; at worst a member's catch-up
 * takes one more round trip than the arithmetic suggests.
 *
 * ## No push
 *
 * A message is written by `append-message` or by the turn, never pushed as a
 * row — a client that could insert a message could choose its own `seq`, and
 * the sequence is the one thing in this collection nothing can repair. The
 * member's offline messages go to `POST /conversations/batch` instead, which
 * takes their text and `composedAt` and issues the sequence here. So `apply`
 * refuses with `invalid`, the same refusal and for the same reason as the
 * rhythm's three pull-only entities: retrying unchanged will fail again, and
 * `stale` would make the phone retry for ever.
 */
@Injectable()
export class MessageSyncAdapter implements SyncableEntity {
  readonly entity = 'messages';
  readonly applyOrder = MESSAGE_APPLY_ORDER;

  constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
  ) {}

  async pull(
    userId: string,
    _since: Date | null,
    lastSeq: number,
  ): Promise<unknown[]> {
    /*
     * Every conversation, archived and tombstoned included.
     *
     * `pullSince(userId, null)` rather than `listFor`, because the floors are
     * needed for chats the read model hides: an archived chat still has a
     * transcript the phone holds, and a *deleted* one's messages are still on
     * the device until the tombstone is applied — which is the same round trip
     * this is. Reading only the live list would leave those rows with no floor
     * and hand back messages from a cleared chat the member had since archived.
     */
    const conversations = await this.conversations.pullSince(userId, null);
    const floors = new Map<string, number>();
    for (const conversation of conversations) {
      floors.set(conversation.id, conversation.floorFor(lastSeq));
    }

    // The lowest floor any of them has, which is where the one indexed read can
    // safely start. `lastSeq` itself when the member has no cleared chats, and
    // never lower than the client's own cursor.
    const from = floors.size > 0 ? Math.min(...floors.values()) : lastSeq;

    const rows = await this.messages.afterSeq(userId, from, MESSAGE_PAGE_SIZE);
    return rows
      .filter((message) => {
        /*
         * A message whose conversation is not in the map at all is dropped.
         *
         * It cannot happen through any write path — every message is appended
         * to a conversation that was loaded first — so this is the case where
         * something has already gone wrong: a restored backup that put the
         * messages back without the chats, say. Sending the row anyway would
         * put a message on the phone under a thread it has no row for, and
         * `contracts/sync.md`'s whole reason for pulling messages before
         * conversations is that this must not happen.
         */
        const floor = floors.get(message.conversationId);
        return floor !== undefined && message.seq > floor;
      })
      .map(toWire);
  }

  async apply(
    _userId: string,
    change: SyncChange,
    _now: Date,
  ): Promise<ApplyOutcome> {
    return {
      applied: false,
      rejection: { entity: this.entity, id: change.id, reason: 'invalid' },
    };
  }
}

/**
 * Field by field, and the shape is `contracts/sync.md`'s `pull.messages` row
 * exactly.
 *
 * No `id` — `seq` is the identity on this wire, because it is unique per member
 * and is the cursor. No `usage`: what a turn cost is an operator's number,
 * carried to Operations on the event, and there is no reason for it to sit on
 * every phone. `intent` is here because the client renders a card from it.
 */
function toWire(message: Message): Record<string, unknown> {
  return {
    seq: message.seq,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    clientId: message.clientId,
    composedAt: message.composedAt,
    intent: message.intent,
    createdAt: message.createdAt,
  };
}

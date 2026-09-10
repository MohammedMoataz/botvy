import { Injectable } from '@nestjs/common';
import type { SyncChange } from '../../../shared/persistence/ports/sync-change.js';
import type {
  ApplyOutcome,
  SyncableEntity,
} from '../../sync/domain/syncable-entity.port.js';
import type { Conversation } from '../domain/conversation.aggregate.js';
import { ConversationRepository } from '../domain/conversations.repositories.js';

/**
 * The member's chat list on the phone's round trip. **Pull only in P3.**
 *
 * ## Why this exists in a phase with no chat
 *
 * Because FR-005's second half is a requirement about *registration*: "every
 * member MUST have that conversation from the moment they register, before any
 * touch is due". Without a read surface that is a requirement nothing outside
 * the process can check — and the failure mode is silent, which is the worst
 * combination. `AppendMessageHandler` returns null and logs when the
 * conversation is missing, so a rhythm touch whose chat does not exist looks
 * exactly like one that worked: the plan is set, the alert is planned, the
 * counters go up, and the sentence is nowhere.
 *
 * Pulling the list makes it checkable from the public surface, which is what
 * `infra/verify-p3.mjs` does. That is the whole reason for the file.
 *
 * ## The push is P4's
 *
 * Renaming, archiving, clearing and deleting all arrive with the chat the
 * member can talk to, and `contracts/sync.md` types the push as
 * `{ op: 'upsert' | 'delete' | 'clear' }` — none of which this phase
 * implements. A push is refused with `invalid` rather than ignored: retrying
 * unchanged will fail again, and `stale` would tell the phone to overwrite its
 * copy and retry for ever against a rule that was never going to accept it.
 *
 * `protected` would be the right refusal for a *pinned* conversation once the
 * push exists, and it is deliberately not used here: `protected` means "this
 * row may not be changed this way", which is a narrower and different claim
 * from "this endpoint does not accept writes yet".
 */

/** Before messages, after the row entities. Conversations are the parent. */
export const CONVERSATION_APPLY_ORDER = 50;

@Injectable()
export class ConversationSyncAdapter implements SyncableEntity {
  readonly entity = 'conversations';
  readonly applyOrder = CONVERSATION_APPLY_ORDER;

  constructor(private readonly conversations: ConversationRepository) {}

  async pull(userId: string, since: Date | null): Promise<unknown[]> {
    const rows = await this.conversations.pullSince(userId, since);
    return rows.map(toWire);
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
 * Field by field rather than a spread of the aggregate, so that publishing a
 * new field is a decision. A `{ ...conversation }` would ship `pendingEvents`
 * and every private the class ever grows.
 */
function toWire(conversation: Conversation): Record<string, unknown> {
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
    // Carried even though nothing in this phase writes one: the row protocol's
    // delete-sweep on a full snapshot branches on it, and a client that had to
    // treat "absent" as "not deleted" for this one entity would be a client
    // with a special case.
    deletedAt: conversation.deletedAt,
  };
}

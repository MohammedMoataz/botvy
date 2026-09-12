import { Injectable } from '@nestjs/common';
import {
  resolveConflict,
  type Rejection,
  type SyncChange,
} from '../../../shared/persistence/ports/sync-change.js';
import { UnitOfWork } from '../../../shared/persistence/ports/unit-of-work.js';
import type {
  ApplyOutcome,
  SyncableEntity,
} from '../../sync/domain/syncable-entity.port.js';
import {
  Conversation,
  ProtectedConversationError,
} from '../domain/conversation.aggregate.js';
import { ConversationRepository } from '../domain/conversations.repositories.js';

/**
 * The member's chat list on the phone's round trip. **Pull and push.**
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
 * ## The push, which is P4's and is here now
 *
 * `contracts/sync.md` types it as `{ op: 'upsert' | 'delete' | 'clear' }`, and
 * all three are implemented below. Two of the three words are not the row
 * protocol's usual five, and each earns its place:
 *
 * - **`upsert`** is create-or-update decided by the server. A chat made on a
 *   plane and renamed twice before the network came back is one row to the
 *   client, and asking it to know whether the server has seen the row yet is
 *   asking it to track something the id already answers.
 * - **`clear`** is a monotonic raise of `clearedUpToSeq` and could not be an
 *   `update` carrying the field: a lower watermark from a device whose cursor
 *   is behind must change nothing, because a clear is not reversible (FR-011),
 *   and an update would leave that guarantee to whoever wrote the adapter.
 *
 * ## The order of the refusals is the contract's, and it is load-bearing
 *
 * `protected` is checked **before** the conflict rule. A push that would
 * delete, unpin or archive `coach` or `planner` is refused with `protected`
 * whatever its `baseUpdatedAt` says — and never with `stale`, because a stale
 * verdict tells the phone to take the server's copy and try again, and against
 * a row it will never be allowed to change it would retry for ever. Getting
 * this order wrong would produce exactly that: a phone with a slightly stale
 * copy of the coach chat, refused as `stale`, refreshing and retrying its
 * delete until somebody looked at a log.
 */

/** Before messages, after the row entities. Conversations are the parent. */
export const CONVERSATION_APPLY_ORDER = 50;

@Injectable()
export class ConversationSyncAdapter implements SyncableEntity {
  readonly entity = 'conversations';
  readonly applyOrder = CONVERSATION_APPLY_ORDER;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly conversations: ConversationRepository,
  ) {}

  async pull(userId: string, since: Date | null): Promise<unknown[]> {
    const rows = await this.conversations.pullSince(userId, since);
    return rows.map(toWire);
  }

  /**
   * One pushed chat row.
   *
   * The read is scoped by `userId` in both adapters, so a conversation
   * belonging to another member is simply not found — and it is refused as
   * `gone`, the same as an id that never existed. That is FR-020 on this
   * transport: the two answers are indistinguishable, and there is nothing in
   * this method that holds the information needed to tell them apart.
   *
   * The one asymmetry with the REST surface is the word. Over HTTP the refusal
   * is `403 forbidden` because a person is waiting for it; here it is `gone`,
   * because `contracts/sync.md`'s vocabulary is what the phone branches on and
   * `gone` is the instruction it needs — delete the local row, stop pushing it.
   * Neither answer reveals whether the id exists elsewhere.
   */
  async apply(
    userId: string,
    change: SyncChange,
    now: Date,
  ): Promise<ApplyOutcome> {
    try {
      return await this.applyOrRefuse(userId, change, now);
    } catch (error) {
      /*
       * The backstop for the rule the order above already keeps.
       *
       * `protectedRefusal` catches every protected push before the aggregate is
       * touched, so this branch should be unreachable — and it is written
       * anyway because the cost of it being reached is not an error message. An
       * uncaught `ProtectedConversationError` reaches the facade's own `catch`
       * and becomes `invalid`, which is a different instruction to the phone
       * than `protected`, and one nobody would notice for a phase.
       */
      if (error instanceof ProtectedConversationError) {
        return this.refuse(change.id, 'protected', null);
      }
      throw error;
    }
  }

  private async applyOrRefuse(
    userId: string,
    change: SyncChange,
    now: Date,
  ): Promise<ApplyOutcome> {
    const fields = change.fields as PushedConversation;
    const existing = await this.conversations.findById(userId, change.id);

    if (!existing) {
      if (change.op !== 'upsert' && change.op !== 'create') {
        return this.refuse(change.id, 'gone', null);
      }
      // A pushed create is always a `free` chat. `coach` and `planner` are
      // singletons created by `bootstrap-on-registered` from
      // `identity.UserRegistered`, and a client that could mint one would race
      // the partial unique index for a duplicate-key error out of a round trip
      // that has forty other rows in it. Naming either is a client bug, so it
      // is refused loudly rather than silently downgraded to `free` — a phone
      // that thinks it created the coach chat has a local row that will never
      // reconcile.
      if (fields.kind !== undefined && fields.kind !== 'free') {
        return this.refuse(change.id, 'invalid', null);
      }
      const created = Conversation.create({
        id: change.id,
        userId,
        kind: 'free',
        title: typeof fields.title === 'string' ? fields.title : 'New chat',
        // The client's own edit time, not `now`: the row was created when the
        // member made it, and `createdAt` is what breaks the tie in the chat
        // list for chats nobody has written in.
        at: change.updatedAt,
      });
      applyFlags(created, fields, now);
      await this.uow.run(() => this.conversations.save(created));
      return { applied: true, id: created.id };
    }

    // **Before the conflict rule.** See the class comment.
    const refused = protectedRefusal(existing.isProtected, change.op, fields);
    if (refused) return this.refuse(change.id, 'protected', toWire(existing));

    const verdict = resolveConflict(change, existing, now);
    if (!verdict.accept) {
      return this.refuse(change.id, verdict.reason, toWire(existing));
    }

    switch (change.op) {
      case 'delete':
        existing.tombstone(now);
        break;
      case 'clear': {
        /*
         * The watermark comes from the client, and a missing one is `invalid`.
         *
         * The device knows the highest `seq` it holds; the server cannot
         * substitute its own current counter here, because that would clear
         * messages the pushing device has never seen — a member who cleared a
         * chat on a phone that was three days behind would lose three days of
         * coach messages they had not read yet. So the number is theirs, the
         * aggregate refuses to lower the floor, and a push with no number at
         * all is a client bug rather than a licence to guess.
         */
        const seq = Number(fields.clearedUpToSeq);
        if (!Number.isFinite(seq) || seq < 0) {
          return this.refuse(change.id, 'invalid', toWire(existing));
        }
        existing.clearUpTo(seq, now);
        break;
      }
      default:
        // `upsert`, and `update` for a client that sends the row protocol's
        // word instead. Title through the aggregate, which trims and caps it;
        // the two booleans through `applyFlags`, which is where the protected
        // refusals would otherwise land.
        if (typeof fields.title === 'string') existing.rename(fields.title, now);
        applyFlags(existing, fields, now);
    }

    await this.uow.run(() => this.conversations.save(existing));
    return { applied: true, id: existing.id };
  }

  private refuse(
    id: string,
    reason: Rejection['reason'],
    server: unknown,
  ): ApplyOutcome {
    return {
      applied: false,
      rejection: { entity: this.entity, id, reason, server },
    };
  }
}

/** The fields a client may push on a chat row. `contracts/sync.md`. */
interface PushedConversation {
  kind?: string;
  title?: string;
  pinned?: boolean;
  archived?: boolean;
  clearedUpToSeq?: number;
}

/**
 * Which of the three refusals this push would trip, or null.
 *
 * Asked *before* anything is mutated, so the refusal is `protected` rather than
 * whatever the conflict rule would have said first. It reads `isProtected` off
 * the aggregate rather than testing `kind` itself — the list of protected kinds
 * lives in `PINNED_KINDS` and a copy here would be a fourth place to forget.
 *
 * `pinned: false` and `archived: true` are the two flag values that count. The
 * opposites are not refusals: pinning a chat that is already pinned is a no-op,
 * and un-archiving one that was never archived is too.
 */
function protectedRefusal(
  isProtected: boolean,
  op: SyncChange['op'],
  fields: PushedConversation,
): 'delete' | 'unpin' | 'archive' | null {
  if (!isProtected) return null;
  if (op === 'delete') return 'delete';
  if (op === 'clear') return null;
  if (fields.pinned === false) return 'unpin';
  if (fields.archived === true) return 'archive';
  return null;
}

/**
 * The two booleans, through the aggregate so the refusals stay in one place.
 *
 * Called for a create as well, because a chat created offline can arrive
 * already pinned or archived by the member. A `free` chat is never
 * `isProtected`, so neither call can throw on that path.
 */
function applyFlags(
  conversation: Conversation,
  fields: PushedConversation,
  now: Date,
): void {
  if (typeof fields.pinned === 'boolean') {
    conversation.setPinned(fields.pinned, now);
  }
  if (typeof fields.archived === 'boolean') {
    conversation.setArchived(fields.archived, now);
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

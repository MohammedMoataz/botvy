import { Injectable, Logger } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { NudgeService } from '../../../../ws/nudge.service.js';
import type { Conversation, ConversationKind } from '../../domain/conversation.aggregate.js';
import {
  ConversationRepository,
  MessageRepository,
  SeqPort,
} from '../../domain/conversations.repositories.js';
import {
  Message,
  type MessageRole,
  type MessageUsage,
} from '../../domain/message.aggregate.js';

/**
 * Mints a message id. A token, because the two adapters mint differently — a
 * real ObjectId hex against Mongo, a padded monotonic string in a spec — and
 * the handler must not know which store it is talking to.
 *
 * Here rather than on `MessageRepository`, following the alert saga's
 * `ALERT_ID`: an id is minted before the aggregate exists, so it is not the
 * repository's business, and a `nextId()` on the port would be a method that
 * touches no rows.
 */
export const MESSAGE_ID = Symbol('MESSAGE_ID');
export type MessageIdFactory = () => string;

export interface AppendMessageInput {
  userId: string;
  /** The chat by id, when the caller holds one. */
  conversationId?: string;
  /** Or by kind, which is how the rhythm's three touches address the coach chat. */
  kind?: ConversationKind;
  role: MessageRole;
  content: string;
  /** The client's own id for its retry story. P4's; null for a server turn. */
  clientId?: string | null;
  /** When the member typed it, as opposed to when it arrived. P4's. */
  composedAt?: Date | null;
  /**
   * The `chat.message` frame's discriminator, which `contracts/ws-chat.md`
   * fixes at `evening_prompt | end_of_day_summary | morning_briefing |
   * checkin_question | suggestion`.
   *
   * It reaches the socket and is **not stored on the row**, which is the
   * decision worth writing down. The frame's job is to tell a client that is
   * connected *right now* what to route to — the check-in sheet, the confirm
   * sheet, the home screen — and a client that was offline routes from the
   * notification's deep link instead, because that is the path that survives
   * the app being closed. Storing it would mean a column on an immutable row
   * that no later pull could correct, for a value only a live socket reads.
   *
   * Optional, because P4's member turns and free-chat replies have no touch to
   * name; the frame simply omits `kind` for those.
   */
  touch?: TouchMessageKind;
  /**
   * What the turn cost, for the assistant's message. Null for the member's own.
   *
   * It rides on `conversations.MessageSent` from here, which is the only way
   * Operations learns of it — the two contexts never open each other's
   * collections, and the daily allowance is summed back through a query.
   */
  usage?: MessageUsage | null;
  /** What the turn was understood to be asking, or `{ cancelled: true }`. */
  intent?: Record<string, unknown> | null;
  at: Date;
}

/** The `kind` values `contracts/ws-chat.md` fixes for a `chat.message` frame. */
export type TouchMessageKind =
  | 'evening_prompt'
  | 'end_of_day_summary'
  | 'morning_briefing'
  | 'checkin_question'
  | 'suggestion';

/**
 * Writes one message down and tells the member's devices about it.
 *
 * The whole write side of this phase. The three rhythm touches dispatch this;
 * they do not open a message repository, do not know how a `seq` is issued and
 * do not know the conversation's id — they hand over a kind, a role and a
 * sentence, which is what `CoachTranscriptPort` promises them.
 *
 * ## Written down *and* pushed
 *
 * Both, and the order matters. v1 sent the evening question as a notification
 * only, so a member who opened the app was expected to answer a question that
 * was nowhere on screen — the notification having been the only copy of it. The
 * row is the message; the socket frame is a courtesy for a device that happens
 * to be connected. Which is why the frame goes out on commit and never before:
 * a `chat.message` for a row that was rolled back would put a sentence on the
 * member's screen that no transcript contains, and no later pull would remove
 * it. A late frame costs a second; a phantom one costs the member's trust in
 * what they are reading.
 *
 * ## Why the seq is issued inside the transaction but outside the session
 *
 * `SeqPort.next` is the atomic `$inc` and deliberately does not join the
 * caller's Mongo session — see the adapter, at length. It is called from in
 * here anyway so that a member with no such conversation consumes no number at
 * all: the resolve happens first, and a refused append leaves the sequence
 * exactly where it was.
 *
 * ## Why a missing conversation is null and not a throw
 *
 * Because the caller is a five-minute cron tick walking every member. A throw
 * would abort the tick partway through the roster, and the member it stopped on
 * would be the *only* one whose touch was ever retried — everybody after them
 * loses the day, and the claim date the tick already wrote means tomorrow's
 * pass will not try again. So the touch that cannot be written is logged and
 * skipped, one member's message lost rather than the whole roster's.
 */
@Injectable()
export class AppendMessageHandler {
  private readonly logger = new Logger(AppendMessageHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly seq: SeqPort,
    private readonly nudges: NudgeService,
    private readonly nextId: MessageIdFactory,
  ) {}

  async handle(input: AppendMessageInput): Promise<{ seq: number } | null> {
    return this.uow.run(async () => {
      const conversation = await this.resolve(input);
      if (!conversation) {
        // Names which of the two lookups failed, because the two mean
        // different things: no chat of that kind is a member the bootstrap
        // never reached, and no chat of that id is a caller holding a stale
        // one. Reading "no coach conversation" in the log for the latter would
        // send a reader to the wrong handler.
        const asked = input.conversationId
          ? `conversation ${input.conversationId}`
          : `${input.kind ?? 'unspecified'} conversation`;
        this.logger.warn(
          `no ${asked} for ${input.userId}; message not appended`,
        );
        return null;
      }

      /*
       * A `clientId` already stored is a replay, and it consumes no sequence.
       *
       * The offline batch is flushed by a phone that may have been told
       * nothing about the first attempt — a response lost to the same network
       * that made the messages offline in the first place. Without this, the
       * second flush either creates a duplicate message or, once the unique
       * partial index on `(userId, clientId)` exists, fails with a
       * duplicate-key error that the member reads as "your messages could not
       * be sent".
       *
       * Returning the original `seq` makes the retry a no-op the caller cannot
       * tell from a success, which is exactly what an idempotent write should
       * look like. Checked before the sequence is issued so a replay does not
       * burn a number and leave a gap in the member's transcript — harmless,
       * since the cursor is `seq > lastSeq`, but a gap invites somebody to go
       * looking for the missing message.
       */
      if (input.clientId) {
        const existing = await this.messages.byClientId(
          input.userId,
          input.clientId,
        );
        if (existing) {
          this.logger.debug(
            `clientId ${input.clientId} already stored at seq ${existing.seq}; replay`,
          );
          return { seq: existing.seq };
        }
      }

      const seq = await this.seq.next(input.userId);
      const message = Message.write({
        id: this.nextId(),
        userId: input.userId,
        conversationId: conversation.id,
        seq,
        role: input.role,
        content: input.content,
        clientId: input.clientId ?? null,
        composedAt: input.composedAt ?? null,
        at: input.at,
              usage: input.usage ?? null,
        intent: input.intent ?? null,
});

      // The message and the touch in one transaction. A crash between them
      // would leave a message the chat list cannot order, because
      // `lastMessageAt` is what that list sorts on — the row would exist, be
      // pulled by the phone, and sit under a chat that still looked untouched.
      await this.messages.save(message);
      conversation.touch(input.at);
      await this.conversations.save(conversation);

      this.uow.onCommit(async () => {
        this.nudges.emit(input.userId, 'chat.message', {
          conversationId: conversation.id,
          messageId: message.id,
          seq,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
          // Omitted rather than sent as null when there is no touch: the
          // contract types `kind` as one of five strings, and a client
          // branching on it should get "absent" for a member's own turn rather
          // than a sixth value it has to know about.
          ...(input.touch ? { kind: input.touch } : {}),
        });
      });

      return { seq };
    });
  }

  /**
   * The chat this message belongs to, by id if the caller has one and by kind
   * otherwise.
   *
   * `byKind` skips tombstones in both adapters, so a member who deleted a chat
   * does not get a message written into it. The pinned two cannot be deleted —
   * `Conversation.isProtected` — so in this phase that branch only ever
   * concerns P4's free chats; the `deletedAt` guard on the id path is here for
   * the same reason and covers the case `byKind`'s filter cannot, a caller who
   * held an id from before the deletion.
   */
  private async resolve(
    input: AppendMessageInput,
  ): Promise<Conversation | null> {
    const conversation = input.conversationId
      ? await this.conversations.findById(input.userId, input.conversationId)
      : input.kind
        ? await this.conversations.byKind(input.userId, input.kind)
        : null;
    if (!conversation || conversation.deletedAt !== null) return null;
    return conversation;
  }
}

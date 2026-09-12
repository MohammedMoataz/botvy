import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { Conversation } from '../../domain/conversation.aggregate.js';
import { loadOwn } from '../../domain/conversation-access.js';
import {
  ConversationRepository,
  SeqPort,
} from '../../domain/conversations.repositories.js';

/**
 * Empty a chat's history — the one thing the pinned two *do* offer instead of
 * being deleted.
 *
 * ## Why the watermark is the member's highest issued seq, and not the chat's
 *
 * `SeqPort.current` is the highest number ever handed out to this member across
 * every conversation, because the counter is per member — that is what makes
 * the phone's cursor one integer instead of one per chat. Clearing therefore
 * sets a floor that is at or above every message in *this* chat, which is
 * exactly what "clear it" means, and it costs nothing that the number also sits
 * above messages in other chats: the floor is only ever read through
 * `Conversation.floorFor`, against this conversation's own reads.
 *
 * The alternative — "the highest `seq` in this conversation" — would have meant
 * a read over the messages collection to find a number, and a race: a message
 * arriving between that read and the save would land *below* the watermark
 * this handler was about to write and be cleared without ever having been seen.
 * Asking the counter for a number nobody can be below closes that.
 *
 * ## Why nothing is deleted
 *
 * Messages are immutable and the phone pulls them by `seq > lastSeq`. Deleting
 * rows would empty the device that asked and leave every other device holding a
 * copy that no later pull could correct — there is no `updatedAt` on a message
 * and no tombstone to send. The watermark travels on the conversation row
 * instead, which every device pulls, and every read starts at
 * `max(afterSeq, clearedUpToSeq)`. That is FR-011's two halves in one field:
 * the second device empties its view on its next pull, and the device that has
 * been away for a week starts from the floor rather than from its own stale
 * cursor, so nothing cleared arrives late.
 *
 * ## Why a lower watermark arriving late changes nothing
 *
 * `Conversation.clearUpTo` is monotonic and returns whether it moved. A clear
 * is not reversible (FR-011), so a device whose cursor or clock is behind must
 * not be able to lower the floor and un-clear a conversation. This handler
 * returns the *stored* watermark rather than the number it proposed, so a
 * caller that lost that race is told what is actually true.
 */
@Injectable()
export class ClearConversationHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly conversations: ConversationRepository,
    private readonly seq: SeqPort,
  ) {}

  async handle(
    userId: string,
    id: string,
    at: Date = new Date(),
  ): Promise<Conversation> {
    return this.uow.run(async () => {
      const conversation = await loadOwn(this.conversations, userId, id);
      // `current`, never `next`. Issuing a number would set the floor to one
      // the counter has not handed out yet, and the next message written into
      // this chat would take exactly that number and be born below the
      // watermark — cleared before anybody read it. A clear is a statement
      // about what has already been said.
      const highest = await this.seq.current(userId);
      conversation.clearUpTo(highest, at);
      await this.conversations.save(conversation);
      return conversation;
    });
  }
}

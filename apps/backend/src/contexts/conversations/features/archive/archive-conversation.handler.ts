import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { Conversation } from '../../domain/conversation.aggregate.js';
import { loadOwn } from '../../domain/conversation-access.js';
import { ConversationRepository } from '../../domain/conversations.repositories.js';

/**
 * Archive or restore a chat.
 *
 * **Archiving `coach` or `planner` is refused** — the third of the three
 * refusals, and the one it is easiest to forget, because archiving does not
 * destroy anything and so does not *feel* like a deletion. It is one: an
 * archived chat is out of the list by default (`conversations(includeArchived:
 * false)`), so archiving the coach chat is how a member would make the evening
 * check-in arrive somewhere they cannot see. The rhythm would keep writing into
 * it, the notification would keep arriving, and the question would be nowhere
 * on screen — which is v1's defect exactly, reached by a different route.
 *
 * *Restoring* one is not refused, and cannot be reached anyway: the pinned two
 * can never become archived, so `archived: false` on them is already true and
 * the aggregate returns without a change.
 */
@Injectable()
export class ArchiveConversationHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly conversations: ConversationRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    archived: boolean,
    at: Date = new Date(),
    expectedUpdatedAt?: Date | null,
  ): Promise<Conversation> {
    return this.uow.run(async () => {
      const conversation = await loadOwn(
        this.conversations,
        userId,
        id,
        expectedUpdatedAt,
      );
      conversation.setArchived(archived, at);
      await this.conversations.save(conversation);
      return conversation;
    });
  }
}

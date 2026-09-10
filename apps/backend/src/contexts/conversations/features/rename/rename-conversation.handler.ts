import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { Conversation } from '../../domain/conversation.aggregate.js';
import { loadOwn } from '../../domain/conversation-access.js';
import { ConversationRepository } from '../../domain/conversations.repositories.js';

/**
 * A new title.
 *
 * **The pinned two can be renamed**, and that is not an oversight: renaming is
 * not one of the three things `coach` and `planner` refuse. A member who wants
 * to call their coach something else breaks nothing — what they may not do is
 * make either chat disappear, which is `delete`, `unpin` and `archive`.
 * `Conversation.rename` says the same thing from the other side.
 *
 * The aggregate does the trimming, the length cap and the "same title, no
 * event" check, and it returns whether anything moved. The row is saved either
 * way and that is cheaper than it looks: nothing moved means `updatedAt` did
 * not move either, so the save writes the same document over itself and the
 * phone's `updatedAt` cursor does not see a change. Branching on the boolean to
 * skip a write would save one round trip and add a path where a caller can be
 * told "renamed" without a store having agreed.
 */
@Injectable()
export class RenameConversationHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly conversations: ConversationRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    title: string,
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
      conversation.rename(title, at);
      await this.conversations.save(conversation);
      return conversation;
    });
  }
}

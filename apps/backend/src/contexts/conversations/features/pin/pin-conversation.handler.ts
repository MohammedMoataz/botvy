import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { Conversation } from '../../domain/conversation.aggregate.js';
import { loadOwn } from '../../domain/conversation-access.js';
import { ConversationRepository } from '../../domain/conversations.repositories.js';

/**
 * Pin or unpin a chat.
 *
 * **Unpinning `coach` or `planner` is refused**, and the refusal comes out of
 * the aggregate as `ProtectedConversationError` carrying `'unpin'` — the
 * handler does not test the kind itself. That is the point of the error
 * existing: three handlers refuse for one product reason, and a `kind ===
 * 'coach' || kind === 'planner'` written here would be a fourth place holding
 * the list of protected kinds, which is a list that gets extended in three
 * places and forgotten in the fourth.
 *
 * *Pinning* a free chat is allowed and pins nothing special — the two the
 * account came with are identified by `kind`, never by `pinned`, so a member
 * with a pinned free chat has three chats at the top and still exactly two that
 * cannot be removed. Which is why the endpoint reads `pinned` from the body
 * rather than offering a `/pin` and an `/unpin`: `contracts/rest-commands.md`
 * has one PATCH with a boolean, and a boolean that arrives as `false` for a
 * protected chat is the case the refusal exists for.
 */
@Injectable()
export class PinConversationHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly conversations: ConversationRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    pinned: boolean,
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
      // Throws before anything is written, so a refused unpin leaves no trace
      // and the transaction has nothing to roll back.
      conversation.setPinned(pinned, at);
      await this.conversations.save(conversation);
      return conversation;
    });
  }
}

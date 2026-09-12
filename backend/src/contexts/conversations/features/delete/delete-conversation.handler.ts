import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { Conversation } from '../../domain/conversation.aggregate.js';
import { loadOwn } from '../../domain/conversation-access.js';
import { ConversationRepository } from '../../domain/conversations.repositories.js';

/**
 * Delete a chat — a tombstone, and **refused for `coach` and `planner`**.
 *
 * `Conversation.tombstone` throws `ProtectedConversationError` carrying
 * `'delete'`, whose message offers clearing instead, which is the whole of
 * FR-001's "MUST NOT be deletable" and User Story 3's first scenario: refused
 * *with an explanation*, and the explanation names the thing the member can
 * actually do.
 *
 * ## A tombstone, not a `remove`
 *
 * The row stays with `deletedAt` set, because a deletion has to reach the
 * member's other devices and a row that is gone reaches nobody: the phone's
 * pull is a delta, and a delta cannot carry the absence of something. The
 * tombstone is how the deletion travels, which is why
 * `ConversationRepository.pullSince` includes them.
 *
 * The messages are left exactly where they are. That looks like a leak and is
 * not one: `AppendMessageHandler` refuses to write into a tombstoned chat and
 * every read is scoped through the conversation, so the transcript is
 * unreachable — and it is immutable, so deleting the rows is the one operation
 * that could never be undone if the member restores the chat. The account being
 * deleted is what erases them, in `purge-on-deleted`.
 *
 * ## Why no restore here
 *
 * `contracts/rest-commands.md` gives conversations no restore route, unlike
 * reminders and tasks. The sync path's `restore` op is the same story from the
 * other side, and neither exists yet — so this file has one method, and the
 * `deletedAt`-already-set case is the aggregate's own no-op rather than an
 * error, which is what makes a retried delete from a phone that lost its
 * response harmless.
 */
@Injectable()
export class DeleteConversationHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly conversations: ConversationRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    at: Date = new Date(),
  ): Promise<Conversation> {
    return this.uow.run(async () => {
      // `loadOwn` refuses a row that is already a tombstone, so a second delete
      // answers `forbidden` rather than reaching the aggregate. That is the
      // same answer a foreign id gets, which is the point: the member's client
      // treats "gone" and "never yours" identically, and there is no reply that
      // distinguishes them.
      const conversation = await loadOwn(this.conversations, userId, id);
      conversation.tombstone(at);
      await this.conversations.save(conversation);
      return conversation;
    });
  }
}

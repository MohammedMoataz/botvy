import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import {
  ConversationRepository,
  MessageRepository,
  SeqPort,
} from '../../domain/conversations.repositories.js';
import { QuickQuestionRepository } from '../../domain/quick-question.repository.js';

/**
 * Removes every chat, every message and the counter a deleted member had.
 *
 * Reacts to `identity.UserDeleted`, which crosses two stores — Identity is on
 * PostgreSQL and this context is on MongoDB, so no transaction can span them
 * and the event is the only way across.
 *
 * **All three collections, not two.** The counter is the one that is easy to
 * forget, because it holds no member content — but leaving it is not merely
 * untidy. A member id is never reissued, so nothing would read the stale row;
 * what it costs is the invariant. `SeqPort.reset` exists on the port for this
 * caller: a purge handler cannot reach for the driver to delete one document,
 * because a handler that imports `mongoose` is the violation constitution IX
 * names and `no-restricted-imports` refuses outright.
 *
 * **Hard deletes, not tombstones.** Everywhere else a delete in this product is
 * a tombstone, because a tombstone is how a deletion reaches the member's other
 * devices and because a Deleted view exists to show them what they removed.
 * Neither reason survives the account going away: there is no device left to
 * tell and no member left to show. Messages have no tombstone at all — they are
 * immutable and pulled by `seq` — so for this collection a hard delete was
 * never optional.
 *
 * Idempotent, because the relay delivers at least once: two deliveries collapse
 * to one purge and the second reports nothing rather than failing. `reset` runs
 * on the second delivery too and deletes nothing, which is why the verdict is
 * decided by the two counted removals rather than by whether the counter was
 * there.
 */
@Injectable()
export class ConversationsPurgeOnDeletedHandler {
  private readonly logger = new Logger(ConversationsPurgeOnDeletedHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly seq: SeqPort,
    private readonly questions: QuickQuestionRepository,
  ) {}

  async handle(event: DomainEvent): Promise<'purged' | 'nothing-to-do'> {
    const userId = event.userId;
    if (!userId) {
      this.logger.warn(
        `${event.name} ${event.eventId} carries no userId; nothing to purge`,
      );
      return 'nothing-to-do';
    }

    const [messages, conversations, questions] = await this.uow.run(async () => {
      // Messages before conversations, mirroring the dependency direction: a
      // message names the conversation it belongs to. Nothing observes the
      // intermediate state inside one transaction, but a future reader looking
      // for which owns which should find one answer, not two.
      const removedMessages = await this.messages.removeAllFor(userId);
      const removedConversations =
        await this.conversations.removeAllFor(userId);
      // Last, and unconditional. The counter is not a row anybody counts — it
      // is the sequence's memory, and it has to go whether or not the two above
      // found anything, because a partly purged member from an earlier failed
      // delivery would otherwise keep theirs forever.
      await this.seq.reset(userId);
      /*
       * And the member's own quick questions, which this handler was missing.
       *
       * The fourth collection this context owns, and the easiest to forget
       * because nothing else reads it: a deleted member's chips would have
       * outlived them, referencing a `userId` nothing could resolve. That is a
       * privacy leak of exactly the kind the purge exists to prevent — a
       * question somebody wrote is a sentence they wrote.
       *
       * The seeded globals are untouched. `removeAllFor` filters on this
       * member's id, and a global carries `null`, so the filter cannot reach
       * them — by the shape of the query rather than by a guard.
       */
      const removedQuestions = await this.questions.removeAllFor(userId);
      return [removedMessages, removedConversations, removedQuestions];
    });

    if (messages === 0 && conversations === 0 && questions === 0) {
      return 'nothing-to-do';
    }

    this.logger.log(
      `purged ${conversations} conversation(s), ${messages} message(s) and ` +
        `${questions} quick question(s) for ${userId}`,
    );
    return 'purged';
  }
}

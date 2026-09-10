import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import {
  Conversation,
  MAX_TITLE,
} from '../../domain/conversation.aggregate.js';
import { ConversationRepository } from '../../domain/conversations.repositories.js';

/** What a chat with no name yet is called until something renames it. */
export const UNTITLED = 'New chat';

export interface CreateConversationInput {
  id: string;
  title?: string | null;
}

/**
 * A chat the member started themselves. Always `free` — the two pinned kinds
 * come with the account and nothing else may mint one.
 *
 * ## Why a retried create returns the existing chat instead of failing
 *
 * The id arrives from the client. That is the phone's offline story: it mints a
 * uuidv7, writes the row locally, shows the chat immediately and pushes when it
 * can — so the same create can reach this handler twice, once from a request
 * that timed out on the wire after committing and once from the retry. Both
 * must leave one conversation, and the second must not be an error: a member
 * whose chat already exists is not a member with a problem.
 *
 * Which is why the existing row is returned rather than overwritten. A blind
 * `Conversation.create` on the same id would reset a title the member has since
 * changed, un-archive a chat they archived, and — worst — move
 * `clearedUpToSeq` back to zero, un-clearing a conversation the member cleared.
 * FR-011 says a clear is not reversible, and this is one of the two paths that
 * could have reversed it.
 *
 * ## Why `kind` is not a parameter
 *
 * `coach` and `planner` are singletons per member enforced by a partial unique
 * index, and they are created by `bootstrap-on-registered` from
 * `identity.UserRegistered`. A `kind` on this input would be a second creator
 * for them — reachable from a public route, before or after the bootstrap, with
 * whatever title the caller liked. The index would refuse the second row, and
 * the member would get a duplicate-key error out of a route that had no
 * business offering the option.
 */
@Injectable()
export class CreateConversationHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly conversations: ConversationRepository,
  ) {}

  async handle(
    userId: string,
    input: CreateConversationInput,
    at: Date = new Date(),
  ): Promise<Conversation> {
    return this.uow.run(async () => {
      const existing = await this.conversations.findById(userId, input.id);
      if (existing) return existing;

      const conversation = Conversation.create({
        id: input.id,
        userId,
        kind: 'free',
        // Trimmed and capped here as well as in `rename`, because `create` does
        // neither: a title is shown in a list, and a pasted paragraph is not a
        // title. Empty after trimming falls back to a placeholder rather than
        // storing `''`, which would render as a chat with no name at all in
        // every list on every client.
        title: (input.title ?? '').trim().slice(0, MAX_TITLE) || UNTITLED,
        at,
      });
      await this.conversations.save(conversation);
      return conversation;
    });
  }
}

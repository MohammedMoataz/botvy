import { Injectable } from '@nestjs/common';
import { AppendMessageHandler } from '../../conversations/features/append-message/append-message.handler.js';
import { KnowledgeTranscriptPort } from '../domain/knowledge.ports.js';

/**
 * Where this context is allowed to know another exists.
 *
 * `infrastructure/` is the one layer constitution IX exempts, because binding a
 * local port to somebody else's *published* surface is exactly its job — the
 * pattern P0 established with `admin-device.lookup.ts` and every phase since
 * has repeated. Nothing in `domain/` or `features/` imports any of this, and
 * `no-restricted-imports` refuses it anywhere else: `knowledge` was added to
 * that rule's pattern list in this phase, and the rule was probed by writing a
 * file that should fail and watching it do so.
 */

/**
 * The plain-reply fallback, written into the member's coach chat.
 *
 * Bound to Conversations' `append-message` command, exactly as the rhythm's
 * identical port is, and for the same reasons its comment gives: this context
 * does not open a message repository, does not know how a `seq` is issued, and
 * does not know the conversation's id — it hands over a sentence and
 * Conversations decides the rest. A second writer minting its own sequence
 * numbers would leave gaps, and a gap in that sequence is a message no device
 * will ever pull.
 *
 * The role is fixed to `assistant`. Nothing in Knowledge ever writes a member's
 * own turn.
 *
 * Used on **one** path: a suggestion draft that would not decode. The ordinary
 * path raises `knowledge.SuggestionReady` and lets Conversations write the
 * message from it — a context that both raised an event about a thing and also
 * wrote the message about it would give the member two.
 */
@Injectable()
export class ConversationsKnowledgeTranscript extends KnowledgeTranscriptPort {
  constructor(private readonly messages: AppendMessageHandler) {
    super();
  }

  async append(input: {
    userId: string;
    content: string;
    at: Date;
  }): Promise<{ seq: number } | null> {
    return this.messages.handle({
      userId: input.userId,
      kind: 'coach',
      role: 'assistant',
      content: input.content,
      at: input.at,
    });
  }
}

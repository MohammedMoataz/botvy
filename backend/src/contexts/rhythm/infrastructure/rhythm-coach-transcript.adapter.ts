import { Injectable } from '@nestjs/common';
import { AppendMessageHandler } from '../../conversations/features/append-message/append-message.handler.js';
import { CoachTranscriptPort } from '../domain/rhythm.ports.js';

/**
 * Writing a touch into the member's coach conversation — bound to
 * Conversations' `append-message` command.
 *
 * Same sanctioned seam as the other two adapters in this folder. What is worth
 * saying about *this* one is what it deliberately does not do.
 *
 * It does not open `MessageRepository`, and it does not know how a `seq` is
 * issued or that a `counters` document exists. Messages are immutable and
 * pulled by `seq > lastSeq` against a per-user counter, which is what makes the
 * phone's cursor cheap; a second writer that issued its own numbers would
 * either collide or leave gaps, and a gap in that sequence is a message no
 * device will ever pull. So the whole write goes through the one command that
 * owns the counter.
 *
 * It also does not know the conversation's id. The port hands over a *kind* —
 * `coach` for all three touches — and Conversations resolves it, which is the
 * right split because the pinned chats are created by *its* handler on
 * `identity.UserRegistered`. A rhythm that cached a conversation id would be
 * holding a value it did not mint and cannot re-derive.
 *
 * The role is fixed to `assistant` here rather than accepted as a parameter.
 * Every one of the three touches is Botvy speaking; nothing in this context
 * ever writes a member's own turn — that is P4's chat gateway, calling
 * `AppendMessageHandler` directly with `role: 'user'`. A `role` on
 * `CoachTranscriptPort` would be a parameter with one possible value, and the
 * day it had two the rhythm would be in the business of impersonating the
 * member.
 *
 * ## Why null is passed through rather than turned into a throw
 *
 * `handle` returns null when there is no such conversation, and this adapter
 * returns that null unchanged. The caller is a cron tick walking every member:
 * a throw would abort the pass partway through the roster, and — because the
 * tick claims the touch's date *before* building the message — every member
 * after the failure loses the day outright, with tomorrow's pass seeing a claim
 * already written and declining to retry. One member's missing message is a
 * smaller failure than the roster's, and a null the caller can log is how it
 * stays that size.
 */
@Injectable()
export class ConversationsCoachTranscript extends CoachTranscriptPort {
  constructor(private readonly messages: AppendMessageHandler) {
    super();
  }

  async append(input: {
    userId: string;
    kind: 'coach' | 'planner';
    content: string;
    at: Date;
  }): Promise<{ seq: number } | null> {
    return this.messages.handle({
      userId: input.userId,
      kind: input.kind,
      role: 'assistant',
      content: input.content,
      at: input.at,
    });
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { NudgeService } from '../../../../ws/nudge.service.js';
import type { CardItem } from '../../domain/chat.ports.js';
import {
  TurnRunner,
  type TurnEvents,
  type TurnErrorCode,
} from '../../application/turn-runner.js';

export interface BatchMessage {
  clientId: string;
  conversationId: string;
  text: string;
  /** When the member typed it. The turn is understood as of this moment. */
  composedAt: Date;
}

export interface BatchReply {
  conversationId: string;
  /** The client ids this conversation's turn consumed. */
  clientIds: string[];
  /** The assistant's answer, whole — there is no stream to a REST caller. */
  reply: string;
  assistantSeq: number;
  card?: { kind: string; items: CardItem[] };
  error?: { code: TurnErrorCode; message: string };
}

export interface BatchResult {
  accepted: string[];
  replies: BatchReply[];
}

/** `contracts/rest-commands.md`. More than this is a client that is broken. */
export const MAX_BATCH = 20;

/**
 * Messages composed offline, replayed when the network returns.
 *
 * ## One reply per conversation, not one per message
 *
 * A member who typed four things into the coach chat on a train does not want
 * four answers when they reconnect — they want one, about the four. So the
 * batch groups by conversation and runs **one turn** per group, with the
 * messages joined in the order they were typed. `spec.md`'s Assumptions say so
 * explicitly, and the alternative is a member reconnecting to a wall of text
 * they have to scroll past to reach the current one.
 *
 * The earlier messages are still *stored* individually, each with its own
 * `composedAt`, so the transcript reads as they wrote it. Only the answering is
 * collapsed.
 *
 * ## Understood as of when it was typed
 *
 * FR-007, and the one place this is genuinely surprising: "remind me in two
 * hours", typed at 14:10 and delivered at 20:00, resolves to 16:10 — which is
 * in the past. That is the *correct* reading of what they asked for, and the
 * executor refuses a past moment and asks. Resolving it against 20:00 instead
 * would silently create a 22:00 reminder they never wanted, and they would not
 * find out until it fired.
 *
 * ## The same runner, deliberately
 *
 * v1 had two entry points that each reimplemented the turn's tail, and the
 * offline path quietly stopped doing things the live path did. This collects
 * the runner's events into a reply instead of emitting them, which is the whole
 * difference between the two paths.
 */
@Injectable()
export class BatchHandler {
  private readonly logger = new Logger(BatchHandler.name);

  constructor(
    private readonly turns: TurnRunner,
    private readonly nudges: NudgeService,
  ) {}

  async handle(
    userId: string,
    messages: BatchMessage[],
    now = new Date(),
  ): Promise<BatchResult> {
    const capped = messages.slice(0, MAX_BATCH);
    const byConversation = new Map<string, BatchMessage[]>();
    for (const message of capped) {
      const group = byConversation.get(message.conversationId) ?? [];
      group.push(message);
      byConversation.set(message.conversationId, group);
    }

    const replies: BatchReply[] = [];
    const accepted: string[] = [];

    for (const [conversationId, group] of byConversation) {
      // Oldest first, so the joined text reads in the order they wrote it and
      // the turn is understood as of the *first* thing they said.
      const ordered = [...group].sort(
        (a, b) => a.composedAt.getTime() - b.composedAt.getTime(),
      );

      const collected = this.collector(conversationId);
      await this.turns.run(
        {
          userId,
          requestId: `batch:${conversationId}:${ordered[0]!.clientId}`,
          conversationId,
          text: ordered.map((message) => message.text).join('\n'),
          composedAt: ordered[0]!.composedAt,
          clientId: ordered[0]!.clientId,
        },
        collected.events,
        now,
      );

      const reply = collected.build(ordered.map((message) => message.clientId));
      replies.push(reply);
      // Accepted means stored, which a `forbidden` or `quota` turn was not.
      if (!reply.error) accepted.push(...reply.clientIds);
    }

    if (accepted.length > 0) {
      /*
       * The member's connected sockets are told to pull.
       *
       * A flush usually comes from the device that was offline, over REST —
       * but their *other* devices know nothing about it, and the messages are
       * immutable rows they will only see on their next pull. One nudge, after
       * the whole batch rather than per conversation, because three replies
       * arriving is one event from the member's point of view.
       */
      this.nudges.emit(userId, 'sync.nudge', {
        entities: ['messages'],
        reason: 'remote_edit',
      });
    }

    this.logger.log(
      `flushed ${capped.length} offline message(s) for ${userId} into ${byConversation.size} conversation(s)`,
    );
    return { accepted, replies };
  }

  /**
   * Collects a turn's events instead of emitting them.
   *
   * `chat.token` is accumulated rather than dropped: a REST caller gets the
   * whole answer, and a templated confirmation arrives through the same token
   * path as a streamed one — `ws-chat.md` says so — so a collector that
   * ignored tokens would return an empty reply for every action the planner
   * carried out.
   */
  private collector(conversationId: string): {
    events: TurnEvents;
    build(clientIds: string[]): BatchReply;
  } {
    const parts: string[] = [];
    let assistantSeq = 0;
    let card: { kind: string; items: CardItem[] } | undefined;
    let error: { code: TurnErrorCode; message: string } | undefined;
    let target = conversationId;

    const events: TurnEvents = {
      accepted: () => undefined,
      intent: () => undefined,
      // An off-topic message moved on replay lands in a new chat, and the
      // reply has to name where it went or the member never finds it.
      moved: ({ to }) => {
        target = to;
      },
      token: ({ text }) => {
        parts.push(text);
      },
      card: ({ kind, items }) => {
        card = { kind, items };
      },
      done: ({ seq }) => {
        assistantSeq = seq;
      },
      error: ({ code, message }) => {
        error = { code, message };
      },
    };

    return {
      events,
      build: (clientIds) => ({
        conversationId: target,
        clientIds,
        reply: parts.join(''),
        assistantSeq,
        ...(card ? { card } : {}),
        ...(error ? { error } : {}),
      }),
    };
  }
}

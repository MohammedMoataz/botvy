import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { newId } from '../../../../shared/cqrs/ids.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import {
  Conversation,
  type ConversationKind,
} from '../../domain/conversation.aggregate.js';
import { ConversationRepository } from '../../domain/conversations.repositories.js';

/**
 * The two chats every account comes with, and their titles.
 *
 * The title is a literal and not a settings key, unlike every default in
 * Profile's bootstrap. It is a name, not a knob: an Owner retuning "Coach" to
 * something else would rename the chat for members who registered after the
 * change and leave everyone else's alone, which is a split-brain product rather
 * than a configurable one. Localisation is a client concern — the phone renders
 * a pinned chat by its `kind`, which is why `kind` and not `title` is what the
 * unique index and every lookup are keyed on.
 */
const PINNED: ReadonlyArray<{ kind: ConversationKind; title: string }> = [
  { kind: 'coach', title: 'Coach' },
  { kind: 'planner', title: 'Planner' },
];

/**
 * Gives a new member their `coach` and `planner` chats.
 *
 * ## Why on registration and not on first use
 *
 * Because the first thing that writes into the coach chat is a rhythm touch
 * from a cron job, not a member opening a screen. The blueprint calls this out
 * as a capability three phases each credited to another phase and nobody built:
 * P1 and P3 both said the pinned conversations were "created in P1", P4 assumed
 * they existed, and the daily touches would have written into a conversation
 * that was never created — the append silently finding nothing and the member
 * getting a notification about a question that appears nowhere. Which is v1's
 * defect exactly, arriving by a different route.
 *
 * ## Why it reacts to an event rather than being called by `register`
 *
 * Identity is on PostgreSQL and this context is on MongoDB, so no transaction
 * can span the two. The account and `identity.UserRegistered` commit together
 * in `identity_outbox`, and the relay delivers the event here at least once.
 *
 * Which makes idempotency mandatory, not a nicety. Two deliveries must leave
 * one pair of chats: a second `Conversation.create` would mint a new `newId()`,
 * write a second `coach` row and raise a second `ConversationCreated`, and the
 * member would see two identical pinned chats with the transcript split between
 * them. The partial unique index on `{ userId, kind }` would refuse the write
 * — but only after the fact, and a handler whose idempotency is a caught
 * duplicate-key error swallows every other write failure with it. So the check
 * is a read, and the index is the backstop for the one case a read cannot
 * cover: two relay workers delivering the same event in the same instant.
 *
 * Per kind rather than per pair, because a crash between the two writes is
 * possible in principle and a handler idempotent only on the *pair* being
 * present would take its "already there" exit on the redelivery and never
 * finish the job. That is the bug Profile's bootstrap comment names; the two
 * writes are in one transaction here for the same reason, and the per-kind
 * check costs one extra read.
 */
@Injectable()
export class ConversationsBootstrapHandler {
  private readonly logger = new Logger(ConversationsBootstrapHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly conversations: ConversationRepository,
  ) {}

  async handle(event: DomainEvent): Promise<'created' | 'already-there'> {
    const userId = event.userId;
    if (!userId) {
      this.logger.warn(
        `${event.name} ${event.eventId} carries no userId; nothing to bootstrap`,
      );
      return 'already-there';
    }

    return this.uow.run(() => this.create(userId, event.occurredAt));
  }

  private async create(
    userId: string,
    at: Date,
  ): Promise<'created' | 'already-there'> {
    const existing = await Promise.all(
      PINNED.map(({ kind }) => this.conversations.byKind(userId, kind)),
    );

    const missing = PINNED.filter((_, index) => existing[index] === null);
    if (missing.length === 0) return 'already-there';

    for (const { kind, title } of missing) {
      await this.conversations.save(
        Conversation.create({
          // A uuidv7, not an ObjectId, because a conversation is a row the
          // phone syncs and P4 lets the member start one offline — the client
          // mints the id then, and a retried create is a no-op rather than a
          // duplicate. Both halves have to use the same id kind or the two
          // creation paths would disagree about what a conversation id is.
          id: newId(),
          userId,
          kind,
          title,
          at,
        }),
      );
    }

    this.logger.log(
      `bootstrapped ${missing.map((entry) => entry.kind).join(' and ')} for ${userId}`,
    );
    return 'created';
  }
}

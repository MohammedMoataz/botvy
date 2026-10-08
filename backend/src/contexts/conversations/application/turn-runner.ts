import { Injectable, Logger } from '@nestjs/common';
import { OllamaClient } from '../../../shared/llm/ollama.client.js';
import { SettingsService } from '../../../shared/settings/settings.service.js';
import { localDate, wallClockToUtc } from '../../../shared/time/time.js';
import {
  AllergenGuardPort,
  CheckinPort,
  IntentExecutorPort,
  IntentExtractorPort,
  MemberFactsPort,
  PromptAssemblerPort,
  UsagePort,
  type CardItem,
  type ProposalRef,
  type MemberFacts,
} from '../domain/chat.ports.js';
import {
  Conversation,
  PINNED_KINDS,
  type ConversationKind,
} from '../domain/conversation.aggregate.js';
import { ConversationRepository } from '../domain/conversations.repositories.js';
import { isAction, titleFromMessage, type Intent } from '../domain/intent.js';
import { newId } from '../../../shared/cqrs/ids.js';
import { UnitOfWork } from '../../../shared/persistence/ports/unit-of-work.js';
import { AppendMessageHandler } from '../features/append-message/append-message.handler.js';
import {
  ProposalRepository,
  type Proposal,
} from '../domain/proposal.repository.js';

/** What a turn tells its caller, as it happens. */
export interface TurnEvents {
  accepted(payload: {
    requestId: string;
    conversationId: string;
    seq: number;
  }): void;
  intent(payload: { requestId: string; name: string; scope: string }): void;
  moved(payload: {
    requestId: string;
    from: string;
    to: string;
    title: string;
  }): void;
  token(payload: { requestId: string; text: string }): void;
  card(payload: {
    requestId: string;
    kind: string;
    items: CardItem[];
    /** Present on a `confirm` card (032). */
    proposal?: ProposalRef;
  }): void;
  done(payload: {
    requestId: string;
    conversationId: string;
    seq: number;
    usage?: {
      model: string;
      promptTokens: number;
      completionTokens: number;
      ms: number;
    };
    actions: Array<{ kind: string; id?: string }>;
  }): void;
  error(payload: {
    requestId: string;
    code: TurnErrorCode;
    message: string;
  }): void;
}

/**
 * The codes a client branches on. Strings rather than numbers because they
 * cross the socket and a client reading `4` would have to hold a table.
 */
export type TurnErrorCode =
  'forbidden' | 'quota' | 'rate_limited' | 'model_unavailable' | 'internal';

/*
 * These are the codes `contracts/ws-chat.md` fixes, with one addition and one
 * deliberate absence.
 *
 * **`forbidden` was added to the contract** by this phase. The contract listed
 * `protected`, which means something else entirely — a pinned conversation
 * refusing to be deleted — and FR-020 needs a code for "that conversation is
 * not yours". Answering that with `protected` would tell the member the
 * conversation exists and is merely defended, which is the one bit FR-020 says
 * they must not learn.
 *
 * **There is no `allergen` code**, and that is FR-018 read literally: the
 * answer is "stopped, discarded, and *replaced with a short apology*". The
 * apology is an ordinary assistant message followed by `chat.done`, so the
 * client renders one path and the member reads a sentence rather than handling
 * an error state. An error frame beside it would be the same event told twice.
 */

export interface TurnRequest {
  userId: string;
  requestId: string;
  conversationId: string;
  text: string;
  /** When the member typed it, which is not when it arrived (FR-007). */
  composedAt?: Date;
  clientId?: string;
  /** Raised by `chat.cancel`. A disconnect does **not** raise it. */
  signal?: AbortSignal;
}

/**
 * The one place a turn's steps are ordered.
 *
 * ## Why this class exists at all
 *
 * v1 had an 802-line `ChatService` with two entry points that each
 * reimplemented the same tail, and they drifted — the offline replay path
 * stopped doing things the live path did, and nobody noticed because both
 * "worked". This orders the steps and calls a collaborator for each, so the
 * socket and the batch endpoint share one implementation and no step knows
 * about another.
 *
 * Read the ordering as the product rules it encodes:
 *
 * **The allowance is checked before the member's message is stored.** A
 * refused turn should leave nothing behind; storing first would fill a
 * conversation with messages that were never answered.
 *
 * **The check-in short-circuits before extraction.** "Yes, did everything" is
 * an answer to a question, not an instruction, and running it through the
 * extractor first would sometimes make it one.
 *
 * **The move decision comes before any token.** `ws-chat.md` requires it and
 * FR-008 is the reason: an off-topic message must never leave a trace in a
 * pinned chat, and a reply that had already started streaming is a trace.
 *
 * **An action never reaches the model.** The intent is executed, the
 * confirmation is templated from what was *stored*, and the turn ends. A model
 * asked to confirm what it just did will confirm something plausible instead.
 *
 * ## A disconnect is not a cancel
 *
 * Only `signal` aborts, and only `chat.cancel` raises it. A socket that drops
 * mid-answer leaves the turn running: the answer is finished, stored, and the
 * member's other devices are nudged, so whichever device they pick up next has
 * it. Leaving is not stopping — FR-021 — and the opposite behaviour would mean
 * a member who locked their phone lost the answer they were waiting for.
 */
@Injectable()
export class TurnRunner {
  private readonly logger = new Logger(TurnRunner.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly conversations: ConversationRepository,
    private readonly append: AppendMessageHandler,
    private readonly facts: MemberFactsPort,
    private readonly usage: UsagePort,
    private readonly checkins: CheckinPort,
    private readonly extractor: IntentExtractorPort,
    private readonly executor: IntentExecutorPort,
    private readonly prompts: PromptAssemblerPort,
    private readonly allergens: AllergenGuardPort,
    private readonly llm: OllamaClient,
    private readonly settings: SettingsService,
    private readonly proposals: ProposalRepository,
  ) {}

  async run(
    request: TurnRequest,
    events: TurnEvents,
    now = new Date(),
  ): Promise<void> {
    const { userId, requestId } = request;

    try {
      // ---- 0. the conversation, and whose it is -------------------------
      // Two independent reads, each a round trip to the store, so neither
      // waits on the other (031). A foreign conversation then wastes one facts
      // read, and the refusal below is still the first thing anybody sees.
      const [found, memberFacts] = await Promise.all([
        this.conversations.findById(userId, request.conversationId),
        this.facts.forMember(userId),
      ]);
      let conversation = found;
      if (!conversation || conversation.deletedAt) {
        /*
         * `forbidden` and never `not_found`, for both cases.
         *
         * FR-020: a member naming somebody else's conversation must learn
         * nothing about it, and "not found" versus "forbidden" is exactly the
         * bit that tells them whether it exists. The repository read is scoped
         * by `userId`, so a foreign id and a missing id are already
         * indistinguishable here — which is the point, and why the scoping is
         * in the query rather than in a check after it.
         */
        events.error({
          requestId,
          code: 'forbidden',
          message: 'That conversation is not yours.',
        });
        return;
      }

      const allowance = await this.checkAllowance(userId, memberFacts, now);
      if (allowance) {
        events.error({ requestId, code: 'quota', message: allowance });
        return;
      }

      // ---- 1. the member's own message ----------------------------------
      const stored = await this.append.handle({
        userId,
        conversationId: conversation.id,
        role: 'user',
        content: request.text,
        clientId: request.clientId ?? null,
        composedAt: request.composedAt ?? null,
        at: now,
      });
      if (!stored) {
        events.error({
          requestId,
          code: 'internal',
          message: 'Your message could not be saved.',
        });
        return;
      }
      events.accepted({
        requestId,
        conversationId: conversation.id,
        seq: stored.seq,
      });

      /*
       * The moment a turn is understood as of.
       *
       * `composedAt` when the member typed it offline, `now` otherwise —
       * FR-007. "Remind me in two hours" typed at 14:10 and delivered at 20:00
       * means 16:10, which is in the past, and that is the *correct* reading of
       * what they asked for: the executor then refuses a past moment and says
       * so, where resolving it against 20:00 would silently invent a reminder
       * they never wanted.
       */
      const asOf = request.composedAt ?? now;

      // ---- 1b. an answer to a change the chat proposed (032) ------------
      /*
       * Before the check-in, deliberately. A proposal was asked at most fifteen
       * minutes ago in *this* conversation, so a short "yes" here answers it;
       * the check-in question is the evening's and keeps waiting. Only a short
       * message counts, and only whole words: "yes, and add milk" is a new
       * instruction, and "cancel" is never read as a No because "cancel my
       * meeting" is the sentence most likely to follow a proposal.
       */
      const answer = yesOrNo(request.text);
      if (answer !== null) {
        const open = await this.proposals.openIn(userId, conversation.id, now);
        if (open) {
          await this.answer(open, answer, conversation, requestId, events, now);
          return;
        }
      }

      // ---- 2. the evening check-in, if one is awaited --------------------
      if (PINNED_KINDS.includes(conversation.kind)) {
        const capture = await this.checkins.capture({
          userId,
          conversationKind: conversation.kind,
          text: request.text,
          at: now,
        });
        if (capture.captured) {
          const reply =
            capture.streak && capture.streak > 0
              ? `Logged. That is ${capture.streak} day${capture.streak === 1 ? '' : 's'} in a row.`
              : 'Logged — tomorrow is a fresh start.';
          await this.reply(conversation, reply, requestId, events, now, {
            checkin: true,
          });
          return;
        }
        // `unclear` and every other reason fall through to an ordinary turn,
        // and the question stays open. Guessing a verdict costs the member
        // their streak; asking again costs a sentence.
      }

      // ---- 3. what they asked for ---------------------------------------
      const intent = await this.extractor.extract({
        text: request.text,
        now: asOf,
        timezone: memberFacts.timezone,
      });
      events.intent({ requestId, name: intent.name, scope: intent.scope });

      // ---- 4. the move, before a single token ---------------------------
      const moved = await this.moveIfOffTopic(
        conversation,
        intent,
        request.text,
        requestId,
        events,
        now,
      );
      if (moved) conversation = moved;

      // ---- 5. an action, executed and confirmed from what was stored ----
      if (isAction(intent)) {
        const result = await this.executor.execute({
          userId,
          intent,
          text: request.text,
          now: asOf,
          facts: memberFacts,
          conversationId: conversation.id,
        });
        if (result.card) {
          events.card({
            requestId,
            kind: result.card.kind,
            items: result.card.items,
            ...(result.card.proposal ? { proposal: result.card.proposal } : {}),
          });
        }
        await this.reply(conversation, result.reply, requestId, events, now, {
          intent: {
            name: intent.name,
            scope: intent.scope,
            asking: result.asking,
          },
          actions: result.actions,
        });
        return;
      }

      // ---- 6 & 7. the model, watched on the way out ---------------------
      await this.converse(
        conversation,
        request,
        memberFacts,
        intent,
        requestId,
        events,
        now,
      );
    } catch (error) {
      this.logger.error(
        `turn ${requestId} for ${userId} failed: ${(error as Error).message}`,
      );
      events.error({
        requestId,
        code: 'internal',
        message: 'Something went wrong answering that. Your message was kept.',
      });
    }
  }

  /**
   * `chat.confirm` — the member tapped Yes or No on a proposal (032).
   *
   * The answer becomes an ordinary assistant message in the proposal's own
   * conversation, through `reply`, so every client renders one path. The
   * refusals are codes the client can branch on: `forbidden` for an id that is
   * not theirs (or does not exist — the two are indistinguishable on purpose,
   * FR-020's rule), `answered` for one already applied or declined, and
   * `expired`.
   */
  async confirm(
    input: {
      userId: string;
      requestId: string;
      proposalId: string;
      accept: boolean;
    },
    events: TurnEvents,
    now = new Date(),
  ): Promise<{ ok: boolean; error?: 'forbidden' | 'answered' | 'expired' }> {
    const proposal = await this.proposals.find(input.userId, input.proposalId);
    if (!proposal) return { ok: false, error: 'forbidden' };
    if (proposal.status !== 'open') return { ok: false, error: 'answered' };
    if (proposal.expiresAt.getTime() <= now.getTime()) {
      return { ok: false, error: 'expired' };
    }
    const conversation = await this.conversations.findById(
      input.userId,
      proposal.conversationId,
    );
    if (!conversation || conversation.deletedAt) {
      return { ok: false, error: 'forbidden' };
    }

    const answered = await this.answer(
      proposal,
      input.accept,
      conversation,
      input.requestId,
      events,
      now,
    );
    return answered ? { ok: true } : { ok: false, error: 'answered' };
  }

  /**
   * Claim, then apply — or decline. False when another answer got there first.
   *
   * The claim is atomic and comes before any write, so a tap and a typed
   * "yes" landing together apply the change once; the loser is told it was
   * already answered.
   */
  private async answer(
    proposal: Proposal,
    accept: boolean,
    conversation: Conversation,
    requestId: string,
    events: TurnEvents,
    now: Date,
  ): Promise<boolean> {
    const settled = accept
      ? await this.proposals.claim(proposal.userId, proposal.id, now)
      : await this.proposals.decline(proposal.userId, proposal.id, now);
    if (!settled) {
      await this.reply(
        conversation,
        proposal.arabic
          ? 'السؤال ده اتجاوب عليه أو خلص وقته.'
          : 'That was already answered, or it has expired.',
        requestId,
        events,
        now,
      );
      return false;
    }

    const result = accept
      ? await this.executor.applyProposal(settled, now)
      : this.executor.declined(settled);
    await this.reply(conversation, result.reply, requestId, events, now, {
      intent: {
        name: 'confirm',
        accepted: accept,
        proposalId: proposal.id,
      },
      actions: result.actions,
    });
    return true;
  }

  // ------------------------------------------------------------------ steps

  /**
   * The member's own day's worth of tokens, against the operator's allowance.
   *
   * **The member's day, not the server's.** Principle XI, and "when it resets"
   * is a user-facing moment like any other: a member in Cairo and a member in
   * Berlin cross their own midnights. v1 summed per UTC day, which meant an
   * Egyptian member's allowance reset at two in the morning.
   *
   * Returns the message to send, or null when there is room.
   */
  private async checkAllowance(
    userId: string,
    facts: MemberFacts,
    now: Date,
  ): Promise<string | null> {
    const quota = await this.settings.get('chat.dailyQuotaTokens');
    if (quota <= 0) return null; // 0 turns the allowance off.

    const today = localDate(now, facts.timezone);
    const from = wallClockToUtc(`${today}T00:00`, facts.timezone);
    const to = wallClockToUtc(`${nextLocalDate(today)}T00:00`, facts.timezone);
    if (!from || !to) return null; // An unreadable zone must not lock them out.

    const used = await this.usage.tokensBetween(userId, from, to);
    if (used < quota) return null;

    // The reset stated in their own zone, because a member told "resets at
    // 00:00 UTC" has been told to do arithmetic.
    return (
      `You have used today's chat allowance of ${quota.toLocaleString('en')} tokens. ` +
      `It resets at midnight your time (${facts.timezone}).`
    );
  }

  /**
   * Moves an off-topic turn out of a pinned chat, before it is answered.
   *
   * The rule is exactly `pinned && scope === 'other'`. A `planning` intent in
   * Coach executes where it was typed, and so does a `coaching` one in
   * Planner: both pinned chats are Botvy talking about the member's own day,
   * and bouncing every reminder into Planner would split one conversation in
   * half. Only something about neither gets its own chat.
   *
   * The title is the member's first six words — their words, not a
   * model-written summary. It costs no second call on a turn that is already
   * slow, it cannot hallucinate a subject, and they recognise the row in a list
   * because they wrote it.
   */
  private async moveIfOffTopic(
    conversation: Conversation,
    intent: Intent,
    text: string,
    requestId: string,
    events: TurnEvents,
    now: Date,
  ): Promise<Conversation | null> {
    if (!conversation.pinned || intent.scope !== 'other') return null;

    const title = titleFromMessage(text);
    const created = Conversation.create({
      id: newId(),
      userId: conversation.userId,
      kind: 'free' as ConversationKind,
      title,
      at: now,
    });
    await this.uow.run(() => this.conversations.save(created));

    events.moved({
      requestId,
      from: conversation.id,
      to: created.id,
      title,
    });
    this.logger.log(
      `moved an off-topic turn out of ${conversation.kind} into ${created.id}`,
    );
    return created;
  }

  /** Steps 6 and 7: stream an answer, watching it, then store it. */
  private async converse(
    conversation: Conversation,
    request: TurnRequest,
    facts: MemberFacts,
    intent: Intent,
    requestId: string,
    events: TurnEvents,
    now: Date,
  ): Promise<void> {
    const [model, numCtx, maxTokens] = await Promise.all([
      this.settings.get('llm.chatModel'),
      this.settings.get('llm.numCtx'),
      this.settings.get('llm.chatMaxTokens'),
    ]);

    const messages = await this.prompts.build({
      userId: request.userId,
      kind: conversation.kind,
      text: request.text,
      conversationId: conversation.id,
      floorSeq: conversation.clearedUpToSeq,
      now,
      facts,
    });

    const scan = this.allergens.forMember(facts.allergies);
    const parts: string[] = [];
    let usage: {
      model: string;
      promptTokens: number;
      completionTokens: number;
      ms: number;
    } | null = null;
    let cancelled = false;

    try {
      const stream = this.llm.chat(messages, {
        model,
        numCtx,
        maxTokens,
        ...(request.signal ? { signal: request.signal } : {}),
      });

      for (;;) {
        const next = await stream.next();
        if (next.done) {
          usage = next.value ?? null;
          break;
        }
        const chunk = next.value;

        /*
         * The guard sees the accumulated answer, not the chunk.
         *
         * A model emits "pea" then "nut", so a per-chunk check would never see
         * the word. It aborts on the chunk that first *completes* the
         * allergen's name, which is what makes "the member never reads it"
         * true rather than aspirational — and it is why the partial is
         * discarded instead of stored: a stored partial is a partial the phone
         * pulls.
         */
        const named = scan.push(chunk);
        if (named) {
          await stream.return?.(null as never);
          this.logger.warn(
            `answer for ${request.userId} named a declared allergen and was discarded`,
          );
          const apology =
            'I could not answer that safely — it involved something you have ' +
            'told me you are allergic to. Ask me again and I will keep it clear of that.';
          /*
           * The apology is an ordinary assistant message, not an error frame.
           *
           * FR-018 says the answer is replaced with a short apology, and a
           * member reading a sentence is better served than a client handling
           * an error state — especially since nothing went wrong from their
           * side. `allergenBlocked` on the stored intent is how an operator
           * finds these later; the member just reads the apology.
           */
          await this.reply(conversation, apology, requestId, events, now, {
            intent: {
              name: intent.name,
              scope: intent.scope,
              allergenBlocked: true,
            },
          });
          return;
        }

        parts.push(chunk);
        events.token({ requestId, text: chunk });
      }
    } catch (error) {
      /*
       * An abort is the member pressing Stop, and what arrived is kept.
       *
       * `usage` stays null here, and so it does on the allergen branch above:
       * Ollama reports `prompt_eval_count` and `eval_count` in the `done` frame
       * and nowhere else, and a stream that was cut has no `done` frame. So the
       * tokens this turn really spent are **not counted** against
       * `chat.dailyQuotaTokens` (E-013), and the admin usage screen says so
       * rather than presenting its figure as exact. The other limit still
       * applies in full: `chat.ratePerMin` counts `chat.send` calls, so the
       * uncounted work is bounded by that rate rather than unbounded.
       *
       * The field that would close it is `ChatUsage` built from an aborted
       * response — see the note at the `frame.done` branch in
       * `OllamaClient.chat`, which is where such a value would have to be read.
       * One line here then: `usage = <what the abort reported>`.
       */
      if (request.signal?.aborted) {
        cancelled = true;
      } else {
        this.logger.warn(`model unavailable: ${(error as Error).message}`);
        events.error({
          requestId,
          code: 'model_unavailable',
          message:
            'The model is not answering right now. Your message is saved — try again shortly.',
        });
        return;
      }
    }

    const answer = parts.join('');
    if (answer.length === 0 && !cancelled) {
      events.error({
        requestId,
        code: 'model_unavailable',
        message: 'The model returned nothing. Your message is saved.',
      });
      return;
    }

    await this.reply(conversation, answer, requestId, events, now, {
      usage,
      // Already emitted chunk by chunk as the model wrote it.
      streamed: true,
      intent: cancelled
        ? { name: intent.name, scope: intent.scope, cancelled: true }
        : { name: intent.name, scope: intent.scope },
    });
  }

  /**
   * Stores an assistant message and closes the turn.
   *
   * Every branch above ends here, which is deliberate: there is exactly one
   * place an answer is persisted and exactly one place `chat.done` is emitted,
   * so a branch cannot forget either. v1's two entry points each had their own
   * tail and that is precisely what drifted.
   */
  private async reply(
    conversation: Conversation,
    content: string,
    requestId: string,
    events: TurnEvents,
    now: Date,
    extra: {
      usage?: {
        model: string;
        promptTokens: number;
        completionTokens: number;
        ms: number;
      } | null;
      intent?: Record<string, unknown>;
      actions?: Array<{ kind: string; id?: string }>;
      checkin?: boolean;
      /** True when the caller already emitted this text as it arrived. */
      streamed?: boolean;
    } = {},
  ): Promise<void> {
    /*
     * A templated answer is emitted as a token too, so there is one path.
     *
     * `contracts/ws-chat.md`: "Templated confirmations (intents executed in
     * code) still arrive as `chat.token` + `chat.done` so clients render one
     * path." Without this, every branch that does *not* call the model — the
     * check-in acknowledgement, every planner confirmation, every question
     * about a missing field, the allergen apology — reached the client as a
     * bare `chat.done` with no text in it, and the member watched their
     * message send and nothing come back.
     *
     * It is also what makes the batch endpoint work at all: its collector
     * accumulates tokens, so a confirmation that emitted none would come back
     * as an empty reply.
     */
    if (!extra.streamed && content.length > 0) {
      events.token({ requestId, text: content });
    }

    const stored = await this.append.handle({
      userId: conversation.userId,
      conversationId: conversation.id,
      role: 'assistant',
      content,
      usage: extra.usage ?? null,
      intent: extra.intent ?? null,
      at: now,
    });

    events.done({
      requestId,
      conversationId: conversation.id,
      seq: stored?.seq ?? 0,
      ...(extra.usage ? { usage: extra.usage } : {}),
      actions: extra.actions ?? [],
    });
  }
}

/**
 * A short Yes or No, in either language — or null for anything else (032).
 *
 * Whole words over a short message only, the check-in classifier's rule: "not"
 * inside a sentence is not an answer, and neither is a yes followed by a new
 * instruction. "cancel" is deliberately not a No — "cancel my meeting" is the
 * sentence most likely to arrive while a proposal is open.
 */
export function yesOrNo(text: string): boolean | null {
  const words = text
    .toLowerCase()
    .replace(/[.!?,؟،]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0 || words.length > 4) return null;
  const phrase = words.join(' ');
  if (YES.has(phrase) || (words.length <= 2 && words.some((w) => YES.has(w)))) {
    return true;
  }
  if (NO.has(phrase) || (words.length <= 2 && words.some((w) => NO.has(w)))) {
    return false;
  }
  return null;
}

const YES = new Set([
  'yes',
  'yeah',
  'yep',
  'yup',
  'y',
  'ok',
  'okay',
  'sure',
  'confirm',
  'confirmed',
  'do it',
  'go ahead',
  'yes please',
  'نعم',
  'ايوه',
  'أيوه',
  'ايوة',
  'أيوة',
  'اه',
  'آه',
  'تمام',
  'موافق',
  'اكيد',
  'أكيد',
]);

const NO = new Set([
  'no',
  'nope',
  'nah',
  'n',
  "don't",
  'dont',
  'no thanks',
  'leave it',
  'لا',
  'لأ',
  'لاء',
  'بلاش',
  'سيبها',
]);

/** Calendar arithmetic, not millisecond arithmetic — a local day is not 24 h twice a year. */
function nextLocalDate(date: string): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}

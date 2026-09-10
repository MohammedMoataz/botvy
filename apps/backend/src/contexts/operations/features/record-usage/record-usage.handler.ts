import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { UsageRepository } from '../../domain/usage.repository.js';

/**
 * What the event carries. Loosely mirrored rather than imported: the type lives
 * in `contexts/conversations/domain/message.aggregate.ts` as `MessageUsage`, and
 * importing it from here would be one context reaching into another's domain —
 * which `no-restricted-imports` refuses and constitution IX forbids. A
 * `DomainEvent` payload is `unknown` by design; the envelope is `shared/`, and
 * agreeing on the *shape* of a payload through the event catalogue is what an
 * event contract is. `contracts/events.md` is where the two halves are held to
 * each other, not a shared TypeScript interface.
 */
interface MessageSentPayload {
  conversationId?: string;
  seq?: number;
  role?: string;
  usage?: {
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    ms?: number;
  } | null;
}

/**
 * One `usage_log` row per model call, from `conversations.MessageSent`.
 *
 * This handler is one half of the only crossing between Conversations and
 * Operations. Conversations never opens `usage_log` and Operations never opens
 * `messages`; the counts come across on the event and the daily total goes back
 * through `UsageTodayQuery`. **Without this loop the allowance sums an empty
 * collection and every member sits permanently at zero used — a limit that
 * silently does not exist**, which is worse than no limit at all, because the
 * setting, the error message and the admin screen all exist and all agree that
 * a limit is being enforced.
 *
 * ## Nothing is written for the member's own turn
 *
 * `usage` is null on the member's message, which costs nothing to produce. A row
 * for it would carry zeroes, and a log whose rows may be zero is a log whose row
 * count means nothing: "how many model calls did this member make today" stops
 * being answerable by counting, and every reader of the collection — this
 * phase's sum, P10's admin screen, whatever asks next — has to learn the
 * exception separately. One of them will not.
 *
 * ## Idempotent on `eventId`, at the index and not here
 *
 * The relay delivers at least once, so a redelivered `MessageSent` reaches this
 * method twice and must not spend the member's allowance twice. The guard is the
 * unique index on `usage_log.eventId`, enforced in the adapter, because a
 * read-then-write check in this class would lose the race between two relay
 * workers — and losing it would be invisible: two legitimate turns and one
 * double-counted event look identical once the rows are written.
 */
@Injectable()
export class RecordUsageHandler {
  private readonly logger = new Logger(RecordUsageHandler.name);

  constructor(private readonly usage: UsageRepository) {}

  async handle(
    event: DomainEvent,
  ): Promise<'recorded' | 'already-recorded' | 'no-usage'> {
    const payload = (event.payload ?? {}) as MessageSentPayload;
    const usage = payload.usage;

    // The member's own turn. See above: no row, deliberately.
    if (!usage) return 'no-usage';

    const userId = event.userId;
    if (!userId) {
      // Not silently ignored: a usage-bearing event with no member attached
      // means the allowance for whoever made that call is not being counted,
      // and the symptom of that is a member who never hits their limit. It is
      // not worth failing the relay over — the answer was already given to the
      // member — but it must be findable in the log.
      this.logger.warn(
        `${event.name} ${event.eventId} carries usage but no userId; not counted against any allowance`,
      );
      return 'no-usage';
    }

    const outcome = await this.usage.append({
      userId,
      // Every row this handler writes is a chat turn. The other kinds in the
      // data model (`intent`, `summarize`, `suggest`, `plan`) are written by
      // whoever makes those calls, through the same port; this slice is not the
      // place to guess which one an event was.
      kind: 'chat',
      model: usage.model ?? 'unknown',
      promptTokens: usage.promptTokens ?? 0,
      completionTokens: usage.completionTokens ?? 0,
      ms: usage.ms ?? 0,
      eventId: event.eventId,
      // The turn's own moment, not now. The window query reads this, and a
      // relay catching up after an outage must not bill yesterday's turns to
      // today — a member would wake to an allowance already spent.
      createdAt: event.occurredAt,
    });

    if (outcome === 'already-recorded') {
      this.logger.debug(
        `${event.name} ${event.eventId} was already counted; redelivery wrote nothing`,
      );
      return 'already-recorded';
    }

    return 'recorded';
  }
}

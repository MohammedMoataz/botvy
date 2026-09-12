import { Injectable } from '@nestjs/common';
import { UsageRepository } from '../../domain/usage.repository.js';

/**
 * How many tokens a member has spent between two instants.
 *
 * The read half of the usage loop, and the published surface Conversations
 * binds `UsagePort` to. Conversations calls this at step 0 of every turn to
 * decide whether the member is still inside `chat.dailyQuotaTokens`; it never
 * opens `usage_log`, and this context never opens `messages`.
 *
 * ## Why the window is a pair of instants and not a date
 *
 * "Today" is not a fact this context can know. It depends on the member's time
 * zone, which lives in their profile, and resolving it here would mean either
 * reading another context's store or reading the API's own `TZ` — and the second
 * of those, done once, shifted every extracted reminder by three hours. So the
 * caller resolves their local midnights through `shared/time` and hands both
 * ends over; a member in Cairo and a member in Berlin get their own days, and
 * the `quota` error can name the reset in the member's own wall clock.
 *
 * A port left to guess whose day it is guesses the server's, and gets it right
 * for exactly the members who happen to share the server's offset.
 */
@Injectable()
export class UsageTodayQueryHandler {
  constructor(private readonly usage: UsageRepository) {}

  /**
   * The sum of `promptTokens + completionTokens` over `[from, to)`.
   *
   * Half-open: `to` is the next local midnight and a turn stamped exactly on it
   * belongs to the next day, not to both.
   */
  async tokensBetween(userId: string, from: Date, to: Date): Promise<number> {
    // An inverted or empty window would return zero, and zero is the one answer
    // this method must never give wrongly: it reads as "this member has spent
    // nothing", so the allowance would let every turn through and the limit
    // would silently not exist — which is the exact failure the whole loop was
    // added to fix. A caller that computed its midnights the wrong way round
    // should find out on the first turn, loudly, not ship a quota that never
    // fires.
    if (to.getTime() <= from.getTime()) {
      throw new Error(
        `UsageTodayQuery needs from < to; got from=${from.toISOString()} to=${to.toISOString()}. ` +
          "Both ends are the member's own local midnights, resolved through shared/time.",
      );
    }

    return this.usage.tokensBetween(userId, from, to);
  }
}

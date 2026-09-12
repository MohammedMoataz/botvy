import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { localDate } from '../../../../shared/time/time.js';
import type { WithheldReason } from '../../domain/meal-suggestion.aggregate.js';
import { MealModePort } from '../../domain/nutrition.ports.js';
import { MealSuggestionRepository } from '../../domain/nutrition.repositories.js';
import { BuildMealLineHandler } from '../build-meal-line/build-meal-line.handler.js';

export interface MealHalf {
  date: string;
  line: string | null;
  reason: WithheldReason | null;
  /**
   * Whether this call chose the day, as opposed to reading one already chosen.
   *
   * The caller that cares is the profile consumer, which reports a redelivery
   * as a replay — and a spec asserting "the second delivery cost no model call"
   * needs something to assert against that is not the absence of a log line.
   */
  rebuilt: boolean;
}

export class PastDayIsSettled extends Error {
  constructor(date: string) {
    super(`${date} has already happened; its meals are what they were.`);
  }
}

/**
 * The day's meals, chosen — once on demand, or again because somebody asked.
 *
 * ## Two entry points, because "build it if it is missing" and "build it again"
 * ## are different questions
 *
 * `ensure` is what the rhythm's evening and morning touches ask, through
 * `TodayMealsPort`: *what is this member eating on this date* — and a day that
 * has never been chosen is chosen now, because there is no other moment at
 * which it would be. It is a read that writes on its first call, and naming
 * that plainly is better than the alternatives: a query that silently returned
 * null would leave the briefing with no meal half until some other pass
 * happened to run, and a nightly job would choose meals for every member on the
 * installation whether or not they ever open the app.
 *
 * `regenerate` is the member tapping "again" (FR-010) and the profile consumer
 * reacting to a new allergy (FR-013). It rebuilds whatever is there.
 *
 * ## Past days are settled
 *
 * FR-011. `regenerate` refuses a date behind the member's own today rather than
 * silently answering with the stored row, because the caller asked for a change
 * and would otherwise believe it happened. `ensure` does *not* refuse: the
 * question it answers is "what did this day say", and a past day with no row is
 * a day nobody ever asked about — the honest answer is the empty one it gets.
 * Building one would rewrite history with today's library.
 */
@Injectable()
export class RegenerateTodayHandler {
  constructor(
    private readonly build: BuildMealLineHandler,
    private readonly suggestions: MealSuggestionRepository,
    private readonly mode: MealModePort,
    private readonly member: MemberContextPort,
  ) {}

  /** The member's own today, which is the only "today" this context knows. */
  async todayFor(userId: string, at: Date = new Date()): Promise<string> {
    const { timezone } = await this.member.clock(userId);
    return localDate(at, timezone);
  }

  async ensure(
    userId: string,
    date: string,
    at: Date = new Date(),
  ): Promise<MealHalf> {
    const existing = await this.suggestions.forDate(userId, date);
    if (existing) {
      return {
        date,
        line: existing.line,
        reason: existing.withheldReason,
        rebuilt: false,
      };
    }

    const today = await this.todayFor(userId, at);
    if (date < today) {
      return { date, line: null, reason: null, rebuilt: false };
    }

    return this.rebuild(userId, date, at);
  }

  /**
   * Build the day again.
   *
   * `causeEventId` makes the rebuild **idempotent** and is how FR-013's
   * consumer stays honest: the relay delivers at least once, and in suggestion
   * mode a second delivery is a second model call for an answer already given —
   * one a member watching their card would see change for no reason. A day
   * already built for that event is returned as it stands.
   *
   * Null — a member tapping "again" — is deliberately not idempotent. Two taps
   * mean two answers.
   */
  async regenerate(
    userId: string,
    date: string,
    at: Date = new Date(),
    causeEventId: string | null = null,
  ): Promise<MealHalf> {
    const today = await this.todayFor(userId, at);
    if (date < today) throw new PastDayIsSettled(date);

    if (causeEventId) {
      const existing = await this.suggestions.forDate(userId, date);
      if (existing?.wasCausedBy(causeEventId)) {
        return {
          date,
          line: existing.line,
          reason: existing.withheldReason,
          rebuilt: false,
        };
      }
    }

    return this.rebuild(userId, date, at, causeEventId);
  }

  /**
   * The mode is read per call rather than passed in.
   *
   * A member who switches to "my meals" and taps regenerate in the same breath
   * means the switch, and a mode captured by the caller would be the one they
   * had a moment ago. It is one preference read against a rebuild that may talk
   * to a language model.
   */
  private async rebuild(
    userId: string,
    date: string,
    at: Date,
    causeEventId: string | null = null,
  ): Promise<MealHalf> {
    const mode = await this.mode.modeFor(userId);
    const built = await this.build.handle(userId, date, mode, at, causeEventId);
    return { date, line: built.line, reason: built.reason, rebuilt: true };
  }
}

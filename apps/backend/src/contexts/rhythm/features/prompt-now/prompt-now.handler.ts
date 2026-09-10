import { Injectable, Logger } from '@nestjs/common';
import { localDate } from '../../../../shared/time/time.js';
import {
  MemberSchedulePort,
  type MemberSchedule,
} from '../../domain/rhythm.ports.js';
import type {
  RhythmState,
  TouchKind,
} from '../../domain/rhythm-state.aggregate.js';
import { RhythmStateRepository } from '../../domain/rhythm.repositories.js';
import { PAGE_SIZE, TickHandler } from '../tick/tick.handler.js';

export interface PromptNowInput {
  /** One member, or every member when omitted. */
  userId?: string;
  kind: TouchKind;
}

/**
 * The operator's "Run" button, and the tick's own touches behind it.
 *
 * ## Unconditional is the entire feature
 *
 * It ignores the time of day and it ignores the claim date. That reads like a
 * hole in the once-a-day guarantee and is not one — it is what a Run button
 * *is*. An operator presses it for two reasons and both need the conditions
 * gone: to prove the touch pipeline works end to end at three in the afternoon
 * (a conditional Run at 15:00 would do nothing and report a zero, which is
 * indistinguishable from a broken gateway), and to re-send an evening a member
 * says never arrived — which is by definition a date already claimed, since the
 * claim is written before the send and a crash in between is exactly how a
 * touch goes missing.
 *
 * A "force" that quietly declined the second case would be a button that works
 * only when nobody needs it.
 *
 * ## It reuses the tick's touches rather than repeating them
 *
 * `TickHandler.planPrompt`, `endOfDay` and `morning` are called directly with
 * `force: true`. Nothing about composing a touch lives in this file, and that
 * is deliberate: an operator running a touch to reproduce a member's complaint
 * must receive the *same* message the member did, and two copies of the
 * end-of-day branch — which rebuilds a draft, auto-confirms it, respects a
 * member's own confirmation and opens the check-in window — would agree on the
 * day they were written and not after.
 *
 * The claim is still written on the forced path, so a Run at 21:30 leaves the
 * date claimed and the five-minute tick does not add a second copy at 22:00.
 *
 * ## `today` is still the member's own date
 *
 * Not the server's, even here. The touch operates on "tomorrow" relative to the
 * member's calendar, so a Run at 23:30 UTC for a member in Cairo has to mean
 * *their* tomorrow — resolving it against the process clock would write the
 * plan into the wrong day's document, where the member would never see it.
 */
@Injectable()
export class PromptNowHandler {
  private readonly logger = new Logger(PromptNowHandler.name);

  constructor(
    private readonly states: RhythmStateRepository,
    private readonly schedules: MemberSchedulePort,
    private readonly tick: TickHandler,
  ) {}

  async handle(
    input: PromptNowInput,
    now: Date = new Date(),
  ): Promise<{ sent: number }> {
    if (input.userId) {
      const state = await this.states.find(input.userId);
      if (!state) {
        // Not an error. "That member has no rhythm row" is a true and useful
        // answer for an operator who mistyped an id, and a 4xx would have them
        // hunting for a fault in the tick that is not there.
        this.logger.warn(`no rhythm state for ${input.userId}; sent nothing`);
        return { sent: 0 };
      }
      const [schedule] = await this.schedules.forUsers([input.userId]);
      if (!schedule) return { sent: 0 };
      await this.send(state, schedule, input.kind, now);
      return { sent: 1 };
    }

    // Everybody, paged exactly the way the tick pages and with the same cursor
    // reasoning: keyed on the last id seen rather than on an offset, so a row
    // updated mid-pass cannot shift the window and skip somebody.
    let sent = 0;
    let after: string | null = null;
    for (;;) {
      const page = await this.states.page(after, PAGE_SIZE);
      if (page.length === 0) break;

      const schedules = await this.schedules.forUsers(
        page.map((state) => state.userId),
      );
      const byUser = new Map(
        schedules.map((schedule) => [schedule.userId, schedule]),
      );

      for (const state of page) {
        const schedule = byUser.get(state.userId);
        if (!schedule) continue;
        // Per member, like the tick: one member with an unreachable meal
        // service must not end the run and take four hundred others with it.
        try {
          await this.send(state, schedule, input.kind, now);
          sent += 1;
        } catch (error) {
          this.logger.error(
            `forced ${input.kind} failed for ${state.userId}: ${(error as Error).message}`,
          );
        }
      }

      after = page[page.length - 1]?.userId ?? null;
      if (page.length < PAGE_SIZE) break;
    }

    return { sent };
  }

  private async send(
    state: RhythmState,
    schedule: MemberSchedule,
    kind: TouchKind,
    now: Date,
  ): Promise<void> {
    const today = localDate(now, schedule.timezone);

    switch (kind) {
      case 'plan':
        await this.tick.planPrompt(state, schedule, today, now, true);
        return;
      case 'end_of_day':
        // The boolean `endOfDay` returns says whether the check-in question was
        // asked, which is not what "a touch was sent" means — a member with
        // check-ins switched off still gets their summary, so it is discarded.
        await this.tick.endOfDay(state, schedule, today, now, true);
        return;
      case 'morning':
        await this.tick.morning(state, schedule, today, now, true);
        return;
    }
  }
}

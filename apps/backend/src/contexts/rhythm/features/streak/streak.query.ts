import { Injectable } from '@nestjs/common';
import {
  previousDate,
  weekAdherence,
  type CheckinRecord,
} from '../../domain/adherence.js';
import { MemberSchedulePort } from '../../domain/rhythm.ports.js';
import {
  CheckinRepository,
  RhythmStateRepository,
} from '../../domain/rhythm.repositories.js';
import { memberLocalDate } from '../today-plan/today-plan.query.js';

/** Seven dots, because the home screen draws a week. Named, not inlined. */
export const WEEK_DAYS = 7;

/**
 * The streak, and the week under it.
 *
 * `weekAdherence` is `(boolean | null)[]` and the contract says
 * `[Boolean]!` — a non-null list of *nullable* items — because a day has
 * three states and only two of them are booleans. See the handler's note.
 */
export interface StreakView {
  current: number;
  best: number;
  lastAdheredDate: string | null;
  weekAdherence: (boolean | null)[];
}

/**
 * What the member is actually watching.
 *
 * ## Two numbers stored, seven dots derived
 *
 * `current` and `best` come from `RhythmState.streak`, which is folded day by
 * day by the write side as each answer arrives. They are read rather than
 * recomputed for one reason that is not performance: `best` is the only part
 * of this that cannot be recovered from the check-in rows once they age out of
 * whatever history the store keeps, so it is genuinely stored. Recomputing
 * `current` here from the rows and reading `best` from the state would be two
 * sources for one card.
 *
 * `weekAdherence` is derived instead, through `weekAdherence()` in
 * `domain/adherence.ts` over the last seven local days, because there is
 * nothing stored that could answer it — the aggregate holds a count, not a
 * calendar.
 *
 * The two paths meeting is the point of having both, and
 * `rhythm-read.spec.ts` asserts the stored `streak.current` and the derived
 * `currentStreak()` agree over a seeded history. A stored counter that has
 * drifted from the rows it was folded from is invisible without that
 * assertion, and it is the number on the member's home screen.
 *
 * ## Three states per day, and `null` is one of them
 *
 * Adhered, missed, and *not answered*. The third is why `weekAdherence`
 * returns `(boolean | null)[]` and why the nulls are passed through here
 * untouched rather than coerced with a `?? false`.
 *
 * An unanswered day rendered as a miss is the same defect as a streak that
 * reads zero because today has not been answered yet — and that one is
 * already handled inside `currentStreak`, which ends its walk at yesterday
 * when today is silent. A member with a nine-day streak who opens the app at
 * nine in the morning has not missed anything; they have simply not spoken. A
 * miss ends a streak, silence merely has not extended it, and a `boolean[]`
 * forces every caller to conflate the two.
 *
 * ## A member with no state row still gets an answer
 *
 * Same reasoning as `todayPlan`'s empty plan, and the same non-null contract.
 * The row is written by the `identity.UserRegistered` handler, so it exists
 * for every member who registered after P3 landed — but a member who
 * registered before it, or one whose bootstrap event is still in the outbox,
 * has none, and a null streak would crash the card that draws it. Zero, zero
 * and seven nulls is the truthful reading of "nothing recorded yet".
 */
@Injectable()
export class StreakQueryHandler {
  constructor(
    private readonly states: RhythmStateRepository,
    private readonly checkins: CheckinRepository,
    private readonly schedules: MemberSchedulePort,
  ) {}

  async handle(userId: string, now: Date = new Date()): Promise<StreakView> {
    const today = await memberLocalDate(this.schedules, userId, now);

    // Stepped back through the calendar rather than by subtracting six days of
    // milliseconds: a local week containing a daylight-saving change is not
    // 168 hours long, and the window's first day would land on the wrong date
    // twice a year — shifting every dot by one and reporting a day the member
    // answered as unanswered.
    let from = today;
    for (let index = 1; index < WEEK_DAYS; index += 1) {
      from = previousDate(from);
    }

    const [state, rows] = await Promise.all([
      this.states.find(userId),
      this.checkins.between(userId, from, today),
    ]);

    const records: CheckinRecord[] = rows.map((row) => ({
      date: row.date,
      adhered: row.adhered,
    }));

    return {
      current: state?.streak.current ?? 0,
      best: state?.streak.best ?? 0,
      lastAdheredDate: state?.streak.lastAdheredDate ?? null,
      weekAdherence: weekAdherence(records, today, WEEK_DAYS),
    };
  }
}

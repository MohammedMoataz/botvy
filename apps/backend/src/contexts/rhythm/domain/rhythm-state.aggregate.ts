import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';
import {
  bestStreak,
  currentStreak,
  type CheckinRecord,
} from './adherence.js';

export interface StreakState {
  current: number;
  best: number;
  /** The last local date the member said they followed the plan. */
  lastAdheredDate: string | null;
}

export interface RhythmStateData {
  userId: string;
  lastPlanPromptDate: string | null;
  lastEndOfDayDate: string | null;
  lastMorningBriefingDate: string | null;
  awaitingCheckin: boolean;
  awaitingSince: Date | null;
  streak: StreakState;
  createdAt: Date;
  updatedAt: Date;
}

/** Which touch. Named because three call sites and one workflow all say it. */
export type TouchKind = 'plan' | 'end_of_day' | 'morning';

/**
 * What the rhythm has already done for one member, and what it is waiting for.
 *
 * ## Three claim dates, not one
 *
 * The two evening touches are an hour apart and are separate promises. A
 * gateway that was down at 21:00 and came back at 21:30 owes the member the
 * plan prompt and does not yet owe them the summary; one shared "evening" date
 * would send both at 21:30 or neither. So `claimPlanPrompt`, `claimEndOfDay`
 * and `claimMorning` are three methods writing three fields, and the tick calls
 * whichever are due.
 *
 * ## Claim, then send
 *
 * Every claim is *written before the work happens*. That ordering is the whole
 * once-a-day guarantee: the five-minute tick will find the date already claimed
 * on its next pass and do nothing, and a crash between the claim and the send
 * loses one touch rather than sending it every five minutes for the rest of the
 * evening. The claim is keyed on the member's local date, which is also why a
 * preference changed after the fact cannot re-fire a touch — the date is
 * claimed, not the time.
 */
export class RhythmState extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  lastPlanPromptDate: string | null;
  lastEndOfDayDate: string | null;
  lastMorningBriefingDate: string | null;
  awaitingCheckin: boolean;
  awaitingSince: Date | null;
  streak: StreakState;
  readonly createdAt: Date;

  private constructor(state: RhythmStateData) {
    super();
    this.id = state.userId;
    this.userId = state.userId;
    this.lastPlanPromptDate = state.lastPlanPromptDate;
    this.lastEndOfDayDate = state.lastEndOfDayDate;
    this.lastMorningBriefingDate = state.lastMorningBriefingDate;
    this.awaitingCheckin = state.awaitingCheckin;
    this.awaitingSince = state.awaitingSince;
    this.streak = state.streak;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
  }

  static rehydrate(state: RhythmStateData): RhythmState {
    return new RhythmState(state);
  }

  /**
   * A member's row, written when they register.
   *
   * Every claim date starts null, which reads as "nothing has been sent". It
   * does **not** read as "send everything now": the tick only fires a touch
   * whose local time has already passed today, so a member who registers at
   * 23:00 has their 21:00 and 22:00 claim dates set to today without sending
   * anything — see `suppressToday`.
   */
  static create(input: { userId: string; at: Date }): RhythmState {
    return new RhythmState({
      userId: input.userId,
      lastPlanPromptDate: null,
      lastEndOfDayDate: null,
      lastMorningBriefingDate: null,
      awaitingCheckin: false,
      awaitingSince: null,
      streak: { current: 0, best: 0, lastAdheredDate: null },
      createdAt: input.at,
      updatedAt: input.at,
    });
  }

  /** Has this touch already gone out on this local date? */
  hasClaimed(kind: TouchKind, date: string): boolean {
    return this.claimDate(kind) === date;
  }

  /**
   * Is this touch owed for this local date?
   *
   * Strictly *newer* than the claim, not merely different from it, and that
   * distinction is a member on an aeroplane.
   *
   * A member who flies west has their local date go **backwards**: it is
   * Tuesday 01:00 in Cairo, their summary for Tuesday has been sent, and in New
   * York it is Monday 19:00. `claim !== today` would call Monday's summary
   * unclaimed and send a second one three hours later — two end-of-day
   * summaries inside twenty-six hours, which is exactly the acceptance
   * scenario the spec writes down. Comparing `<` refuses it, and
   * `YYYY-MM-DD` compares lexicographically in calendar order, so no parsing
   * is involved.
   *
   * Flying east falls out correctly from the same rule: the date jumps forward,
   * nothing is claimed for it, and the touch fires at the member's new local
   * time on what is genuinely a new day.
   */
  isDue(kind: TouchKind, date: string): boolean {
    const claimed = this.claimDate(kind);
    return claimed === null || claimed < date;
  }

  /**
   * Take the touch for this date. Returns false when somebody already has.
   *
   * The boolean is what makes two ticks racing safe at the aggregate level; the
   * repository's optimistic `updatedAt` filter is what makes it safe at the
   * store level, refusing the second writer outright.
   */
  claim(kind: TouchKind, date: string, at: Date): boolean {
    /*
     * Guarded on `isDue`, not on `hasClaimed`, and the difference is a member
     * on an aeroplane.
     *
     * `hasClaimed` is equality, so it refuses only a claim for the date already
     * held — and *accepts one for an earlier date*, moving the claim backwards.
     * The tick never asks for that, because it checks `isDue` first. The
     * operator's Run button does, because a forced prompt claims
     * unconditionally: for a member who has flown west, whose local date has
     * gone backwards, it would rewind the claim to yesterday and re-open
     * today's touch for a second delivery.
     *
     * A claim date only ever moves forward. That is what the field means.
     */
    if (!this.isDue(kind, date)) return false;
    switch (kind) {
      case 'plan':
        this.lastPlanPromptDate = date;
        break;
      case 'end_of_day':
        this.lastEndOfDayDate = date;
        break;
      case 'morning':
        this.lastMorningBriefingDate = date;
        break;
    }
    this.updatedAt = at;
    return true;
  }

  claimPlanPrompt(date: string, at: Date): boolean {
    return this.claim('plan', date, at);
  }

  claimEndOfDay(date: string, at: Date): boolean {
    return this.claim('end_of_day', date, at);
  }

  claimMorning(date: string, at: Date): boolean {
    return this.claim('morning', date, at);
  }

  /**
   * Mark today's touches as already dealt with, without sending them.
   *
   * A member who registers at 23:00 must not receive an evening prompt about a
   * day that is ending, and must not receive one at 23:05 either. Nulls alone
   * would give them both, because the tick's rule is "the time has passed and
   * the date is unclaimed". So registration claims whatever has already gone by
   * on the member's own clock — the touch is not owed, so it is not sent, and
   * tomorrow runs normally.
   *
   * Deliberately *not* used for downtime: a gateway that missed 22:00 and comes
   * back at 22:40 still owes that summary, which is why catching up and
   * suppressing are different operations rather than one flag.
   */
  suppressToday(date: string, kinds: TouchKind[], at: Date): void {
    for (const kind of kinds) this.claim(kind, date, at);
  }

  /**
   * The end-of-day summary asked the question; a reply is now interpretable.
   *
   * `awaitingSince` and not just a boolean, because the window is measured from
   * the moment the question was asked. A flag with no timestamp is how a reply
   * typed three days later gets recorded against tonight.
   */
  awaitCheckin(at: Date): void {
    this.awaitingCheckin = true;
    this.awaitingSince = at;
    this.updatedAt = at;
  }

  /** Answered, or the window closed. Either way nothing is awaited now. */
  resolveCheckin(at: Date): void {
    this.awaitingCheckin = false;
    this.awaitingSince = null;
    this.updatedAt = at;
  }

  /**
   * Recompute the streak from the member's own check-in history.
   *
   * ## Why this reads the rows instead of folding one day in
   *
   * It used to fold: an `adhered` of true meant "was yesterday the last adhered
   * day, then add one", and false meant `current = 0`. That is correct for a
   * day answered once, and **wrong for a day answered twice** — which
   * `Checkin.record` exists specifically to allow, because a member can answer
   * in the coach chat and then tap the card.
   *
   * The failing case, measured: a member with a nine-day streak answers "no"
   * and then corrects it to "yes" inside the window. The false verdict zeroes
   * `current` and leaves `lastAdheredDate` at yesterday; the correction then
   * computes `0 + 1`, and their nine days are gone with nothing left in the
   * store that could have recovered them. `current` was destructive state
   * derived from history — so it is derived from history instead, and the whole
   * class of bug goes with it.
   *
   * The cost is one range read per check-in, and a check-in happens once a day
   * per member. `best` is the exception: it is the only part not recoverable
   * from a window of rows, because a longer run may sit outside the window, so
   * it is carried forward with `max`.
   *
   * Pure, and takes the history as an argument. An aggregate that fetched its
   * own rows could not be constructed in a spec without a store.
   */
  recomputeStreak(history: CheckinRecord[], today: string, at: Date): void {
    const current = currentStreak(history, today);
    const derivedBest = bestStreak(history);

    // The most recent adhered day in the history, which is what the home
    // screen labels the streak with.
    const lastAdheredDate =
      history
        .filter((entry) => entry.adhered === true)
        .map((entry) => entry.date)
        .sort()
        .at(-1) ?? null;

    this.streak = {
      current,
      best: Math.max(this.streak.best, derivedBest, current),
      lastAdheredDate,
    };
    this.updatedAt = at;
  }

  private claimDate(kind: TouchKind): string | null {
    switch (kind) {
      case 'plan':
        return this.lastPlanPromptDate;
      case 'end_of_day':
        return this.lastEndOfDayDate;
      case 'morning':
        return this.lastMorningBriefingDate;
    }
  }
}

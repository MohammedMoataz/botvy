import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { localDate } from '../../../../shared/time/time.js';
import { Checkin, type CheckinSource } from '../../domain/checkin.aggregate.js';
import { MemberSchedulePort } from '../../domain/rhythm.ports.js';
import { RhythmState } from '../../domain/rhythm-state.aggregate.js';
import {
  CheckinRepository,
  RhythmStateRepository,
} from '../../domain/rhythm.repositories.js';

export interface RecordCheckinInput {
  userId: string;
  /** The member's local date. Defaults to *their* today, never the server's. */
  date?: string;
  mood?: number | null;
  adhered?: boolean | null;
  note?: string | null;
  source: CheckinSource;
}

export interface RecordedCheckin {
  date: string;
  mood: number | null;
  adhered: boolean | null;
  streak: number;
  best: number;
}

/**
 * How today went, by the member's own account — and what that does to the streak.
 *
 * Three writes that have to be one: the check-in row, the folded streak, and
 * the closing of the check-in window. They go in a single `UnitOfWork.run`, and
 * that is not tidiness. `Checkin.record` raises `rhythm.CheckinRecorded`, which
 * the Home card and every later consumer read; a streak saved without the row,
 * or a row saved without the streak, is a member whose nine-day run disagrees
 * with their own history — and only the row half is recoverable, so from the
 * member's point of view the drift is permanent.
 *
 * ## The date defaults to the member's today, not the server's
 *
 * Constitution XI, and the concrete failure it prevents: a member in Cairo
 * tapping the card at 01:00 has a local date one day ahead of UTC. Reading the
 * process clock would file the answer under yesterday, where it would collide
 * with the answer they already gave and — because the streak fold is keyed on
 * the date — either double-count a day or fail to extend the run. The zone
 * comes from `MemberSchedulePort`, which is Profile's answer, so this handler
 * holds no copy of it.
 *
 * ## Answering twice patches one row
 *
 * The check-in id is `"<userId>:<date>"`, so a member who replies in the chat
 * and then taps the card patches one document rather than creating a second,
 * and `record` applies only the fields that arrived.
 *
 * ## And the streak is recomputed from the rows, not folded
 *
 * Which is the whole reason the history is read below, and it is worth saying
 * why, because folding one day in is the obvious thing and it was wrong.
 *
 * A fold is idempotent for a *repeated* answer and not for a *corrected* one. A
 * member with a nine-day streak who answers "no" and then corrects it to "yes"
 * inside the window loses the nine days: the false verdict zeroes the counter
 * and there is nothing left in the store to rebuild it from. Since patching one
 * row is exactly what this handler exists to allow, a correction is an ordinary
 * event and not an edge case.
 *
 * So the answer is written first and the streak is derived from the rows
 * afterwards — one range read per check-in, which happens once a day per
 * member. `best` is carried forward with `max` inside the aggregate, because it
 * is the only part a window of rows cannot recover.
 *
 * ## A mood with no verdict leaves the streak alone
 *
 * It falls out of deriving rather than needing a branch: a row with
 * `adhered: null` is not an adhered day and not a missed one, so
 * `currentStreak` steps over it exactly as it steps over a day with no row at
 * all. Reading a missing verdict as a miss would punish a member for answering
 * half the question, and an `?? false` anywhere on this path is that bug.
 */
@Injectable()
export class RecordCheckinHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly checkins: CheckinRepository,
    private readonly states: RhythmStateRepository,
    private readonly schedules: MemberSchedulePort,
  ) {}

  async handle(
    input: RecordCheckinInput,
    now: Date = new Date(),
  ): Promise<RecordedCheckin> {
    const date = input.date ?? (await this.localToday(input.userId, now));

    const [existing, state] = await Promise.all([
      this.checkins.forDate(input.userId, date),
      this.states.find(input.userId),
    ]);

    const checkin =
      existing ??
      Checkin.create({
        userId: input.userId,
        date,
        source: input.source,
        at: now,
      });

    // Passed through exactly as they arrived, `undefined` included. The
    // aggregate reads `undefined` as "not part of this answer" and `null` as
    // "clear it", so an `?? null` on any of these three would turn a card that
    // sends only a mood into a card that erases the verdict the chat recorded
    // an hour earlier.
    checkin.record({
      mood: input.mood,
      adhered: input.adhered,
      note: input.note,
      source: input.source,
      at: now,
    });

    // The row exists for every registered member — `RhythmBootstrapHandler`
    // writes it on `identity.UserRegistered`. Created here if it is somehow
    // absent, because the alternative is throwing away an answer the member
    // gave over a row that nothing outside this context can recreate.
    const rhythm =
      state ?? RhythmState.create({ userId: input.userId, at: now });

    // The question has been answered, so nothing is awaited — whether or not
    // the answer carried a verdict. Leaving the window open would let a later,
    // unrelated sentence in the coach chat be captured as a second answer.
    rhythm.resolveCheckin(now);

    /*
     * Save the answer first, then derive the streak from what is now stored.
     *
     * The order matters and it is why this is two steps rather than one. The
     * streak is a function of the check-in rows, so it has to be computed from
     * a history that already includes today's answer — computing it first and
     * saving both together would derive the streak from the state before the
     * answer, which is off by exactly the day the member just reported.
     *
     * `STREAK_WINDOW_DAYS` bounds the read. A streak longer than the window is
     * still correct in `best`, which the aggregate carries forward with `max`;
     * `current` cannot exceed the window, which is a real limit and a
     * deliberate one — an unbounded read would grow with the account for a
     * number the home screen shows as "9 days".
     */
    await this.uow.run(async () => {
      await this.checkins.save(checkin);
    });

    const history = await this.checkins.between(
      input.userId,
      windowStart(date),
      date,
    );
    rhythm.recomputeStreak(
      history.map((entry) => ({ date: entry.date, adhered: entry.adhered })),
      date,
      now,
    );

    await this.uow.run(async () => {
      await this.states.save(rhythm);
    });

    return {
      date,
      mood: checkin.mood,
      adhered: checkin.adhered,
      streak: rhythm.streak.current,
      best: rhythm.streak.best,
    };
  }

  private async localToday(userId: string, now: Date): Promise<string> {
    const [schedule] = await this.schedules.forUsers([userId]);
    if (!schedule) {
      throw new Error(
        `No schedule for ${userId}: the local date a check-in belongs to cannot be resolved.`,
      );
    }
    return localDate(now, schedule.timezone);
  }
}

/**
 * How far back the streak is derived from.
 *
 * A year, which is long enough that `current` is never wrong in practice and
 * short enough that the read stays one bounded index scan. The number is here
 * rather than in the settings registry on purpose: it is not a knob an operator
 * would retune, it is the width of a correctness window, and a registry entry
 * would invite somebody to set it to 7 and quietly cap every member's streak.
 */
const STREAK_WINDOW_DAYS = 366;

function windowStart(date: string): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - STREAK_WINDOW_DAYS);
  return at.toISOString().slice(0, 10);
}

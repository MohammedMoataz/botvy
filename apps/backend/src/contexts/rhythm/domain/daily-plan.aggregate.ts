import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';

/**
 * A task as the plan recorded it, not as it is now.
 *
 * The plan is a snapshot of what the member was shown and agreed to. A task
 * renamed on Thursday must not rewrite Tuesday's plan, and one deleted
 * afterwards must not make Tuesday's plan unreadable — so the title and
 * priority are copied in. `deferCount` comes along because the proposal says
 * "carried over ×3" and that count is what makes the sentence true.
 */
export interface PlanTask {
  id: string;
  title: string;
  priority: number;
  dueAt: Date | null;
  deferCount: number;
}

/**
 * One occurrence of a meeting, as the plan recorded it.
 *
 * Snapshotted for the same reason `PlanTask` is: a meeting renamed on Thursday
 * must not rewrite Tuesday's plan, and a series deleted afterwards must not
 * make Tuesday's plan unreadable. `startAt` is where the occurrence actually
 * sits — after any override — because that is the time the sentence named.
 *
 * `meetingId` rather than an occurrence id, because occurrences are derived
 * from the rule and have no identity of their own (FR-006); it is the series
 * the member taps through to. A repeating meeting can therefore appear twice in
 * one day's list, which is a list and not a map.
 */
export interface PlanMeeting {
  meetingId: string;
  title: string;
  startAt: Date;
  durationMin: number;
}

/** The training slot, when Training exists to answer. Null until P6, by design. */
export interface PlanTraining {
  sessionId: string;
  title: string;
  sport: string;
  startAt: Date;
}

export type PlanStatus = 'draft' | 'confirmed' | 'skipped';

export interface DailyPlanState {
  userId: string;
  /** The member's own local date, `YYYY-MM-DD`. Never the server's. */
  date: string;
  status: PlanStatus;
  autoConfirmed: boolean;
  tasks: PlanTask[];
  meetings: PlanMeeting[];
  training: PlanTraining | null;
  /**
   * The workout half of the day's line, `"Upper body (gym)"` — no label.
   *
   * The label is the surface's: `"Workout: "` is English, and a member reading
   * Arabic syncs this column. The same decision `mealReason` makes one field
   * down, and the reason P3's rendered sentence in `mealLine` is corrected in
   * P8 rather than copied.
   */
  workoutLine: string | null;
  mealLine: string | null;
  /**
   * Why there are no meals, as a **code** — `allergen`, `empty_library`,
   * `model_unavailable` — or null.
   *
   * Nutrition's `WithheldReason`, not imported: a rhythm aggregate typing
   * another context's union would be the cross-context import
   * `no-restricted-imports` refuses, and the value crosses as an event payload
   * field, which is `unknown` at the boundary in any case. What keeps the two
   * honest is the consumer spec, which asserts the three codes by name.
   */
  mealReason: string | null;
  promptedAt: Date | null;
  confirmedAt: Date | null;
  summarisedAt: Date | null;
  briefedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One day, as the member and Botvy agreed it.
 *
 * ## Why the four timestamps are separate fields rather than a status
 *
 * Because they answer four different questions and three of them are *claims*.
 * `status` says what the member decided; `promptedAt`, `summarisedAt` and
 * `briefedAt` say which of the three touches have happened. A single enum would
 * make "prompted but not yet summarised" and "summarised without a prompt"
 * — the state of a member who registered at 21:30 — indistinguishable, and the
 * tick decides what to send by asking exactly that.
 *
 * ## The id is composite, and that is the idempotency
 *
 * `"<userId>:<date>"`. There is one plan per member per local day by
 * construction, so a tick that runs twice in the same minute writes the same
 * document twice instead of creating two. Nothing has to de-duplicate.
 */
export class DailyPlan extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  readonly date: string;
  status: PlanStatus;
  autoConfirmed: boolean;
  tasks: PlanTask[];
  meetings: PlanMeeting[];
  training: PlanTraining | null;
  workoutLine: string | null;
  mealLine: string | null;
  mealReason: string | null;
  promptedAt: Date | null;
  confirmedAt: Date | null;
  summarisedAt: Date | null;
  briefedAt: Date | null;
  readonly createdAt: Date;

  private constructor(state: DailyPlanState) {
    super();
    this.id = planId(state.userId, state.date);
    this.userId = state.userId;
    this.date = state.date;
    this.status = state.status;
    this.autoConfirmed = state.autoConfirmed;
    this.tasks = state.tasks;
    // A plan row written before P5 has no `meetings` key at all, so the
    // fallback is load-bearing rather than defensive: every plan already in
    // the store rehydrates as a day with no meetings rather than one whose
    // list is `undefined`, which is what `isEmpty` and the touches read.
    this.meetings = state.meetings ?? [];
    this.training = state.training;
    this.workoutLine = state.workoutLine;
    this.mealLine = state.mealLine;
    // A plan written before P8 has no `mealReason` key at all, so the fallback
    // is load-bearing rather than defensive — the same call the `meetings`
    // list above makes for P5.
    this.mealReason = state.mealReason ?? null;
    this.promptedAt = state.promptedAt;
    this.confirmedAt = state.confirmedAt;
    this.summarisedAt = state.summarisedAt;
    this.briefedAt = state.briefedAt;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
  }

  static rehydrate(state: DailyPlanState): DailyPlan {
    return new DailyPlan(state);
  }

  /**
   * The draft the evening prompt proposes.
   *
   * No event: the tick raises `PlanTomorrowPrompted` once, after it has both
   * saved the draft and written the question, because an event raised here
   * would fire again every time the end-of-day touch rebuilt the draft.
   */
  static propose(input: {
    userId: string;
    date: string;
    tasks: PlanTask[];
    meetings?: PlanMeeting[];
    training?: PlanTraining | null;
    workoutLine?: string | null;
    mealLine?: string | null;
    mealReason?: string | null;
    at: Date;
  }): DailyPlan {
    return new DailyPlan({
      userId: input.userId,
      date: input.date,
      status: 'draft',
      autoConfirmed: false,
      tasks: input.tasks,
      meetings: input.meetings ?? [],
      training: input.training ?? null,
      workoutLine: input.workoutLine ?? null,
      mealLine: input.mealLine ?? null,
      mealReason: input.mealReason ?? null,
      promptedAt: input.at,
      confirmedAt: null,
      summarisedAt: null,
      briefedAt: null,
      createdAt: input.at,
      updatedAt: input.at,
    });
  }

  /** True when nobody has answered the proposal yet. */
  get isUnanswered(): boolean {
    return this.status === 'draft';
  }

  /**
   * Replace the draft's contents with what is true now.
   *
   * The end-of-day touch calls this before auto-confirming, which is how a task
   * created at 21:30 reaches the plan that is set at 22:00. It refuses to touch
   * a plan the member has already answered — a confirmed selection is a
   * decision, and rebuilding it would quietly overwrite the member's edit with
   * whatever the algorithm currently prefers.
   */
  redraft(input: {
    tasks: PlanTask[];
    meetings?: PlanMeeting[];
    training?: PlanTraining | null;
    workoutLine?: string | null;
    mealLine?: string | null;
    mealReason?: string | null;
    at: Date;
  }): boolean {
    if (!this.isUnanswered) return false;
    this.tasks = input.tasks;
    this.meetings = input.meetings ?? [];
    this.training = input.training ?? null;
    this.workoutLine = input.workoutLine ?? null;
    // The meal half is left alone when the caller says nothing about it, both
    // halves together: a rebuild running while Nutrition is still choosing must
    // not blank a line the member already has.
    if (input.mealLine !== undefined) this.mealLine = input.mealLine;
    if (input.mealReason !== undefined) this.mealReason = input.mealReason;
    this.updatedAt = input.at;
    return true;
  }

  /**
   * The member said yes — or the end-of-day touch said it for them.
   *
   * `training: false` from the member *clears* the slot the draft proposed
   * rather than being ignored: they were shown a training session and said
   * there is none, and arguing with them about their own evening is not the
   * job. `undefined` leaves the draft's answer alone, which is what a client
   * that only sends task ids means.
   */
  confirm(input: {
    tasks: PlanTask[];
    training?: boolean;
    autoConfirmed?: boolean;
    at: Date;
  }): void {
    this.tasks = input.tasks;
    if (input.training === false) this.training = null;
    this.status = 'confirmed';
    this.autoConfirmed = input.autoConfirmed ?? false;
    this.confirmedAt = input.at;
    this.updatedAt = input.at;
    this.raise(
      'rhythm.PlanConfirmed',
      'daily_plan',
      {
        date: this.date,
        taskIds: this.tasks.map((task) => task.id),
        autoConfirmed: this.autoConfirmed,
      },
      input.at,
    );
  }

  /**
   * Not tonight.
   *
   * A skipped plan keeps its drafted contents. The status is the record of what
   * the member decided, and the end-of-day summary still names tomorrow's
   * training from it — telling somebody who skipped planning that they have a
   * session at seven is useful; pretending the evening did not happen is not.
   */
  skip(at: Date): void {
    this.status = 'skipped';
    this.autoConfirmed = false;
    this.updatedAt = at;
    this.raise(
      'rhythm.PlanSkipped',
      'daily_plan',
      { date: this.date, taskIds: this.tasks.map((task) => task.id), autoConfirmed: false },
      at,
    );
  }

  /**
   * The three touches, each raising its own event from here rather than from
   * the tick.
   *
   * That is not ceremony. An event raised in a handler and published after the
   * save is an event that is lost if the process dies in between — and these
   * three are what Notifications turns into the member's alert and what
   * Planning's rollover listens for. Raised on the aggregate, they go into the
   * outbox inside the same transaction as the row, so a touch that was recorded
   * as sent is a touch whose alert will be planned, and one that was not is
   * neither.
   */

  /** The evening prompt went out. */
  markPrompted(at: Date): void {
    this.promptedAt = at;
    this.updatedAt = at;
    this.raise(
      'rhythm.PlanTomorrowPrompted',
      'daily_plan',
      {
        date: this.date,
        taskIds: this.tasks.map((task) => task.id),
        trainingSessionId: this.training?.sessionId ?? null,
        mealLine: this.mealLine,
      },
      at,
    );
  }

  /**
   * The end-of-day summary went out.
   *
   * `checkinAsked` rides on the event because Notifications words the alert
   * differently when there is a question waiting, and because a spec asserting
   * "check-ins off means no question" needs something to assert against that is
   * not the absence of a second event.
   */
  markSummarised(at: Date, checkinAsked: boolean): void {
    this.summarisedAt = at;
    this.updatedAt = at;
    this.raise(
      'rhythm.EndOfDaySummarySent',
      'daily_plan',
      {
        date: this.date,
        taskIds: this.tasks.map((task) => task.id),
        trainingSessionId: this.training?.sessionId ?? null,
        autoConfirmed: this.autoConfirmed,
        checkinAsked,
      },
      at,
    );
  }

  /** The morning briefing went out. */
  markBriefed(at: Date): void {
    this.briefedAt = at;
    this.updatedAt = at;
    this.raise(
      'rhythm.MorningBriefingSent',
      'daily_plan',
      { date: this.date, taskIds: this.tasks.map((task) => task.id) },
      at,
    );
  }

  /**
   * The meal line, replaced after the fact by Nutrition.
   *
   * A member who regenerates their meals at nine in the morning has already had
   * their briefing, and the card on their phone must follow. Returns whether
   * anything moved, so an at-least-once redelivery writes nothing.
   */
  setMealLine(
    line: string | null,
    reason: string | null,
    at: Date,
  ): boolean {
    if (this.mealLine === line && this.mealReason === reason) return false;
    this.mealLine = line;
    this.mealReason = reason;
    this.updatedAt = at;
    return true;
  }

  /**
   * The day's line, `"Workout: … | Meals: …"` (FR-008).
   *
   * Composed here because both halves are this aggregate's and neither context
   * that fills them may see the other: Training writes no plan, and Nutrition
   * announces its half by event. A rest day is **named** rather than left out,
   * which is FR-008 in as many words — a line that simply omitted the workout
   * would read as a day whose training nobody knew about.
   *
   * English, like every other sentence the server composes (E-012 carries the
   * argument and what fixing it would take). The stored halves are not: a
   * client rendering this card in Arabic reads `workoutLine`, `mealLine` and
   * `mealReason` and builds its own, which is why the three are separate
   * columns and why the reason is a code.
   */
  get dayLine(): string {
    const workout = this.workoutLine ?? 'rest day';
    const meals = this.mealLine ?? 'none planned';
    return `Workout: ${workout} | Meals: ${meals}`;
  }

  /** Whether the plan holds nothing to do — the sentence changes when it does. */
  get isEmpty(): boolean {
    return (
      this.tasks.length === 0 &&
      this.meetings.length === 0 &&
      this.training === null
    );
  }
}

/** `"<userId>:<date>"`. One plan per member per local day, by construction. */
export function planId(userId: string, date: string): string {
  return `${userId}:${date}`;
}

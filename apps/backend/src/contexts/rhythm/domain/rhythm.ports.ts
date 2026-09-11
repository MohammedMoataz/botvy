import type {
  PlanMeeting,
  PlanTask,
  PlanTraining,
} from './daily-plan.aggregate.js';

/**
 * Everything the rhythm needs that it does not own.
 *
 * Six ports, declared here in `domain/` and bound in this context's own
 * `infrastructure/` to whichever context publishes the answer. That is the one
 * seam constitution IX sanctions: `infrastructure/` is the single layer allowed
 * to know another context exists, because binding a local port to somebody
 * else's query is its job. Nothing under `domain/` or `features/` here imports
 * anything from another context, and `no-restricted-imports` refuses it if
 * anyone tries.
 *
 * Two of the five have no implementation yet, and that is the interesting part
 * — see `NextSessionPort` below.
 */

/**
 * When each of a member's three touches is due, and whether they want the
 * question.
 *
 * Bound to Profile, which owns both halves: the zone is on the profile, the
 * three times and the flag are preferences. Batched rather than per-member,
 * because the tick's loop is over everybody — five hundred members would be a
 * thousand round trips if this took one id, and the performance goal is a pass
 * in under ten seconds when nobody is due.
 */
export interface MemberSchedule {
  userId: string;
  timezone: string;
  /** `HH:mm` in the member's own zone. */
  planTomorrowTime: string;
  endOfDayTime: string;
  morningBriefingTime: string;
  checkinEnabled: boolean;
}

export abstract class MemberSchedulePort {
  abstract forUsers(userIds: string[]): Promise<MemberSchedule[]>;
}

/**
 * The tasks a draft is built from.
 *
 * Bound to Planning's `TasksDueQueryHandler`, which that phase declared for
 * exactly this caller. Both methods take the member's local date as a string
 * and let Planning resolve the boundaries, so the definition of "tomorrow"
 * stays in one place.
 */
export abstract class PlannedTasksPort {
  /** Everything due on that local date. */
  abstract dueOn(userId: string, date: string): Promise<PlanTask[]>;

  /** Still-open tasks whose moment has already passed — the carry-over list. */
  abstract openBefore(userId: string, before: Date): Promise<PlanTask[]>;
}

/**
 * Where the member's meetings fall on one of their days (FR-012).
 *
 * Bound to Meetings' `MeetingOccurrencesQueryHandler`, which P5 declared with
 * this caller named in its own comment. Occurrences are derived from a rule and
 * never stored, so there is nothing to read even if reading another context's
 * collection were allowed — the expander is the only thing that knows where a
 * weekly meeting falls, and asking for it is the only way to agree with the
 * calendar the member is looking at.
 *
 * `date` is the member's own local `YYYY-MM-DD`, the same contract
 * `PlannedTasksPort.dueOn` uses and for the same reason: a pair of instants
 * would make this caller decide whose midnight it meant.
 */
export abstract class MeetingsOnPort {
  abstract onDate(userId: string, date: string): Promise<PlanMeeting[]>;
}

/**
 * Tomorrow's training session, if there is one.
 *
 * **Stubbed until P6.** The implementation registered in `rhythm.module.ts`
 * returns null, and the plan renders correctly without a training slot — the
 * spec's Assumptions say so, and the sentence the member reads is built from
 * what is present rather than from a fixed template with a hole in it.
 *
 * A null-returning stub rather than an optional dependency, because the
 * alternative is a branch inside the tick asking whether Training exists yet,
 * and that branch would still be there in P9. P6 replaces one line in the
 * module and every call site is already correct.
 */
export abstract class NextSessionPort {
  abstract forDate(userId: string, date: string): Promise<PlanTraining | null>;
}

/** The meal half of a day's line, and why it is missing when it is. */
export interface MealHalf {
  /** The names joined, `"oats, chicken salad"`. Null when there are none. */
  line: string | null;
  /**
   * Why there are none, as a **code** the surface renders — never a sentence.
   *
   * Null when the line is present, and *also* null when nothing has chosen the
   * day yet: "no meals because the model refused" and "no meals because nobody
   * has asked" are different days, and a plan is not owed a reason for a
   * question that was never put.
   */
  reason: string | null;
}

/**
 * The day's meals, from Nutrition (P8).
 *
 * The half, not the sentence: the rhythm owns `daily_plans` and composes
 * `"Workout: … | Meals: …"` from its own workout half and this one. Building
 * the sentence on the other side would put half of one line in two contexts.
 *
 * **A `line` of null is permanent, not a phase gap.** The meal half is the one
 * part of a plan that comes from the language model, so null is the shape of
 * "the model was unavailable this evening" as much as it was the shape of
 * "Nutrition is not built yet" — the rhythm has to tolerate it for ever, and
 * `DailyPlan.setMealLine(null, reason, at)` exists for exactly that. Asking for
 * a day the member has never opened *chooses* it, which is a decision that
 * belongs to Nutrition and is argued in its `RegenerateTodayHandler`.
 */
export abstract class TodayMealsPort {
  abstract lineFor(userId: string, date: string): Promise<MealHalf>;
}

/**
 * Writing a touch into the member's coach conversation.
 *
 * Bound to the Conversations context's `append-message` command. The rhythm
 * does not open a message repository and does not know how a `seq` is issued —
 * it hands over a conversation kind, a role and a sentence, and Conversations
 * decides the rest. Which is also why the return is the message's `seq` rather
 * than a document: the rhythm has nothing to do with the row.
 *
 * The touch is written down as well as pushed because of v1's lesson: a member
 * who opened the app was expected to answer a question that was nowhere on
 * screen, the notification having been the only copy of it.
 */
export abstract class CoachTranscriptPort {
  abstract append(input: {
    userId: string;
    /** `coach` for all three touches. `planner` is P4's. */
    kind: 'coach' | 'planner';
    content: string;
    /**
     * Which touch this is, for the `chat.message` frame's discriminator.
     *
     * Separate from `kind` above, which names the *conversation*; this names
     * the message. `contracts/ws-chat.md` types it, and it is what a connected
     * client routes on — an end-of-day message carrying the check-in question
     * sends `checkin_question` rather than `end_of_day_summary`, because the
     * discriminator exists to say what the member should do and the thing to do
     * is answer.
     *
     * Not stored on the row, deliberately. It is routing for a socket that is
     * open right now; a client that was offline routes from the notification's
     * deep link instead, and a field on an immutable row can never be corrected
     * afterwards.
     */
    touch?: TouchMessageKind;
    at: Date;
  }): Promise<{ seq: number } | null>;
}

/** The `kind` values `contracts/ws-chat.md` fixes for a `chat.message` frame. */
export type TouchMessageKind =
  | 'evening_prompt'
  | 'end_of_day_summary'
  | 'morning_briefing'
  | 'checkin_question'
  | 'suggestion';

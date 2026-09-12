import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';
import type { MealKind } from './meal.aggregate.js';

/**
 * Which way the day's meals were arrived at.
 *
 * Exactly the two values `preferences.mealMode` stores, and no third vocabulary
 * anywhere. `'library'` is what the member sees labelled **"my meals"** and
 * `'llm'` what they see labelled **"suggest for me"**; those two phrases are
 * translation strings over these two words and never appear in code. A third
 * spelling is how a switch, a contract and a stored row come to disagree about
 * what a member chose.
 */
export type MealMode = 'library' | 'llm';

/**
 * Why a day has no meals, as a **code**.
 *
 * A code rather than a rendered sentence, because the member's language is a
 * preference and every surface already owns its own strings — the phone, the
 * portal and the coach message each render these three differently and in two
 * languages. Storing "Meals: none planned — we could not reach the model" would
 * store an English sentence in a document read by an Arabic-reading member.
 *
 * Three and only three, because FR-014 says the member must be told **which**
 * of the three it was, in the same words everywhere. A fourth reason with no
 * sentence behind it would render as a blank.
 */
export type WithheldReason = 'allergen' | 'empty_library' | 'model_unavailable';

export const WITHHELD_REASONS: readonly WithheldReason[] = [
  'allergen',
  'empty_library',
  'model_unavailable',
];

/** One meal on the day, as it was chosen. */
export interface ChosenMeal {
  kind: MealKind;
  name: string;
  /**
   * The member's own meal it came from, in library mode; null in suggestion
   * mode, where nothing in the library was used.
   *
   * Kept so "replace this one with one of mine" knows what it is replacing, and
   * so a member who deletes a meal afterwards can still see what Tuesday said —
   * the *name* is stored beside the id precisely so a past day survives the
   * deletion (FR-011).
   */
  mealId: string | null;
}

export interface MealSuggestionState {
  /** `"<userId>:<date>"`. One per member per local day, by construction. */
  id: string;
  userId: string;
  /** The member's own local date. Principle XI, and why it is a string. */
  date: string;
  mode: MealMode;
  meals: ChosenMeal[];
  /** The names joined, or null when withheld. */
  line: string | null;
  withheldReason: WithheldReason | null;
  /** Which model drafted it, for the Owner's usage view. Null in library mode. */
  model: string | null;
  /**
   * The event that caused this version of the day, when one did.
   *
   * The idempotency key for every event-driven rebuild (FR-013). The relay
   * delivers at least once, and in suggestion mode a second delivery is a
   * second model call — a GPU second and a token count for an answer already
   * given, and, because a model asked twice answers differently, a member
   * watching their card would see lunch change for no reason they could see.
   *
   * On the row rather than in a separate store, for the reason `usage_log`
   * keys on `eventId` at its index: the guard belongs where the write lands, so
   * there is no window between the check and the row. Null for a rebuild a
   * member asked for by hand, which is *not* idempotent and should not be — two
   * taps of "again" mean two answers.
   */
  causeEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * What was proposed for one day, and whether it was withheld (data-model §2.8).
 *
 * ## It is a row so that past days keep what they said
 *
 * FR-011, and it is the only reason this collection exists — the *line* itself
 * rides `daily_plans` where the rhythm composes the sentence. A member who
 * deletes a meal from their library must still see what Tuesday said, and a
 * rotation recomputed on read would answer with today's library rather than
 * Tuesday's.
 *
 * ## `withheld` is not a boolean
 *
 * The data model names a `withheld` flag beside `withheldReason`, and one of
 * them is redundant: a reason present *is* a withholding, and the two can
 * disagree in a way nothing would notice. So the reason is the whole state and
 * `isWithheld` derives from it — the same call `Session` makes about `missed`,
 * which is read from the clock rather than stored.
 *
 * ## Every change announces itself
 *
 * `propose` and `withhold` both raise, because Daily Rhythm composes the
 * sentence and has no way to learn otherwise: it may not open this collection
 * (constitution I) and must not be asked to poll. A change stored without its
 * event is a member whose home card shows the meals they replaced an hour ago.
 */
export class MealSuggestion extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  readonly date: string;
  mode: MealMode;
  meals: ChosenMeal[];
  line: string | null;
  withheldReason: WithheldReason | null;
  model: string | null;
  causeEventId: string | null;
  readonly createdAt: Date;

  private constructor(state: MealSuggestionState) {
    super();
    this.id = state.id;
    this.userId = state.userId;
    this.date = state.date;
    this.mode = state.mode;
    this.meals = state.meals;
    this.line = state.line;
    this.withheldReason = state.withheldReason;
    this.model = state.model;
    this.causeEventId = state.causeEventId ?? null;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
  }

  static rehydrate(state: MealSuggestionState): MealSuggestion {
    return new MealSuggestion(state);
  }

  /**
   * A day with meals on it.
   *
   * `at` rather than `new Date()` at every call site, because the whole point of
   * a dated row is that it belongs to a day the *member* is having.
   */
  static propose(input: {
    userId: string;
    date: string;
    mode: MealMode;
    meals: ChosenMeal[];
    model?: string | null;
    causeEventId?: string | null;
    at: Date;
  }): MealSuggestion {
    const suggestion = new MealSuggestion({
      id: suggestionId(input.userId, input.date),
      userId: input.userId,
      date: input.date,
      mode: input.mode,
      meals: input.meals,
      line: joined(input.meals),
      withheldReason: null,
      model: input.model ?? null,
      causeEventId: input.causeEventId ?? null,
      createdAt: input.at,
      updatedAt: input.at,
    });
    suggestion.announce(input.at);
    return suggestion;
  }

  /** A day with none, and the reason (FR-006, FR-014). */
  static withhold(input: {
    userId: string;
    date: string;
    mode: MealMode;
    reason: WithheldReason;
    causeEventId?: string | null;
    at: Date;
  }): MealSuggestion {
    const suggestion = new MealSuggestion({
      id: suggestionId(input.userId, input.date),
      userId: input.userId,
      date: input.date,
      mode: input.mode,
      meals: [],
      line: null,
      withheldReason: input.reason,
      model: null,
      causeEventId: input.causeEventId ?? null,
      createdAt: input.at,
      updatedAt: input.at,
    });
    suggestion.announce(input.at);
    return suggestion;
  }

  /**
   * The day, chosen again — a regeneration, a profile change, or a swap.
   *
   * The same row rather than a second one, because the id is `userId:date`: one
   * day has one answer, and a history of what was proposed and discarded is not
   * something any requirement asks for or any screen shows.
   *
   * Returns whether anything moved, so a redelivered event writes nothing and
   * pushes no delta at the member's devices.
   */
  replace(input: {
    mode: MealMode;
    meals: ChosenMeal[];
    reason?: WithheldReason | null;
    model?: string | null;
    causeEventId?: string | null;
    at: Date;
  }): boolean {
    const line = input.reason ? null : joined(input.meals);
    const reason = input.reason ?? null;
    if (
      this.mode === input.mode &&
      this.line === line &&
      this.withheldReason === reason &&
      sameMeals(this.meals, input.meals)
    ) {
      return false;
    }

    this.mode = input.mode;
    this.meals = input.reason ? [] : input.meals;
    this.line = line;
    this.withheldReason = reason;
    this.model = input.model ?? null;
    this.causeEventId = input.causeEventId ?? null;
    this.updatedAt = input.at;
    this.announce(input.at);
    return true;
  }

  /**
   * One meal swapped for one of the member's own (FR-010, story 4 scenario 2).
   *
   * The rest of the day stays exactly as it was, which is the requirement in as
   * many words — a member replacing lunch has not asked for a different
   * breakfast. The slot is matched by position rather than by kind, because two
   * `any` meals can share a kind and the member tapped a row rather than a
   * category.
   */
  swap(index: number, meal: ChosenMeal, at: Date): boolean {
    if (index < 0 || index >= this.meals.length) return false;
    const current = this.meals[index]!;
    if (current.name === meal.name && current.mealId === meal.mealId) {
      return false;
    }

    this.meals = this.meals.map((existing, at_) =>
      at_ === index ? meal : existing,
    );
    this.line = joined(this.meals);
    this.withheldReason = null;
    this.updatedAt = at;
    this.announce(at);
    return true;
  }

  /**
   * Record which event produced this day, without announcing anything.
   *
   * Separate from `replace` because the two facts move independently: a
   * redelivery that happens to produce the identical rotation changes nothing a
   * member can see, and yet *that this event has been served* is exactly what
   * the next delivery needs to know — so the row still has to be written, and
   * it must not raise an event or bump `updatedAt`, which would push a delta to
   * every device saying a line had changed when it had not.
   *
   * Returns whether it moved, so the caller saves only when there is something
   * to save.
   */
  noteCause(eventId: string | null): boolean {
    if (!eventId || this.causeEventId === eventId) return false;
    this.causeEventId = eventId;
    return true;
  }

  /** Whether this day was already built for that event (FR-013's idempotency). */
  wasCausedBy(eventId: string): boolean {
    return this.causeEventId === eventId;
  }

  get isWithheld(): boolean {
    return this.withheldReason !== null;
  }

  /**
   * `nutrition.MealPlanReady` or `MealPlanWithheld`, whichever this day is.
   *
   * Private, and called by every mutator, so there is no path that changes a
   * day without saying so. Rhythm's `MealLineChangedHandler` — written in P3
   * against a hand-raised event, with no producer until now — is the consumer.
   */
  private announce(at: Date): void {
    if (this.withheldReason) {
      this.raise(
        'nutrition.MealPlanWithheld',
        'meal_suggestion',
        { date: this.date, reason: this.withheldReason },
        at,
      );
      return;
    }
    this.raise(
      'nutrition.MealPlanReady',
      'meal_suggestion',
      { date: this.date, line: this.line },
      at,
    );
  }
}

/** `"<userId>:<date>"`. One day, one answer, by construction. */
export function suggestionId(userId: string, date: string): string {
  return `${userId}:${date}`;
}

/**
 * The names, joined.
 *
 * A comma list and not a sentence: Daily Rhythm composes
 * `"Workout: … | Meals: …"` and this is the second half of it. Building a
 * sentence here would put half of one line in two contexts.
 */
function joined(meals: ChosenMeal[]): string | null {
  const names = meals.map((meal) => meal.name).filter((name) => name !== '');
  return names.length === 0 ? null : names.join(', ');
}

function sameMeals(left: ChosenMeal[], right: ChosenMeal[]): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (meal, at) =>
      meal.name === right[at]!.name &&
      meal.kind === right[at]!.kind &&
      meal.mealId === right[at]!.mealId,
  );
}

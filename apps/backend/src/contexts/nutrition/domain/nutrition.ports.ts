import type { MealKind } from './meal.aggregate.js';

/**
 * What Nutrition needs and does not own.
 *
 * Declared here in `domain/` and bound in this context's own `infrastructure/`
 * to whichever context publishes the answer — the one seam constitution IX
 * sanctions. Nothing under `domain/` or `features/` imports another context,
 * and `no-restricted-imports` refuses it if anyone tries.
 */

/** One meal the model proposed. The same shape the rotator produces. */
export interface DraftedMeal {
  kind: MealKind;
  name: string;
}

export interface MealDraft {
  meals: DraftedMeal[];
  /** Which model wrote it, for the Owner's usage view. */
  model: string;
}

/**
 * Ordinary food ideas for one day, from the local model.
 *
 * ## Null is the model being unavailable, and it is not a failure
 *
 * A member's plan is never delayed for food (FR-008, SC-004): the briefing goes
 * out with the workout alone and the day is marked `model_unavailable`. So this
 * returns null rather than throwing, and every caller treats null as a
 * withholding reason rather than as an exception to handle — which is what
 * keeps the "the plan always arrives" promise in one place instead of in a
 * `try` around every call site.
 *
 * ## Why it is a port at all, when there is one implementation
 *
 * SC-002: *in "my meals" mode, nothing is produced on the member's behalf —
 * **measured**, not assumed*. The spec binds a fake here and asserts it was
 * never called, which is a claim about work rather than about output. A version
 * that drafted three meals in library mode and then discarded them would pass
 * an output-only check and fail this one, and that is exactly the bug worth
 * catching: it would be a model call, a GPU second and a token count for a
 * member who asked for none of it.
 *
 * ## `prohibitions` is the retry's whole mechanism
 *
 * The first call carries the member's dislikes. When the allergen gate matches,
 * the caller retries **once** with the matched words added, named as things that
 * must not appear. There is no third attempt: a model that has produced the same
 * allergen twice with it spelled out is not going to stop on the third ask, and
 * the honest answer at that point is to withhold the day.
 */
export abstract class MealDrafterPort {
  abstract draft(input: {
    /** What the member is training today, or null on a rest day. */
    trainingFocus: string | null;
    likes: string[];
    dislikes: string[];
    /** Words that must not appear. The gate's matches, on a retry. */
    prohibitions: string[];
    perDay: number;
  }): Promise<MealDraft | null>;
}

/**
 * What the member eats and cannot eat.
 *
 * Bound to Profile's `foodsFor`, which answers with **lists**. The prose
 * `summary` exists beside it and must never be used here: the allergen gate
 * matches words, and matching them against a sentence is the fragile thing that
 * ends with a member being handed an allergen — `foodsFor`'s own comment
 * carries the argument.
 *
 * Never null. A member mid-bootstrap has declared no allergies, which is the
 * same answer as a member who has declared none, and a nullable return would
 * put a branch into the one code path in this product that must not take a
 * wrong one.
 */
export abstract class MemberFoodsPort {
  abstract foodsFor(userId: string): Promise<{
    allergies: string[];
    likedFoods: string[];
    dislikedFoods: string[];
  }>;
}

/** What the member is training on a given day, in a word. */
export interface DayTraining {
  sport: string;
  title: string;
}

/**
 * Whether the member trains on this date, **whatever became of the session**.
 *
 * Bound to Training's `everythingOnDate`, and the "whatever became of it" is
 * the requirement rather than a detail. The question is *did this member train
 * today*, so that the day's food suits the day they actually had — a session
 * finished at seven in the morning is exactly the one that must be seen, and
 * the rhythm's `onDate`, which filters to `planned`, hides it. A member who
 * trained at dawn would otherwise be fed a rest day.
 *
 * An empty answer is a rest day, and that is a real answer the drafter is told
 * about rather than an absence it has to guess at.
 */
export abstract class DayTrainingPort {
  abstract trainingOn(userId: string, date: string): Promise<DayTraining | null>;
}

/**
 * Which way this member wants their days chosen (FR-004).
 *
 * `preferences.mealMode`, through Profile's published read, with the
 * installation default behind it for a member whose bootstrap row does not
 * exist yet — the fourth adapter of this exact shape, after
 * `defaults.leadTimes`, `defaults.meetingDurationMin` and
 * `defaults.nextPracticeCutoff`. The constitution prices the third copy as the
 * one that moves to `shared/`, and the argument against moving it is written
 * out in `ProfileNextPracticeCutoff`: what would move is not four lines of
 * logic but a widened shared port.
 *
 * A member preference is never read from the settings registry directly. They
 * agree for every member who has not changed it, which is exactly what makes
 * that bug invisible.
 */
export abstract class MealModePort {
  abstract modeFor(userId: string): Promise<'library' | 'llm'>;
}

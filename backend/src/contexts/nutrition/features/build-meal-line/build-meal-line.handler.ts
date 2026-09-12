import { Injectable, Logger } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import { findAllergens } from '../../domain/allergen-gate.js';
import {
  MealSuggestion,
  type ChosenMeal,
  type MealMode,
  type WithheldReason,
} from '../../domain/meal-suggestion.aggregate.js';
import { rotate } from '../../domain/library-rotator.js';
import {
  DayTrainingPort,
  MealDrafterPort,
  MemberFoodsPort,
} from '../../domain/nutrition.ports.js';
import {
  MealRepository,
  MealSuggestionRepository,
} from '../../domain/nutrition.repositories.js';

export interface BuiltMealLine {
  date: string;
  mode: MealMode;
  line: string | null;
  reason: WithheldReason | null;
  /** Whether anything was actually written. A redelivery writes nothing. */
  changed: boolean;
}

/**
 * The day's meal half (FR-003, FR-006, FR-007, story 1).
 *
 * ## It produces half a sentence, on purpose
 *
 * "Workout: … | Meals: …" is composed in **Daily Rhythm**, which owns
 * `daily_plans` and already holds the workout half. This handler answers "what
 * is the member eating on this date" and announces it; the rhythm joins the two
 * and names a rest day. Building the whole sentence here would put half of one
 * line in two contexts and give Nutrition a reason to read a training session
 * in order to write about it — which is exactly what constitution IX and the
 * plan both refuse.
 *
 * ## Two modes, and the library one cannot reach a model
 *
 * SC-002 is *nothing is produced on the member's behalf — measured, not
 * assumed*, and the measurement is a spy on `MealDrafterPort` finding it never
 * called. So the library branch returns before the drafter is mentioned, rather
 * than calling it and discarding the answer, which would pass an output-only
 * check while costing a GPU second and a token count for a member who asked for
 * neither.
 *
 * ## The gate withholds; it never filters
 *
 * An allergen match is retried **once**, with the matched words named as
 * prohibitions, and a second match withholds the whole day. Filtering the
 * offending word out of a generated list leaves the model's intent intact and
 * produces half a sentence — and, worse, leaves the member believing the list
 * was composed for them. `plan.md`'s complexity table records that as a
 * deliberate cost.
 *
 * There is no third attempt. A model that has produced the same allergen twice
 * with it spelled out will not stop on the third ask, and the honest answer at
 * that point is a withheld day with a reason the member can read.
 *
 * ## The gate runs in both modes
 *
 * Including the member's own library, which reads like belt and braces and is
 * not: a member adds "pad thai" in March and declares a peanut allergy in
 * September, and nothing revisits the library in between. Their own list is
 * exactly where an allergen is most likely to sit unnoticed.
 */
@Injectable()
export class BuildMealLineHandler {
  private readonly logger = new Logger(BuildMealLineHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly meals: MealRepository,
    private readonly suggestions: MealSuggestionRepository,
    private readonly drafter: MealDrafterPort,
    private readonly foods: MemberFoodsPort,
    private readonly training: DayTrainingPort,
    private readonly settings: SettingsService,
  ) {}

  async handle(
    userId: string,
    date: string,
    mode: MealMode,
    at: Date = new Date(),
    /**
     * The event that asked for this day, when one did.
     *
     * Stored on the row so a redelivery can recognise itself (FR-013). Null for
     * a member tapping "again", which is deliberately *not* idempotent: two
     * taps mean two answers.
     */
    causeEventId: string | null = null,
  ): Promise<BuiltMealLine> {
    const perDay = await this.settings.get('nutrition.mealsPerDay');
    const chosen =
      mode === 'library'
        ? await this.fromLibrary(userId, date, perDay)
        : await this.fromModel(userId, date, perDay);

    const changed = await this.store(userId, date, mode, chosen, at, causeEventId);
    return {
      date,
      mode,
      line: chosen.reason ? null : names(chosen.meals),
      reason: chosen.reason,
      changed,
    };
  }

  // ------------------------------------------------------------ the two modes

  /** The member's own meals, rotated. Nothing is produced on their behalf. */
  private async fromLibrary(
    userId: string,
    date: string,
    perDay: number,
  ): Promise<Chosen> {
    const library = await this.meals.listFor(userId);
    if (library.length === 0) {
      // FR-004: the client invites them to add meals rather than the system
      // silently switching modes. Switching would be the friendlier-looking
      // thing and would mean a member who chose "my meals" gets generated ones
      // without being asked — which is the one thing story 2 scenario 3 rules
      // out.
      return { meals: [], reason: 'empty_library', model: null };
    }

    const picked = rotate(userId, date, library, perDay);
    if (picked.length === 0) {
      return { meals: [], reason: 'empty_library', model: null };
    }

    const { allergies } = await this.foods.foodsFor(userId);
    const families = await this.settings.get('nutrition.allergenFamilies');
    const safe = [];
    for (const meal of picked) {
      const matches = findAllergens(meal.searchableText, allergies, families);
      if (matches.length === 0) {
        safe.push(meal);
        continue;
      }
      // Dropped rather than the whole day withheld, and this is the one place
      // the two modes differ on the gate. A member's own meal that names an
      // allergen is *their row*, and the rest of the day is still their own
      // food; withholding it all would punish them for a library they can fix.
      // The suggestion branch has no such recourse — there is nothing to keep.
      this.logger.warn(
        `meal ${meal.id} held back from ${date}: names ${matches
          .map((match) => match.declared)
          .join(', ')}`,
      );
    }

    if (safe.length === 0) {
      // Every meal they own names something they are allergic to. A real state
      // and not a library problem, so it is reported as one.
      return { meals: [], reason: 'allergen', model: null };
    }

    return {
      meals: safe.map((meal) => ({
        kind: meal.kind,
        name: meal.name,
        mealId: meal.id,
      })),
      reason: null,
      model: null,
    };
  }

  /** Ordinary ideas from the local model, gated. */
  private async fromModel(
    userId: string,
    date: string,
    perDay: number,
  ): Promise<Chosen> {
    const [{ allergies, likedFoods, dislikedFoods }, families, session] =
      await Promise.all([
        this.foods.foodsFor(userId),
        this.settings.get('nutrition.allergenFamilies'),
        this.training.trainingOn(userId, date),
      ]);

    /*
     * A rest day is told to the drafter rather than left as an absence.
     *
     * "Given a hard training day, the suggestion reflects it in plain terms"
     * (story 3 scenario 1) needs the drafter to know which kind of day it is,
     * and a null it has to interpret is a null it will interpret differently
     * next month. The word "rest day" is in the prompt.
     */
    const trainingFocus = session ? `${session.sport} — ${session.title}` : null;

    const first = await this.drafter.draft({
      trainingFocus,
      likes: likedFoods,
      // FR-007 is zero across a run of days, not "rarely": the dislikes are
      // prohibitions on the way in rather than a filter on the way out, because
      // filtering a generated list leaves gaps where the food was.
      dislikes: dislikedFoods,
      prohibitions: [],
      perDay,
    });
    if (!first) {
      return { meals: [], reason: 'model_unavailable', model: null };
    }

    const matches = findAllergens(text(first.meals), allergies, families);
    if (matches.length === 0) {
      return { meals: chosenFrom(first.meals), reason: null, model: first.model };
    }

    this.logger.warn(
      `the first draft for ${date} named ${matches
        .map((match) => `${match.found} (${match.declared})`)
        .join(', ')}; retrying once with them prohibited`,
    );

    const second = await this.drafter.draft({
      trainingFocus,
      likes: likedFoods,
      dislikes: dislikedFoods,
      // Both the member's word and the one the model actually used, because the
      // model has to be told about the word it wrote rather than only about the
      // allergy: "almond" back from a "nuts" declaration needs "almond" in the
      // prohibition or the retry is the same ask.
      prohibitions: [
        ...new Set(matches.flatMap((match) => [match.declared, match.found])),
      ],
      perDay,
    });
    if (!second) {
      return { meals: [], reason: 'model_unavailable', model: null };
    }

    const again = findAllergens(text(second.meals), allergies, families);
    if (again.length > 0) {
      this.logger.error(
        `the retry for ${date} named ${again
          .map((match) => match.found)
          .join(', ')} again; the day is withheld`,
      );
      return { meals: [], reason: 'allergen', model: null };
    }

    return { meals: chosenFrom(second.meals), reason: null, model: second.model };
  }

  // ---------------------------------------------------------------- the write

  /**
   * The day's row, created or replaced, announcing itself either way.
   *
   * One transaction, so the row and its event commit together: a stored half
   * with no event is a member whose home card shows the meals they replaced an
   * hour ago, and an event with no row is a card that follows a day the store
   * does not have.
   */
  private async store(
    userId: string,
    date: string,
    mode: MealMode,
    chosen: Chosen,
    at: Date,
    causeEventId: string | null,
  ): Promise<boolean> {
    const existing = await this.suggestions.forDate(userId, date);

    if (!existing) {
      const created = chosen.reason
        ? MealSuggestion.withhold({
            userId,
            date,
            mode,
            reason: chosen.reason,
            causeEventId,
            at,
          })
        : MealSuggestion.propose({
            userId,
            date,
            mode,
            meals: chosen.meals,
            model: chosen.model,
            causeEventId,
            at,
          });
      await this.uow.run(() => this.suggestions.save(created));
      return true;
    }

    const moved = existing.replace({
      mode,
      meals: chosen.meals,
      reason: chosen.reason,
      model: chosen.model,
      causeEventId,
      at,
    });

    // Nothing the member can see moved: the same rotation on the same day.
    // The row is still written when the *cause* moved, because "this event has
    // been served" is what stops the next delivery drafting again — and that
    // write raises nothing and does not bump `updatedAt`, so no device is told
    // a line changed when it did not.
    if (!moved) {
      if (!existing.noteCause(causeEventId)) return false;
      await this.uow.run(() => this.suggestions.save(existing));
      return false;
    }

    await this.uow.run(() => this.suggestions.save(existing));
    return true;
  }
}

interface Chosen {
  meals: ChosenMeal[];
  reason: WithheldReason | null;
  model: string | null;
}

function chosenFrom(meals: Array<{ kind: string; name: string }>): ChosenMeal[] {
  return meals.map((meal) => ({
    kind: meal.kind as ChosenMeal['kind'],
    name: meal.name,
    // Nothing in the member's library was used, so there is nothing to point
    // at. `replace-today-meal` is what gives a slot a `mealId`.
    mealId: null,
  }));
}

/** Everything the gate should read about a draft: every name, joined. */
function text(meals: Array<{ name: string }>): string {
  return meals.map((meal) => meal.name).join(' ');
}

function names(meals: ChosenMeal[]): string | null {
  const list = meals.map((meal) => meal.name).filter((name) => name !== '');
  return list.length === 0 ? null : list.join(', ');
}

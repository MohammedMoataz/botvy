import { Injectable } from '@nestjs/common';
import type { MealKind } from '../../domain/meal.aggregate.js';
import type {
  ChosenMeal,
  MealMode,
  WithheldReason,
} from '../../domain/meal-suggestion.aggregate.js';
import {
  MealRepository,
  MealSuggestionRepository,
} from '../../domain/nutrition.repositories.js';

export interface MealView {
  id: string;
  name: string;
  kind: MealKind;
  ingredients: string[];
  tags: string[];
  updatedAt: Date;
}

export interface TodayMealsView {
  date: string;
  mode: MealMode;
  meals: ChosenMeal[];
  /** The names joined. Null when the day was withheld. */
  line: string | null;
  /** A code the surface renders in the member's own language, never a sentence. */
  withheldReason: WithheldReason | null;
}

/**
 * Nutrition's reads (FR-002, FR-014).
 *
 * ## `todayMeals` does not build anything
 *
 * A query that wrote would be the third way a day gets chosen, and the two that
 * exist — the rhythm asking through `TodayMealsPort`, and the member asking
 * through `POST /nutrition/today/regenerate` — are both commands wearing their
 * own name. A card that opens before either has run shows a day with no meals
 * yet, which is true, and the next touch fills it.
 *
 * That is also why this returns the **whole day** rather than the line alone:
 * the reason is what the card needs when the line is null, and the individual
 * meals are what the "use one of mine" picker replaces by position.
 *
 * ## Any date, not only today
 *
 * Past days included, because FR-011's promise — a past day keeps the line it
 * was given — is only observable if something can read one back. The rows are
 * scoped by `userId` in the repository, so a date is all the caller supplies.
 */
@Injectable()
export class MealsQueryHandler {
  constructor(
    private readonly meals: MealRepository,
    private readonly suggestions: MealSuggestionRepository,
  ) {}

  /** The member's own library, optionally of one kind. */
  async list(userId: string, kind?: MealKind): Promise<MealView[]> {
    const rows = await this.meals.listFor(userId, kind);
    return rows.map((meal) => ({
      id: meal.id,
      name: meal.name,
      kind: meal.kind,
      ingredients: meal.ingredients,
      tags: meal.tags,
      updatedAt: meal.updatedAt,
    }));
  }

  async forDate(userId: string, date: string): Promise<TodayMealsView | null> {
    const day = await this.suggestions.forDate(userId, date);
    if (!day) return null;
    return {
      date: day.date,
      mode: day.mode,
      meals: day.meals,
      line: day.line,
      withheldReason: day.withheldReason,
    };
  }
}

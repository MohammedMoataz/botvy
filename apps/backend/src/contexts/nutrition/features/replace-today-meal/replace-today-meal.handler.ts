import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { MealNotFound } from '../add-meal/add-meal.handler.js';
import { MealSuggestionRepository, MealRepository } from '../../domain/nutrition.repositories.js';
import { PastDayIsSettled } from '../regenerate-today/regenerate-today.handler.js';
import type { MealHalf } from '../regenerate-today/regenerate-today.handler.js';
import { RegenerateTodayHandler } from '../regenerate-today/regenerate-today.handler.js';

export class NoMealsOnThatDay extends Error {
  constructor(date: string) {
    super(`Nothing has been proposed for ${date}, so there is nothing to swap.`);
  }
}

export class NoSuchSlot extends Error {
  constructor(index: number) {
    super(`The day has no meal at position ${index}.`);
  }
}

/**
 * One meal swapped for one of the member's own (FR-010).
 *
 * ## The rest of the day is untouched, which is the requirement in as many words
 *
 * A member replacing lunch has not asked for a different breakfast. So this is
 * not a regeneration with a hint — it is a single slot, matched by **position**
 * rather than by kind, because two `any` meals can share a kind and the member
 * tapped a row rather than a category.
 *
 * ## The allergen gate does not run here
 *
 * Deliberate, and worth stating because every other path in this context gates.
 * The member is naming a meal out of their own library, for themselves, having
 * read it. Refusing it would be this product telling somebody they may not eat
 * their own food — and the gate exists to stop *the system* handing them
 * something, not to police them. What does protect them is that the same meal
 * would be held back from an automatic rotation, where nobody chose it
 * deliberately, and `build-meal-line` does exactly that.
 *
 * ## A withheld day can be swapped into
 *
 * If the model was unavailable this morning, a member picking their own lunch
 * turns the day into one with a meal on it. `MealSuggestion.swap` clears the
 * reason for that reason.
 */
@Injectable()
export class ReplaceTodayMealHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly suggestions: MealSuggestionRepository,
    private readonly meals: MealRepository,
    private readonly days: RegenerateTodayHandler,
  ) {}

  async handle(
    userId: string,
    input: { date: string; index: number; mealId: string },
    at: Date = new Date(),
  ): Promise<MealHalf> {
    const today = await this.days.todayFor(userId, at);
    if (input.date < today) throw new PastDayIsSettled(input.date);

    const [day, meal] = await Promise.all([
      this.suggestions.forDate(userId, input.date),
      this.meals.findById(userId, input.mealId),
    ]);
    if (!day) throw new NoMealsOnThatDay(input.date);
    if (!meal || meal.isDeleted) throw new MealNotFound(input.mealId);

    const moved = day.swap(
      input.index,
      // The name is stored beside the id so the day survives the meal being
      // deleted afterwards (FR-011) — the id may later point at nothing.
      { kind: meal.kind, name: meal.name, mealId: meal.id },
      at,
    );
    if (!moved) {
      if (input.index < 0 || input.index >= day.meals.length) {
        throw new NoSuchSlot(input.index);
      }
      // The same meal already in that slot. Nothing written, nothing announced,
      // and not an error: a double tap is not a failure.
      return {
        date: day.date,
        line: day.line,
        reason: day.withheldReason,
        rebuilt: false,
      };
    }

    await this.uow.run(() => this.suggestions.save(day));
    return {
      date: day.date,
      line: day.line,
      reason: day.withheldReason,
      rebuilt: true,
    };
  }
}

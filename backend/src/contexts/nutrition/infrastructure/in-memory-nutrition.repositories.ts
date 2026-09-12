import type { DomainEvent } from '../../../shared/cqrs/domain-event.js';
import type { InMemoryUnitOfWork } from '../../../shared/persistence/memory/in-memory-unit-of-work.js';
import { StaleWriteError } from '../../../shared/persistence/ports/errors.js';
import {
  MealSuggestion,
  suggestionId,
  type MealSuggestionState,
} from '../domain/meal-suggestion.aggregate.js';
import { Meal, type MealKind, type MealState } from '../domain/meal.aggregate.js';
import {
  MealRepository,
  MealSuggestionRepository,
} from '../domain/nutrition.repositories.js';

/**
 * The two adapters every Nutrition handler spec binds.
 *
 * They make the same promises the Mongo ones do — events pulled on save, an
 * older copy refused with `StaleWriteError`, the same ordering — because a
 * promise broken here lets a handler pass its spec and misbehave against a real
 * database.
 *
 * ## Ordering
 *
 * `listFor` sorts by **name**, exactly as the Mongo adapter does, and that is
 * load-bearing rather than cosmetic: the rotator's whole promise is that the
 * same member on the same date gets the same meals (FR-009), and it takes the
 * order it is given. Two adapters that disagreed about it would give a spec one
 * rotation and production another, which is the kind of difference a green
 * suite cannot see.
 *
 * Neither sort key is nullable — `name` is required and non-empty by the
 * aggregate, `_id` is client-minted — so Mongo's "null sorts first" never comes
 * into play here.
 */
export class InMemoryMealRepository extends MealRepository {
  readonly rows = new Map<string, MealState>();
  readonly events: DomainEvent[] = [];

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows, this.events);
  }

  async findById(userId: string, id: string): Promise<Meal | null> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return null;
    return Meal.rehydrate(structuredClone(row));
  }

  async save(meal: Meal): Promise<void> {
    const existing = this.rows.get(meal.id);
    if (existing && existing.updatedAt > meal.updatedAt) {
      throw new StaleWriteError(meal.id);
    }
    this.#raise(meal.pullEvents());
    this.rows.set(meal.id, stateOfMeal(meal));
  }

  async remove(meal: Meal): Promise<void> {
    this.#raise(meal.pullEvents());
    this.rows.delete(meal.id);
  }

  async pullSince(userId: string, since: Date | null): Promise<Meal[]> {
    return [...this.rows.values()]
      .filter(
        (row) => row.userId === userId && (!since || row.updatedAt > since),
      )
      .sort(
        (a, b) =>
          a.updatedAt.getTime() - b.updatedAt.getTime() || compare(a.id, b.id),
      )
      .map((row) => Meal.rehydrate(structuredClone(row)));
  }

  /** `any` is eligible for every slot; see the Mongo adapter's note. */
  async listFor(userId: string, kind?: MealKind): Promise<Meal[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.userId === userId &&
          row.deletedAt === null &&
          (!kind || kind === 'any' || row.kind === kind || row.kind === 'any'),
      )
      .sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id))
      .map((row) => Meal.rehydrate(structuredClone(row)));
  }

  async purgeTombstonesBefore(before: Date, userId?: string): Promise<number> {
    let removed = 0;
    for (const [id, row] of this.rows) {
      if (row.deletedAt && row.deletedAt < before && (!userId || row.userId === userId)) {
        this.rows.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  async removeAllFor(userId: string): Promise<number> {
    return removeAllFor(this.rows, userId);
  }

  #raise(events: DomainEvent[]): void {
    this.uow.collect(events);
    this.events.push(...events);
  }
}

export class InMemoryMealSuggestionRepository extends MealSuggestionRepository {
  readonly rows = new Map<string, MealSuggestionState>();
  readonly events: DomainEvent[] = [];

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows, this.events);
  }

  async findById(userId: string, id: string): Promise<MealSuggestion | null> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return null;
    return MealSuggestion.rehydrate(structuredClone(row));
  }

  async save(suggestion: MealSuggestion): Promise<void> {
    const existing = this.rows.get(suggestion.id);
    if (existing && existing.updatedAt > suggestion.updatedAt) {
      throw new StaleWriteError(suggestion.id);
    }
    this.#raise(suggestion.pullEvents());
    this.rows.set(suggestion.id, stateOfSuggestion(suggestion));
  }

  async remove(suggestion: MealSuggestion): Promise<void> {
    this.#raise(suggestion.pullEvents());
    this.rows.delete(suggestion.id);
  }

  /** Through the composed key, exactly as the Mongo adapter does. */
  async forDate(userId: string, date: string): Promise<MealSuggestion | null> {
    return this.findById(userId, suggestionId(userId, date));
  }

  async removeAllFor(userId: string): Promise<number> {
    return removeAllFor(this.rows, userId);
  }

  #raise(events: DomainEvent[]): void {
    this.uow.collect(events);
    this.events.push(...events);
  }
}

function stateOfMeal(meal: Meal): MealState {
  return {
    id: meal.id,
    userId: meal.userId,
    name: meal.name,
    kind: meal.kind,
    ingredients: [...meal.ingredients],
    tags: [...meal.tags],
    createdAt: meal.createdAt,
    updatedAt: meal.updatedAt,
    deletedAt: meal.deletedAt,
  };
}

function stateOfSuggestion(suggestion: MealSuggestion): MealSuggestionState {
  return {
    id: suggestion.id,
    userId: suggestion.userId,
    date: suggestion.date,
    mode: suggestion.mode,
    meals: suggestion.meals.map((meal) => ({ ...meal })),
    line: suggestion.line,
    withheldReason: suggestion.withheldReason,
    model: suggestion.model,
    causeEventId: suggestion.causeEventId,
    createdAt: suggestion.createdAt,
    updatedAt: suggestion.updatedAt,
  };
}

function removeAllFor(
  rows: Map<string, { userId: string }>,
  userId: string,
): number {
  let removed = 0;
  for (const [id, row] of rows) {
    if (row.userId === userId) {
      rows.delete(id);
      removed += 1;
    }
  }
  return removed;
}

function compare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

import { Repository } from '../../../shared/persistence/ports/repository.js';
import { SyncableRepository } from '../../../shared/persistence/ports/syncable-repository.js';
import type { Meal, MealKind } from './meal.aggregate.js';
import type { MealSuggestion } from './meal-suggestion.aggregate.js';

/**
 * The member's own meals, and what was proposed for each day.
 *
 * One is syncable and the other is not, and the split is the whole shape of this
 * context. A **meal** is something the member typed and may edit on a plane, so
 * it is a client-minted row like every other. A **day's suggestion** is written
 * by the server from the member's library or from the model, and the only part
 * of it a client needs — the line itself — already travels inside
 * `daily_plans.mealLine`, a table P3 syncs. Adding a second synced entity for
 * one string would widen the offline contract for nothing.
 */
export abstract class MealRepository extends SyncableRepository<Meal> {
  /**
   * The member's live meals, optionally of one kind.
   *
   * The rotator wants them all and the editor's kind chips want one; both go
   * through here rather than the rotator filtering in memory, because a member
   * with two hundred meals should not have their whole library read to fill a
   * breakfast slot.
   */
  abstract listFor(userId: string, kind?: MealKind): Promise<Meal[]>;

  abstract purgeTombstonesBefore(before: Date, userId?: string): Promise<number>;

  abstract removeAllFor(userId: string): Promise<number>;
}

export abstract class MealSuggestionRepository extends Repository<MealSuggestion> {
  /**
   * What was proposed for one of the member's own days, or null.
   *
   * By date rather than by id, even though the id *is* `userId:date`, because a
   * caller that assembled the key itself would be a second place holding that
   * construction — and the day this collection is keyed differently, that
   * caller keeps working and reads the wrong row.
   */
  abstract forDate(userId: string, date: string): Promise<MealSuggestion | null>;

  abstract removeAllFor(userId: string): Promise<number>;
}

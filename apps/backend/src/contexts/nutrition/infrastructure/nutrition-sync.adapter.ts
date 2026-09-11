import { Injectable } from '@nestjs/common';
import {
  resolveConflict,
  type RejectionReason,
  type SyncChange,
} from '../../../shared/persistence/ports/sync-change.js';
import { UnitOfWork } from '../../../shared/persistence/ports/unit-of-work.js';
import type {
  ApplyOutcome,
  SyncableEntity,
} from '../../sync/domain/syncable-entity.port.js';
import {
  Meal,
  MealRuleError,
  type MealKind,
} from '../domain/meal.aggregate.js';
import { MealRepository } from '../domain/nutrition.repositories.js';

/**
 * 43 — between Training's workouts at 39 and Knowledge's links at 45, which is
 * where `contracts/sync.md`'s `entities` list puts meals. Not a dependency: a
 * meal references nothing and nothing references a meal. `LINK_APPLY_ORDER`'s
 * own comment reserved this gap for it in P7.
 */
export const MEAL_APPLY_ORDER = 43;

/**
 * Meals, over `/sync` (FR-002).
 *
 * ## The whole row is the member's, so the whole row is pushable
 *
 * Unlike links — where `status` and `attempts` are the server's record of work
 * it did and a client that could push them could lie about having read an
 * article — every column of a meal is something the member typed. So `create`,
 * `update`, `delete`, `restore` and `purge` are all accepted, and the adapter
 * is the plain shape `WorkoutSyncAdapter` has.
 *
 * ## What a pushed meal does *not* do
 *
 * It does not rebuild today's line. A member who edits "chicken sallad" on a
 * plane has not asked for a different lunch, and the day's row stores the name
 * as it was chosen precisely so past days survive the edit (FR-011). The two
 * things that do rebuild a day are the member asking and their allergies
 * changing, and neither arrives here.
 *
 * That includes a meal *deleted* offline: the day that used it keeps its name,
 * because the name is stored beside the id for exactly this.
 *
 * ## Why not through `AddMealHandler`
 *
 * Same reason every other sync adapter in this codebase talks to the aggregate
 * directly: the handler answers "here is the row you already had" for a repeat
 * id, which is right for a member pressing Save and wrong for a batch push,
 * where the honest answer is that this id was applied. There is no rule in the
 * handler that is not in the aggregate.
 */
@Injectable()
export class MealSyncAdapter implements SyncableEntity {
  readonly entity = 'meals';
  readonly applyOrder = MEAL_APPLY_ORDER;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly meals: MealRepository,
  ) {}

  async pull(userId: string, since: Date | null): Promise<unknown[]> {
    const rows = await this.meals.pullSince(userId, since);
    return rows.map((meal) => ({
      id: meal.id,
      name: meal.name,
      kind: meal.kind,
      ingredients: meal.ingredients,
      tags: meal.tags,
      createdAt: meal.createdAt,
      updatedAt: meal.updatedAt,
      deletedAt: meal.deletedAt,
    }));
  }

  async apply(
    userId: string,
    change: SyncChange,
    now: Date,
  ): Promise<ApplyOutcome> {
    const existing = await this.meals.findById(userId, change.id);

    const verdict = resolveConflict(change, existing, now);
    if (!verdict.accept) {
      return this.refuse(change, verdict.reason, existing);
    }

    const fields = change.fields as PushedMeal;

    try {
      if (!existing) {
        const meal = Meal.create({
          id: change.id,
          userId,
          name: fields.name ?? '',
          kind: fields.kind ?? 'any',
          ingredients: fields.ingredients ?? [],
          tags: fields.tags ?? [],
          // The member's own moment. They added it on the plane, and the row
          // should say so.
          createdAt: change.updatedAt,
        });
        await this.uow.run(() => this.meals.save(meal));
        return { applied: true, id: meal.id };
      }

      switch (change.op) {
        case 'delete':
          if (!existing.isDeleted) existing.tombstone(now);
          break;
        case 'restore':
          if (existing.isDeleted) existing.restore(now);
          break;
        case 'purge':
          existing.assertPurgeable();
          await this.uow.run(() => this.meals.remove(existing));
          return { applied: true, id: existing.id };
        default:
          existing.edit(
            {
              name: fields.name,
              kind: fields.kind,
              ingredients: fields.ingredients,
              tags: fields.tags,
            },
            now,
          );
      }

      await this.uow.run(() => this.meals.save(existing));
      return { applied: true, id: existing.id };
    } catch (error) {
      if (error instanceof MealRuleError) {
        /*
         * A nameless meal, an unknown kind, or a purge of a live row.
         *
         * `invalid` rather than `stale` for all but the last, because a stale
         * verdict tells the phone to take the server's copy and try again, and
         * against a rule that will never accept the edit it retries for ever.
         * `not_deleted` is its own reason for the same reason it is on every
         * other collection: the phone's Deleted view is out of step and knows
         * what to do about it.
         */
        return this.refuse(
          change,
          error.code === 'not_deleted' ? 'not_deleted' : 'invalid',
          existing,
        );
      }
      throw error;
    }
  }

  private refuse(
    change: SyncChange,
    reason: RejectionReason,
    existing: Meal | null,
  ): ApplyOutcome {
    return {
      applied: false,
      rejection: {
        entity: this.entity,
        id: change.id,
        reason,
        server: existing
          ? {
              id: existing.id,
              name: existing.name,
              kind: existing.kind,
              ingredients: existing.ingredients,
              tags: existing.tags,
              createdAt: existing.createdAt,
              updatedAt: existing.updatedAt,
              deletedAt: existing.deletedAt,
            }
          : null,
      },
    };
  }
}

interface PushedMeal {
  name?: string;
  kind?: MealKind;
  ingredients?: string[];
  tags?: string[];
}

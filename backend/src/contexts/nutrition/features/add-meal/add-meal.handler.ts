import { Injectable } from '@nestjs/common';
import { isUuid } from '../../../../shared/cqrs/ids.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { Meal, type MealKind } from '../../domain/meal.aggregate.js';
import { MealRepository } from '../../domain/nutrition.repositories.js';

export class InvalidMealId extends Error {
  constructor(id: string) {
    super(
      `"${id}" is not a UUID. The client mints the id, and it has to be a UUIDv7.`,
    );
  }
}

export class MealNotFound extends Error {
  constructor(id: string) {
    super(`No meal ${id}.`);
  }
}

export interface AddMealCommand {
  /** Minted by the client, so a meal added offline has a reference at once. */
  id: string;
  name: string;
  kind?: MealKind;
  ingredients?: string[];
  tags?: string[];
}

export interface AddMealResult {
  id: string;
  updatedAt: Date;
  /** True when this call created nothing because the meal was already there. */
  replayed: boolean;
}

/**
 * A meal the member keeps (FR-001).
 *
 * The client supplies the id and a repeat of it is not an error: the phone adds
 * meals with no network and needs a stable reference before the server has
 * heard of the row, which makes a retry after a dropped connection
 * indistinguishable from a genuine second add unless the id decides it. An id
 * that already exists is answered as the add that already happened.
 *
 * `kind` defaults to `any` rather than to `breakfast`, and that is a product
 * decision rather than a fallback: a member whose lunch and dinner are the same
 * four dishes should not have to enter each of them twice, and the rotator
 * treats an `any` meal as eligible for every slot.
 *
 * ## It is also the chat's write path
 *
 * P4's intent executor dispatches this same handler for "add grilled chicken to
 * my meals" (FR-012, T853), rather than opening a second way into the
 * collection. A second write path is how one of them comes to skip a rule the
 * other enforces.
 */
@Injectable()
export class AddMealHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly meals: MealRepository,
  ) {}

  async handle(
    userId: string,
    command: AddMealCommand,
    at: Date = new Date(),
  ): Promise<AddMealResult> {
    if (!isUuid(command.id)) throw new InvalidMealId(command.id);

    const existing = await this.meals.findById(userId, command.id);
    if (existing) {
      return { id: existing.id, updatedAt: existing.updatedAt, replayed: true };
    }

    const meal = Meal.create({
      id: command.id,
      userId,
      name: command.name,
      kind: command.kind ?? 'any',
      ingredients: command.ingredients ?? [],
      tags: command.tags ?? [],
      createdAt: at,
    });

    await this.uow.run(() => this.meals.save(meal));
    return { id: meal.id, updatedAt: meal.updatedAt, replayed: false };
  }
}

/**
 * The editor's form. Every field optional, because a patch is what changed.
 *
 * Editing a meal deliberately does **not** rebuild today's line. A member
 * correcting a typo in "chicken sallad" has not asked for a different lunch,
 * and the day's row stores the *name as it was chosen* precisely so past days
 * survive an edit (FR-011). What does rebuild the day is the member asking —
 * `regenerate-today` — or a change to their allergies, which is a different
 * event and a different handler.
 */
@Injectable()
export class UpdateMealHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly meals: MealRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    patch: {
      name?: string;
      kind?: MealKind;
      ingredients?: string[];
      tags?: string[];
    },
    at: Date = new Date(),
  ): Promise<{ id: string; changed: string[] }> {
    const meal = await this.meals.findById(userId, id);
    if (!meal) throw new MealNotFound(id);

    const changed = meal.edit(patch, at);
    if (changed.length === 0) return { id: meal.id, changed };

    await this.uow.run(() => this.meals.save(meal));
    return { id: meal.id, changed };
  }
}

/**
 * Removing a meal from the library.
 *
 * Tombstoned, never removed: meals sync, the pull is a delta by cursor, and the
 * client's delete sweep runs **only** against a full snapshot — so a row
 * removed outright on the server stays on every device for ever. Deletions
 * reach a client as tombstones or they do not reach it at all.
 *
 * Past days keep the meal's **name** rather than a pointer to it, so a day that
 * used this meal still reads correctly afterwards (FR-011). That is why the
 * day's row stores both.
 */
@Injectable()
export class DeleteMealHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly meals: MealRepository,
  ) {}

  async handle(userId: string, id: string, at: Date = new Date()): Promise<void> {
    const meal = await this.meals.findById(userId, id);
    if (!meal) throw new MealNotFound(id);
    if (meal.isDeleted) return;

    meal.tombstone(at);
    await this.uow.run(() => this.meals.save(meal));
  }
}

@Injectable()
export class RestoreMealHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly meals: MealRepository,
  ) {}

  async handle(userId: string, id: string, at: Date = new Date()): Promise<void> {
    const meal = await this.meals.findById(userId, id);
    if (!meal) throw new MealNotFound(id);
    if (!meal.isDeleted) return;

    meal.restore(at);
    await this.uow.run(() => this.meals.save(meal));
  }
}

/** The hard delete, for a row the member has already tombstoned. */
@Injectable()
export class PurgeMealHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly meals: MealRepository,
  ) {}

  async handle(userId: string, id: string): Promise<void> {
    const meal = await this.meals.findById(userId, id);
    if (!meal) throw new MealNotFound(id);
    meal.assertPurgeable();
    await this.uow.run(() => this.meals.remove(meal));
  }
}

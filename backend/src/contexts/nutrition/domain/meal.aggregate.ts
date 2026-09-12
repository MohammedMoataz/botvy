import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';

/**
 * Which part of the day a meal belongs to.
 *
 * `any` is not a fallback for "the member did not say" — it is a real answer.
 * A member whose lunch and dinner are the same four dishes should not have to
 * enter each of them twice, and the rotator treats an `any` meal as eligible
 * for every slot. The editor defaults to it for that reason.
 */
export type MealKind = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'any';

export const MEAL_KINDS: readonly MealKind[] = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'any',
];

export const MAX_MEAL_NAME = 200;
export const MAX_INGREDIENTS = 30;
export const MAX_TAGS = 12;

export interface MealState {
  id: string;
  userId: string;
  name: string;
  kind: MealKind;
  /**
   * What is in it, in the member's own words.
   *
   * Optional, and it earns its place for one reason beyond the member's memory:
   * the allergen gate reads the *name and the ingredients together*, so a
   * member whose "mum's stew" contains peanuts is protected only if they wrote
   * that down. The editor says so rather than leaving it as a blank box.
   */
  ingredients: string[];
  /** The member's own labels. Nothing in the product interprets them. */
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class MealRuleError extends Error {
  constructor(
    readonly code: 'name_required' | 'unknown_kind' | 'not_deleted',
    message: string,
  ) {
    super(message);
    this.name = 'MealRuleError';
  }
}

/**
 * A meal the member keeps (FR-001).
 *
 * ## No events
 *
 * Nothing subscribes. Adding a meal changes no plan, sends no notification and
 * reaches the member's other devices through `/sync` like every other row — and
 * "an event with consumers and no producer is dead documentation" cuts both
 * ways. The day's *line* is what announces itself, and a member who adds a meal
 * at noon sees it tomorrow unless they regenerate today, which is its own
 * command. Same reasoning as `Workout`, and this comment is what the person
 * adding the first subscriber reads.
 *
 * ## Nothing here is nutritional
 *
 * No calories, no portions, no macronutrients — FR-005 and the phase's whole
 * posture. A field for any of them would be the first step towards the product
 * making a claim it has no business making, and the spec puts all three out of
 * scope by name.
 */
export class Meal extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  name: string;
  kind: MealKind;
  ingredients: string[];
  tags: string[];
  readonly createdAt: Date;
  deletedAt: Date | null;

  private constructor(state: MealState) {
    super();
    this.id = state.id;
    this.userId = state.userId;
    this.name = state.name;
    this.kind = state.kind;
    this.ingredients = state.ingredients;
    this.tags = state.tags;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
    this.deletedAt = state.deletedAt;
  }

  static rehydrate(state: MealState): Meal {
    return new Meal(state);
  }

  static create(state: Omit<MealState, 'updatedAt' | 'deletedAt'>): Meal {
    return new Meal({
      ...state,
      name: requireName(state.name),
      kind: requireKind(state.kind),
      ingredients: normalise(state.ingredients, MAX_INGREDIENTS),
      tags: normalise(state.tags, MAX_TAGS),
      updatedAt: state.createdAt,
      deletedAt: null,
    });
  }

  edit(
    patch: {
      name?: string;
      kind?: MealKind;
      ingredients?: string[];
      tags?: string[];
    },
    at: Date = new Date(),
  ): string[] {
    const changed: string[] = [];
    if (patch.name !== undefined) {
      const name = requireName(patch.name);
      if (name !== this.name) {
        this.name = name;
        changed.push('name');
      }
    }
    if (patch.kind !== undefined) {
      const kind = requireKind(patch.kind);
      if (kind !== this.kind) {
        this.kind = kind;
        changed.push('kind');
      }
    }
    if (patch.ingredients !== undefined) {
      this.ingredients = normalise(patch.ingredients, MAX_INGREDIENTS);
      changed.push('ingredients');
    }
    if (patch.tags !== undefined) {
      this.tags = normalise(patch.tags, MAX_TAGS);
      changed.push('tags');
    }
    if (changed.length === 0) return changed;
    this.updatedAt = at;
    return changed;
  }

  tombstone(at: Date = new Date()): void {
    this.deletedAt = at;
    this.updatedAt = at;
  }

  restore(at: Date = new Date()): void {
    this.deletedAt = null;
    this.updatedAt = at;
  }

  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  /**
   * Everything the allergen gate should read about this meal.
   *
   * The name *and* the ingredients, joined — because "mum's stew" says nothing
   * and "peanut, lamb, rice" says everything, and a gate given only the name
   * would pass a meal whose ingredients the member had carefully written down.
   */
  get searchableText(): string {
    return [this.name, ...this.ingredients].join(' ');
  }

  /** Whether this meal can fill a slot of that kind. See `MealKind`. */
  fits(kind: MealKind): boolean {
    return this.kind === 'any' || kind === 'any' || this.kind === kind;
  }

  assertPurgeable(): void {
    if (!this.isDeleted) {
      throw new MealRuleError(
        'not_deleted',
        'Only a deleted meal can be erased.',
      );
    }
  }
}

function requireName(raw: string): string {
  const name = raw.trim().slice(0, MAX_MEAL_NAME);
  if (name === '') {
    throw new MealRuleError('name_required', 'A meal needs a name.');
  }
  return name;
}

function requireKind(raw: MealKind): MealKind {
  if (!MEAL_KINDS.includes(raw)) {
    throw new MealRuleError(
      'unknown_kind',
      `"${raw}" is not one of ${MEAL_KINDS.join(', ')}.`,
    );
  }
  return raw;
}

/**
 * Trimmed, de-duplicated, capped, and **kept in the member's own case**.
 *
 * Lower-casing would be the obvious thing and is wrong here: these are read
 * back to the member on their own screen, and a list that turns "Mum's Stew"
 * into "mum's stew" has edited what they typed. The allergen gate lower-cases
 * on its own side, where nobody sees the result.
 */
function normalise(values: string[], cap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values ?? []) {
    const value = raw.trim().slice(0, 80);
    const key = value.toLowerCase();
    if (value === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length === cap) break;
  }
  return out;
}

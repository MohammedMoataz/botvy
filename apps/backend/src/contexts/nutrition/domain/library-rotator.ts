import type { Meal, MealKind } from './meal.aggregate.js';

/**
 * Which kinds a day is filled with, in order, for a given count.
 *
 * Three is the default and the shape the spec assumes, so it is the case this
 * table is written around; the others are what a member who eats twice or snacks
 * gets. Beyond five the extra slots are snacks, because a sixth *dinner* is not
 * a thing and the alternative — repeating the table — would put two dinners on
 * one day.
 */
export function slotsFor(perDay: number): MealKind[] {
  const base: MealKind[] = ['breakfast', 'lunch', 'dinner', 'snack', 'snack'];
  if (perDay <= base.length) return base.slice(0, Math.max(1, perDay));
  return [...base, ...Array<MealKind>(perDay - base.length).fill('snack')];
}

/**
 * The member's own meals, rotated (FR-003, story 2).
 *
 * ## Deterministic on `(userId, date)`, and that is the requirement
 *
 * A member who opens the app twice before lunch must see the same lunch both
 * times — the line is a statement about their day, not a slot machine — while
 * consecutive days differ, because "varies across days rather than repeating
 * one" is FR-003's second half. Both fall out of seeding a rotation with the
 * date rather than storing a cursor.
 *
 * Storing a cursor was the obvious alternative and is worse in three ways: it is
 * a write on a read path, it makes "what did Tuesday say" unanswerable once the
 * cursor has moved past it, and two devices asking on the same morning would
 * advance it twice and disagree. The seed is a pure function of two things the
 * caller already has.
 *
 * ## No model call, and that is measured rather than promised
 *
 * Nothing in this file can reach a model — it takes meals and returns meals.
 * SC-002 is asserted in the spec by spying on the drafter port and finding it
 * never called, which is a claim about *work* rather than about output, and the
 * only kind worth making.
 */
export function rotate(
  userId: string,
  date: string,
  meals: Meal[],
  perDay: number,
): Meal[] {
  const live = meals.filter((meal) => !meal.isDeleted);
  if (live.length === 0) return [];

  const slots = slotsFor(perDay);
  const offset = seed(`${userId}:${date}`);
  const chosen: Meal[] = [];
  const used = new Set<string>();

  for (const [index, slot] of slots.entries()) {
    /*
     * The meals that could fill this slot, in a stable order.
     *
     * Sorted by id rather than left in whatever order the store returned, so
     * the rotation does not silently change when a member edits an unrelated
     * meal and the repository's ordering shifts. The id is a UUIDv7, so this is
     * also roughly the order they were added — which is what a member would
     * guess if they guessed anything.
     */
    const eligible = live
      .filter((meal) => meal.fits(slot))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (eligible.length === 0) continue;

    // A different starting point per slot, so a member with three `any` meals
    // gets three different ones rather than the same meal three times. Seven is
    // coprime with most small library sizes, which is all that is wanted: a
    // stride that shared a factor with the count would revisit the same few.
    const start = (offset + index * 7) % eligible.length;
    const pick = pickFrom(eligible, start, used);

    // Null means every eligible meal is already on the day. A member with two
    // meals and a three-meal day gets two lines rather than one repeated, which
    // is the honest rendering of a short library — and FR-003's "vary the
    // selection" read at the scale of a single day.
    if (!pick) continue;
    used.add(pick.id);
    chosen.push(pick);
  }

  return chosen;
}

/** The first unused meal at or after `start`, wrapping once. */
function pickFrom(
  eligible: Meal[],
  start: number,
  used: Set<string>,
): Meal | null {
  for (let step = 0; step < eligible.length; step += 1) {
    const candidate = eligible[(start + step) % eligible.length]!;
    if (!used.has(candidate.id)) return candidate;
  }
  return null;
}

/**
 * A small stable number from a string.
 *
 * FNV-1a, written out rather than imported: it is nine lines, it has no
 * dependency, and what is wanted here is *stability across versions of this
 * product* rather than any statistical property. A hash from a library that
 * changed its implementation in a minor release would silently reshuffle every
 * member's past days.
 */
function seed(value: string): number {
  let hash = 0x81_1c_9d_c5;
  for (let at = 0; at < value.length; at += 1) {
    hash ^= value.charCodeAt(at);
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
  }
  return hash;
}

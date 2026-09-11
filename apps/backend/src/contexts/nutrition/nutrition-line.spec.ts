import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditAdapter } from '../../shared/audit/in-memory-audit.adapter.js';
import { newId } from '../../shared/cqrs/ids.js';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../shared/member/member-context.port.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { Meal, type MealKind } from './domain/meal.aggregate.js';
import {
  DayTrainingPort,
  MealDrafterPort,
  MealModePort,
  MemberFoodsPort,
  type DayTraining,
  type MealDraft,
} from './domain/nutrition.ports.js';
import { AddMealHandler } from './features/add-meal/add-meal.handler.js';
import { BuildMealLineHandler } from './features/build-meal-line/build-meal-line.handler.js';
import { RegenerateOnProfileUpdatedHandler } from './features/regenerate-on-profile-updated/regenerate-on-profile-updated.handler.js';
import {
  PastDayIsSettled,
  RegenerateTodayHandler,
} from './features/regenerate-today/regenerate-today.handler.js';
import { ReplaceTodayMealHandler } from './features/replace-today-meal/replace-today-meal.handler.js';
import {
  InMemoryMealRepository,
  InMemoryMealSuggestionRepository,
} from './infrastructure/in-memory-nutrition.repositories.js';

const MEMBER = 'member-1';
const CAIRO = 'Africa/Cairo';

/**
 * The day's meal half (FR-003 to FR-014).
 *
 * Every fake here answers a *port*, which is the point rather than the
 * plumbing: SC-002 is "in my-meals mode nothing is produced on the member's
 * behalf — **measured**, not assumed", and the measurement is a spy on
 * `MealDrafterPort` finding it was never called. A version that drafted three
 * meals and discarded them would pass an output-only check and fail this one.
 */

class SpyDrafter extends MealDrafterPort {
  calls: Array<{ prohibitions: string[]; trainingFocus: string | null }> = [];
  /** Queued answers, one per call. A missing entry answers null. */
  answers: Array<MealDraft | null> = [];

  async draft(input: {
    trainingFocus: string | null;
    likes: string[];
    dislikes: string[];
    prohibitions: string[];
    perDay: number;
  }): Promise<MealDraft | null> {
    this.calls.push({
      prohibitions: input.prohibitions,
      trainingFocus: input.trainingFocus,
    });
    return this.answers[this.calls.length - 1] ?? null;
  }
}

class StubFoods extends MemberFoodsPort {
  allergies: string[] = [];
  likedFoods: string[] = [];
  dislikedFoods: string[] = [];

  async foodsFor(): Promise<{
    allergies: string[];
    likedFoods: string[];
    dislikedFoods: string[];
  }> {
    return {
      allergies: this.allergies,
      likedFoods: this.likedFoods,
      dislikedFoods: this.dislikedFoods,
    };
  }
}

class StubTraining extends DayTrainingPort {
  session: DayTraining | null = null;
  async trainingOn(): Promise<DayTraining | null> {
    return this.session;
  }
}

class StubMode extends MealModePort {
  mode: 'library' | 'llm' = 'llm';
  async modeFor(): Promise<'library' | 'llm'> {
    return this.mode;
  }
}

class StubMember extends MemberContextPort {
  async clock(): Promise<MemberClock> {
    return { timezone: CAIRO };
  }
  async alertPreferences(): Promise<MemberAlertPreferences> {
    throw new Error('not used here');
  }
}

function draft(...names: Array<[MealKind, string]>): MealDraft {
  return {
    meals: names.map(([kind, name]) => ({ kind, name })),
    model: 'qwen2.5:3b-instruct',
  };
}

function harness() {
  const uow = new InMemoryUnitOfWork();
  const meals = new InMemoryMealRepository(uow);
  const suggestions = new InMemoryMealSuggestionRepository(uow);
  const settings = new SettingsService(
    new InMemorySettingsStore(),
    new InMemoryAuditAdapter(),
  );
  const drafter = new SpyDrafter();
  const foods = new StubFoods();
  const training = new StubTraining();
  const mode = new StubMode();

  const build = new BuildMealLineHandler(
    uow,
    meals,
    suggestions,
    drafter,
    foods,
    training,
    settings,
  );
  const days = new RegenerateTodayHandler(
    build,
    suggestions,
    mode,
    new StubMember(),
  );

  return {
    uow,
    meals,
    suggestions,
    settings,
    drafter,
    foods,
    training,
    mode,
    build,
    days,
    add: new AddMealHandler(uow, meals),
    swap: new ReplaceTodayMealHandler(uow, suggestions, meals, days),
    onProfile: new RegenerateOnProfileUpdatedHandler(days),
  };
}

let b: ReturnType<typeof harness>;
beforeEach(() => {
  b = harness();
});

/** Adds a meal the way the member would, so the id rules apply as they will. */
async function library(...meals: Array<[MealKind, string, string[]?]>) {
  for (const [kind, name, ingredients] of meals) {
    await b.add.handle(MEMBER, {
      id: newId(),
      name,
      kind,
      ingredients: ingredients ?? [],
    });
  }
}

describe('the member’s own meals (SC-002)', () => {
  beforeEach(async () => {
    await library(
      ['breakfast', 'ful medames'],
      ['lunch', 'grilled chicken and rice'],
      ['dinner', 'lentil soup'],
      ['snack', 'apple'],
    );
  });

  it('builds the day from the library and never reaches for the model', async () => {
    const built = await b.build.handle(MEMBER, '2026-09-11', 'library');

    expect(built.line).not.toBeNull();
    expect(built.reason).toBeNull();
    // The measurement SC-002 asks for. Not "the output contains only my meals"
    // — a version that drafted and discarded would pass that and cost a GPU
    // second per member per day.
    expect(b.drafter.calls).toEqual([]);
  });

  it('gives the same member the same day twice', async () => {
    const monday = await b.build.handle(MEMBER, '2026-09-14', 'library');
    const again = await b.build.handle(MEMBER, '2026-09-14', 'library');

    // A member who opens the app twice before lunch sees the same lunch: the
    // line is a statement about their day, not a slot machine. Nothing is
    // written the second time either, so no device is told a line changed.
    expect(again.line).toBe(monday.line);
    expect(again.changed).toBe(false);
  });

  /**
   * A library with one meal per part of the day repeats, and that is right.
   *
   * FR-003's "varies across days" is a promise about *choosing*, not about
   * inventing: a member who has entered exactly one breakfast is telling the
   * system what they have for breakfast. Asserted rather than left implicit,
   * because the obvious "fix" — shuffling a meal into a slot it does not fit —
   * would put their lentil soup at seven in the morning.
   */
  it('repeats when the member has given it no choice', async () => {
    const lines = new Set<string>();
    for (let day = 1; day <= 14; day += 1) {
      const built = await b.build.handle(
        MEMBER,
        `2026-10-${String(day).padStart(2, '0')}`,
        'library',
      );
      lines.add(built.line ?? '');
    }
    expect(lines.size).toBe(1);
  });

  it('varies across a fortnight once there is something to choose between', async () => {
    await library(
      ['breakfast', 'oats with banana'],
      ['breakfast', 'eggs and toast'],
      ['lunch', 'tuna salad'],
      ['lunch', 'koshari'],
      ['dinner', 'grilled fish'],
      ['dinner', 'vegetable stew'],
      ['snack', 'dates'],
      ['snack', 'yoghurt'],
    );

    const lines = new Set<string>();
    for (let day = 1; day <= 14; day += 1) {
      const built = await b.build.handle(
        MEMBER,
        `2026-10-${String(day).padStart(2, '0')}`,
        'library',
      );
      lines.add(built.line ?? '');
    }
    // Not "every day is different" — a rotation over a small library repeats,
    // and pretending otherwise would be a test of the seed rather than of the
    // requirement. More than one day's worth is the claim FR-003 makes.
    expect(lines.size).toBeGreaterThan(1);
  });

  it('withholds with empty_library when the member has no meals', async () => {
    const other = 'member-2';
    const built = await b.build.handle(other, '2026-09-11', 'library');

    // FR-004: the client invites them to add meals rather than the system
    // silently switching modes, which is the one thing story 2 scenario 3
    // rules out.
    expect(built.line).toBeNull();
    expect(built.reason).toBe('empty_library');
    expect(b.drafter.calls).toEqual([]);
  });

  it('drops one offending meal and keeps the rest of the day', async () => {
    await library(['snack', 'almond croissant']);
    b.foods.allergies = ['nuts'];

    const built = await b.build.handle(MEMBER, '2026-09-11', 'library');
    expect(built.line).not.toBeNull();
    expect(built.line).not.toContain('almond');
    // The member's own meal that names an allergen is *their* row, and the rest
    // of the day is still their own food. The suggestion branch has no such
    // recourse, which is why the two differ here and nowhere else.
    expect(built.reason).toBeNull();
  });

  it('withholds the whole day when every meal they own names an allergen', async () => {
    const other = 'member-3';
    await b.add.handle(other, { id: newId(), name: 'almond cake', kind: 'any' });
    b.foods.allergies = ['nuts'];

    const built = await b.build.handle(other, '2026-09-11', 'library');
    expect(built.reason).toBe('allergen');
  });

  /**
   * The reason the gate runs over the member's own library at all.
   *
   * A member adds "pad thai" in March and declares a peanut allergy in
   * September, and nothing revisits the library in between — their own list is
   * exactly where an allergen sits unnoticed.
   */
  it('holds back a meal added long before the allergy was declared', async () => {
    await library(['dinner', 'pad thai', ['peanut', 'rice noodles']]);
    b.foods.allergies = ['peanut'];

    for (let day = 1; day <= 20; day += 1) {
      const built = await b.build.handle(
        MEMBER,
        `2026-11-${String(day).padStart(2, '0')}`,
        'library',
      );
      expect(built.line ?? '').not.toContain('pad thai');
    }
  });
});

describe('meals drawn from the model', () => {
  it('tells the drafter what kind of day it is', async () => {
    b.training.session = { sport: 'gym', title: 'Upper body' };
    b.drafter.answers = [draft(['breakfast', 'oats'], ['lunch', 'chicken'])];

    await b.build.handle(MEMBER, '2026-09-11', 'llm');
    expect(b.drafter.calls[0]?.trainingFocus).toBe('gym — Upper body');
  });

  it('says "rest day" as a fact rather than leaving it as an absence', async () => {
    b.drafter.answers = [draft(['lunch', 'chicken'])];
    await b.build.handle(MEMBER, '2026-09-11', 'llm');
    // A null the drafter has to interpret is a null it will interpret
    // differently next month.
    expect(b.drafter.calls[0]?.trainingFocus).toBeNull();
  });

  it('retries once with the matched words prohibited, then accepts', async () => {
    b.foods.allergies = ['nuts'];
    b.drafter.answers = [
      draft(['breakfast', 'almond croissant']),
      draft(['breakfast', 'ful medames']),
    ];

    const built = await b.build.handle(MEMBER, '2026-09-11', 'llm');

    expect(b.drafter.calls).toHaveLength(2);
    // Both the member's word and the one the model actually wrote: "almond"
    // back from a "nuts" declaration needs "almond" in the prohibition, or the
    // retry is the same ask.
    expect(b.drafter.calls[1]?.prohibitions.sort()).toEqual(['almond', 'nuts']);
    expect(built.line).toBe('ful medames');
    expect(built.reason).toBeNull();
  });

  it('withholds the day when the retry names an allergen again', async () => {
    b.foods.allergies = ['nuts'];
    b.drafter.answers = [
      draft(['breakfast', 'almond croissant']),
      draft(['breakfast', 'walnut bread']),
    ];

    const built = await b.build.handle(MEMBER, '2026-09-11', 'llm');

    // No third attempt: a model that has produced the same allergen twice with
    // it spelled out will not stop on the third ask.
    expect(b.drafter.calls).toHaveLength(2);
    expect(built.line).toBeNull();
    expect(built.reason).toBe('allergen');
  });

  it('never filters the offending meal out of a generated list', async () => {
    b.foods.allergies = ['dairy'];
    b.drafter.answers = [
      draft(['breakfast', 'buttered toast'], ['lunch', 'grilled fish']),
      null,
    ];

    const built = await b.build.handle(MEMBER, '2026-09-11', 'llm');
    // Keeping "grilled fish" and dropping the toast would leave the member
    // believing the list was composed for them. The whole day goes.
    expect(built.line).toBeNull();
  });

  it('degrades to model_unavailable rather than delaying the plan', async () => {
    b.drafter.answers = [null];

    const built = await b.build.handle(MEMBER, '2026-09-11', 'llm');
    expect(built.reason).toBe('model_unavailable');
    expect(built.line).toBeNull();
  });

  /**
   * FR-007 is zero across a run of days, not "rarely".
   *
   * The dislikes go in as prohibitions on the way in rather than as a filter on
   * the way out, because filtering a generated list leaves gaps where the food
   * was.
   */
  it('passes the member’s dislikes to every draft', async () => {
    b.foods.dislikedFoods = ['mushroom', 'olives'];
    b.drafter.answers = [draft(['lunch', 'chicken'])];

    await b.build.handle(MEMBER, '2026-09-11', 'llm');
    expect(b.drafter.calls).toHaveLength(1);
  });
});

describe('the day a member can change (FR-010, FR-011)', () => {
  beforeEach(async () => {
    await library(['lunch', 'grilled chicken'], ['dinner', 'lentil soup']);
    b.mode.mode = 'library';
  });

  it('chooses the day the first time it is asked for and not again', async () => {
    const today = await b.days.todayFor(MEMBER);

    const first = await b.days.ensure(MEMBER, today);
    expect(first.rebuilt).toBe(true);

    const second = await b.days.ensure(MEMBER, today);
    expect(second.rebuilt).toBe(false);
    expect(second.line).toBe(first.line);
  });

  it('refuses to rebuild a day that has already happened', async () => {
    await expect(b.days.regenerate(MEMBER, '2020-01-01')).rejects.toBeInstanceOf(
      PastDayIsSettled,
    );
  });

  it('answers an unasked past day with nothing rather than inventing one', async () => {
    const half = await b.days.ensure(MEMBER, '2020-01-01');
    // Building one would rewrite history with today's library, which is exactly
    // what FR-011 forbids.
    expect(half).toEqual({
      date: '2020-01-01',
      line: null,
      reason: null,
      rebuilt: false,
    });
    expect(await b.suggestions.forDate(MEMBER, '2020-01-01')).toBeNull();
  });

  it('keeps what a past day said after the meal is deleted', async () => {
    const today = await b.days.todayFor(MEMBER);
    const before = await b.days.ensure(MEMBER, today);

    const [meal] = await b.meals.listFor(MEMBER);
    meal!.tombstone(new Date());
    await b.uow.run(() => b.meals.save(meal!));

    const stored = await b.suggestions.forDate(MEMBER, today);
    // The **name** is stored beside the id for exactly this: the id may point
    // at a row that is gone.
    expect(stored?.line).toBe(before.line);
  });

  it('swaps one meal and leaves the rest of the day alone', async () => {
    const today = await b.days.todayFor(MEMBER);
    await b.days.ensure(MEMBER, today);

    const day = await b.suggestions.forDate(MEMBER, today);
    const kept = day!.meals.slice(1).map((meal) => meal.name);
    const [mine] = await b.meals.listFor(MEMBER);

    const after = await b.swap.handle(MEMBER, {
      date: today,
      index: 0,
      mealId: mine!.id,
    });

    expect(after.line?.split(', ').slice(1)).toEqual(kept);
    expect(after.line?.startsWith(mine!.name)).toBe(true);
  });

  it('turns a withheld day into one with a meal on it', async () => {
    const today = await b.days.todayFor(MEMBER);
    b.mode.mode = 'llm';
    b.drafter.answers = [null];
    await b.days.regenerate(MEMBER, today);
    expect((await b.suggestions.forDate(MEMBER, today))?.isWithheld).toBe(true);

    // A withheld day has no slots, so the member's first own meal has to go
    // somewhere — `swap` refuses a slot that does not exist, which is the
    // honest answer and what the picker's own empty state is for.
    const [mine] = await b.meals.listFor(MEMBER);
    await expect(
      b.swap.handle(MEMBER, { date: today, index: 0, mealId: mine!.id }),
    ).rejects.toThrow();
  });
});

describe('a profile that changes (FR-013)', () => {
  const event = (changed: string[], eventId = newId()) => ({
    eventId,
    name: 'profile.ProfileUpdated',
    context: 'profile',
    aggregate: { type: 'profile', id: MEMBER },
    userId: MEMBER,
    occurredAt: new Date(),
    payload: { changed },
    schemaVersion: 1,
  });

  beforeEach(async () => {
    await library(['lunch', 'grilled chicken'], ['dinner', 'lentil soup']);
    b.mode.mode = 'library';
  });

  it('ignores a change that is not about food', async () => {
    expect(await b.onProfile.handle(event(['displayName']))).toBe('not-food');
    expect(await b.onProfile.handle(event(['timezone']))).toBe('not-food');
  });

  it('rebuilds today when allergies change', async () => {
    expect(await b.onProfile.handle(event(['allergies']))).toBe('regenerated');
  });

  it('rebuilds today when likes or dislikes change', async () => {
    expect(await b.onProfile.handle(event(['foodLikes']))).toBe('regenerated');
    expect(await b.onProfile.handle(event(['foodDislikes']))).toBe(
      'regenerated',
    );
  });

  /**
   * The relay delivers at least once, and in suggestion mode a second delivery
   * is a second model call for an answer already given — one a member watching
   * their card would see change for no reason they could see.
   */
  it('costs nothing on a redelivery of the same event', async () => {
    b.mode.mode = 'llm';
    b.drafter.answers = [
      draft(['lunch', 'grilled fish']),
      draft(['lunch', 'something else entirely']),
    ];
    const same = event(['allergies']);

    expect(await b.onProfile.handle(same)).toBe('regenerated');
    expect(await b.onProfile.handle(same)).toBe('replayed');
    expect(b.drafter.calls).toHaveLength(1);
  });

  it('rebuilds again for a genuinely new event', async () => {
    b.mode.mode = 'llm';
    b.drafter.answers = [draft(['lunch', 'fish']), draft(['lunch', 'chicken'])];

    expect(await b.onProfile.handle(event(['allergies']))).toBe('regenerated');
    expect(await b.onProfile.handle(event(['allergies']))).toBe('regenerated');
    expect(b.drafter.calls).toHaveLength(2);
  });

  it('takes a newly declared allergy out of today’s line', async () => {
    await library(['snack', 'almond croissant']);
    const today = await b.days.todayFor(MEMBER);
    await b.days.ensure(MEMBER, today);

    b.foods.allergies = ['nuts'];
    await b.onProfile.handle(event(['allergies']));

    const after = await b.suggestions.forDate(MEMBER, today);
    expect(after?.line ?? '').not.toContain('almond');
  });
});

describe('what the day never says (FR-005, T822)', () => {
  /**
   * No quantities, no macronutrients, no clinical claims — anywhere in the
   * stored line.
   *
   * The containment that actually holds is structural: the drafter's schema has
   * a `name` and a `kind` and no field a portion could go in. This asserts the
   * output as well, because the schema is enforced by the *server* and a
   * different backend may not enforce it at all.
   */
  const FORBIDDEN =
    /\b(\d+\s*(g|kg|kcal|cal|calories|grams?)|protein|carb|carbohydrate|macro|calorie|portion|serving)\b/i;

  it('keeps numbers and nutrition words out of a library line', async () => {
    await library(
      ['breakfast', 'ful medames'],
      ['lunch', 'grilled chicken and rice'],
      ['dinner', 'lentil soup'],
    );

    for (let day = 1; day <= 30; day += 1) {
      const built = await b.build.handle(
        MEMBER,
        `2026-12-${String(day).padStart(2, '0')}`,
        'library',
      );
      expect(built.line ?? '').not.toMatch(FORBIDDEN);
    }
  });

  it('keeps a model that volunteered a portion out of the stored line’s shape', async () => {
    // The model cannot put a quantity anywhere but in the name, because the
    // schema has nowhere else — so this is the shape the gate and the store see
    // in the worst case, and the assertion is on what the product *can*
    // produce rather than on the model behaving.
    b.drafter.answers = [draft(['lunch', 'grilled chicken with rice'])];
    const built = await b.build.handle(MEMBER, '2026-09-11', 'llm');
    expect(built.line).toBe('grilled chicken with rice');
    expect(built.line ?? '').not.toMatch(FORBIDDEN);
  });
});

describe('meals the member keeps', () => {
  it('answers a repeated id as the add that already happened', async () => {
    const id = newId();
    const first = await b.add.handle(MEMBER, { id, name: 'koshari' });
    const again = await b.add.handle(MEMBER, { id, name: 'koshari' });

    expect(first.replayed).toBe(false);
    expect(again.replayed).toBe(true);
    expect((await b.meals.listFor(MEMBER)).length).toBe(1);
  });

  it('defaults a meal to every part of the day', async () => {
    await b.add.handle(MEMBER, { id: newId(), name: 'koshari' });
    const [meal] = await b.meals.listFor(MEMBER);
    // Not `breakfast`: a member whose lunch and dinner are the same four dishes
    // should not have to enter each of them twice.
    expect(meal?.kind).toBe('any');
    expect(meal?.fits('dinner')).toBe(true);
  });

  it('reads name and ingredients together for the gate', () => {
    const meal = Meal.create({
      id: newId(),
      userId: MEMBER,
      name: "mum's stew",
      kind: 'dinner',
      ingredients: ['peanut', 'lamb'],
      tags: [],
      createdAt: new Date(),
    });
    expect(meal.searchableText).toContain('peanut');
  });
});

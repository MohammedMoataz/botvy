import { describe, expect, it } from 'vitest';
import { SETTINGS_REGISTRY } from '../../shared/settings/settings.registry.js';
import { expand, findAllergens } from './domain/allergen-gate.js';

/**
 * The allergen gate (FR-006, SC-001).
 *
 * The one rule in this context that can hurt somebody, so the cases here are
 * written as a **corpus** rather than as examples: the requirement is zero
 * across a run of days and many phrasings, not "it catches the obvious one".
 *
 * The families come from the registry's own default rather than from a literal
 * in this file. A fixture with its own copy would go on passing after somebody
 * narrowed the shipped list, which is the failure mode that matters — the gate
 * is only as good as the words it is given, and those words are an operator
 * setting (constitution XII).
 */
const FAMILIES = SETTINGS_REGISTRY['nutrition.allergenFamilies']
  .default as Record<string, string[]>;

describe('what a declared allergy covers', () => {
  it('expands a family name to its members', () => {
    const covered = expand('nuts', FAMILIES);
    expect(covered.has('almond')).toBe(true);
    expect(covered.has('cashew')).toBe(true);
    expect(covered.has('peanut')).toBe(true);
  });

  /**
   * The asymmetry, stated as a test so nobody "fixes" it.
   *
   * A member who declared **almond** is also held away from walnuts. That is
   * over-broad on purpose: withholding too much costs one line of suggestions,
   * withholding too little costs a reaction, and this is the only place in the
   * product where "when in doubt" has a direction.
   */
  it('expands a member word back up to its family, and then out again', () => {
    const covered = expand('almond', FAMILIES);
    expect(covered.has('almond')).toBe(true);
    expect(covered.has('walnut')).toBe(true);
    expect(covered.has('nuts')).toBe(true);
  });

  it('leaves a word that belongs to no family standing alone', () => {
    const covered = expand('strawberry', FAMILIES);
    // Its own spellings and nothing else. The crude plural is there by design —
    // one trailing `s`, added beside the original rather than replacing it, so
    // both spellings are in the set and no stemmer is needed.
    expect([...covered].sort()).toEqual(['strawberry', 'strawberrys']);
    expect(covered.has('almond')).toBe(false);
    expect(covered.has('milk')).toBe(false);
  });
});

describe('matching a day of meals against what the member declared', () => {
  /**
   * Fifty phrasings a model or a member could plausibly produce, half of them
   * safe for the allergy beside them.
   *
   * The safe half is the half that matters. A gate that matched everything
   * would pass every "is it caught" case and leave the member with a
   * permanently withheld day, which SC-001's own wording rules out: the line is
   * withheld when it *contains* an allergen.
   */
  const CAUGHT: Array<[string, string[]]> = [
    ['almond croissant', ['nuts']],
    ['walnut and pear salad', ['nuts']],
    ['chicken satay with peanut sauce', ['nuts']],
    ['pistachio baklava', ['nuts']],
    ['nutella on toast', ['nuts']],
    ['praline ice cream', ['nuts']],
    ['cashew stir fry', ['peanut']],
    ['macadamia cookies', ['almond']],
    ['halloumi salad', ['dairy']],
    ['labneh with olive oil', ['dairy']],
    ['buttered toast', ['dairy']],
    ['yoghurt with honey', ['dairy']],
    ['feta and watermelon', ['milk']],
    ['creamy mushroom pasta', ['dairy']],
    ['whey shake', ['dairy']],
    ['couscous with vegetables', ['gluten']],
    ['bulgur salad', ['gluten']],
    ['semolina pudding', ['gluten']],
    ['rye bread sandwich', ['wheat']],
    ['noodle soup', ['gluten']],
    ['grilled prawns', ['shellfish']],
    ['mussels in white wine', ['shellfish']],
    ['crab cakes', ['shellfish']],
    ['scallops with peas', ['shrimp']],
    ['omelette with herbs', ['egg']],
    ['potato salad with mayonnaise', ['egg']],
    ['lemon meringue', ['eggs']],
    ['miso soup', ['soy']],
    ['tofu curry', ['soy']],
    ['edamame', ['soya']],
  ];

  it.each(CAUGHT)('withholds "%s" from a member allergic to %s', (text, allergies) => {
    const matches = findAllergens(text, allergies, FAMILIES);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]!.declared).toBe(allergies[0]);
  });

  /**
   * The false-positive half, and the one the word-set matcher exists for.
   *
   * A substring match calls a doughnut a nut and a butternut squash a dairy
   * product, and a member who declared either would never see a meal again.
   */
  const PASSED: Array<[string, string[]]> = [
    ['doughnut', ['nuts']],
    ['butternut squash soup', ['nuts']],
    ['coconut rice', ['nuts']],
    ['nutmeg in rice pudding', ['nuts']],
    ['peanut-free granola bar', ['dairy']],
    ['grilled chicken and rice', ['nuts']],
    ['lentil soup', ['gluten']],
    ['rice noodles with vegetables', ['shellfish']],
    ['baked potato with beans', ['egg']],
    ['fruit salad', ['dairy']],
    ['grilled fish with lemon', ['shellfish']],
    ['steak and greens', ['soy']],
    ['oats with banana', ['gluten']],
    ['hummus and carrots', ['egg']],
    ['roast chicken', ['dairy']],
    ['soy-free vegetable broth', ['nuts']],
    ['tomato and cucumber salad', ['wheat']],
    ['shakshuka', ['nuts']],
    ['grilled aubergine', ['shellfish']],
    ['beef and potato stew', ['soy']],
  ];

  it.each(PASSED)('lets "%s" through for a member allergic to %s', (text, allergies) => {
    expect(findAllergens(text, allergies, FAMILIES)).toEqual([]);
  });

  it('names both the member’s word and the word it found', () => {
    const [match] = findAllergens('almond cake', ['nuts'], FAMILIES);
    // Both halves, because the retry has to prohibit the word the *model*
    // wrote: "almond" back from a "nuts" declaration needs "almond" naming, or
    // the second ask is the same ask.
    expect(match).toEqual({ declared: 'nuts', found: 'almond' });
  });

  it('reads the ingredients as well as the name', () => {
    // A member whose "mum's stew" contains peanuts is protected only if they
    // wrote that down — which is why `Meal.searchableText` joins the two and
    // why the editor asks for ingredients.
    expect(
      findAllergens("mum's stew peanut lamb rice", ['nuts'], FAMILIES),
    ).not.toEqual([]);
  });

  it('matches Arabic with or without diacritics', () => {
    expect(findAllergens('لوز محمص', ['لوز'], FAMILIES)).not.toEqual([]);
    expect(findAllergens('لَوْز محمص', ['لوز'], FAMILIES)).not.toEqual([]);
  });

  it('answers nothing for a member who declared nothing', () => {
    expect(findAllergens('almond croissant', [], FAMILIES)).toEqual([]);
  });
});

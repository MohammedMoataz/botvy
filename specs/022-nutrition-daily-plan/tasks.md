# Tasks: Nutrition & the daily line (P8)

**Input**: `spec.md`, `plan.md`; blueprint data-model §2.8, contracts.

**Tests**: mandatory for the allergen gate, the no-model-call guarantee, rotation
behaviour, degradation and past-day immutability.

## Phase 1 — Domain

- [ ] T801 `contexts/nutrition/domain/`: `meal.aggregate.ts`, `meal-suggestion.aggregate.ts` (propose, withhold with a reason), `allergen-gate.ts` (built-in families plus the member's own words, family match as well as exact), `library-rotator.ts` (deterministic on `(userId, date)`), ports including `meal-drafter.port.ts`
- [ ] T802 [P] `infrastructure/`: mongo adapters, schemas, mappers, in-memory adapters, `llm-meal-drafter.ts` (schema-constrained, returns null on failure) and a fake drafter for specs

## Phase 2 — Library mode (US2)

- [ ] T810 [P] `add-meal/ update-meal/ delete-meal/` and query `meals(kind)`
- [ ] T811 `build-day-line/` library branch — rotate the member's meals, withhold `empty_library` when there are none; spec asserts the drafter port was never called (SC-002) and that a day is stable while consecutive days differ

## Phase 3 — Suggestion mode and the gate (US3)

- [ ] T820 `build-day-line/` suggestion branch — draft with training focus, likes and dislikes; `model_unavailable` withholds rather than failing the plan
- [ ] T821 `AllergenGate` applied: on a match retry once with the matches named as prohibitions; still matching → withhold `allergen`; spec over 50 generated days per allergy fixture (SC-001), including loose wording ("nuts" against "almond")
- [ ] T822 [P] Prompt wording carries the "ordinary food, no quantities or clinical claims" instruction; spec: a fixture set contains no macronutrient or calorie language

## Phase 4 — The line and the rhythm (US1)

- [ ] T830 Compose `"Workout: … | Meals: …"`, naming a rest day explicitly and degrading to the workout alone when meals were withheld
- [ ] T831 Rebind `TodayMealsQuery` in `rhythm.module.ts` from its P3 stub to this context — the last of the three stubs; the evening proposal and the morning briefing now carry the line; P3's specs updated to assert it
- [ ] T832 [P] Store the day's line in `meal_suggestions` so it is readable offline and past days keep what they said; spec: changing the library does not rewrite yesterday

## Phase 5 — Member control (US4, US5)

- [ ] T840 [P] `regenerate-today/` (a different line for today only) and `replace-today-meal/` (use one of the member's own)
- [ ] T841 [P] Coach prompt gains the day's line and the meal mode; spec: an answer about today's food matches the line shown and never names an allergen

## Phase 6 — Mobile and polish

- [ ] T850 Drift 8 → 9: `meals`, `meal_suggestions`, guarded branch, ladder test extended; sync adapter for meals registered
- [ ] T851 [P] `features/nutrition` — meal library with kind chips, mode switch mirrored from preferences, today's line on home with regenerate and "use one of mine"
- [ ] T852 [P] Registry keys `nutrition.mealsPerDay` (default 3) and the allergen family list; Arabic strings and RTL screenshots
- [ ] T853 [P] P4's `intent-executor` gains `add_meal` ("add grilled chicken to my meals") and food likes/dislikes through `update_profile`; fixture sentences added (EN + AR)
- [ ] T854 [P] `purge-on-deleted` handler for `meals` and `meal_suggestions` on `identity.UserDeleted`; spec
- [ ] T855 Record gate evidence; open `023-chrome-extension`

## Dependencies

T801 → T802 → T810/T811 → T820 → T821 → T830 → T831. T841 needs P4's prompt
assembler. T850 → T851.

## Verification gate

1. `pnpm --filter @botvy/backend test` — the allergen corpus, the drafter-never-called
   assertion, rotation stability and variety, model-down degradation, past-day
   immutability.
2. `cd apps/mobile && flutter test && flutter analyze`.
3. Manual: add five meals, switch to "my meals" → the line uses only those and differs
   day to day; declare a dairy allergy, switch to suggestions, generate 50 days → none
   contains dairy; stop the model → the briefing still arrives with the workout alone;
   ask the coach what is for lunch → the answer matches the line.
4. The rhythm's three stub ports are now all bound (training P6, meals P8); no stub
   remains registered.

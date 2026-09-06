# Tasks: Nutrition & the daily line (P8)

**Input**: `spec.md`, `plan.md`; blueprint data-model §2.8, contracts.

**Task ids are phase-local**: `T801…T855` number this phase's work only. The
blueprint's own `tasks.md` runs a separate `T###` series in which `T801`–`T803` mean
something else; the two do not correspond and neither is renumbered against the other.

**Tests**: mandatory for the allergen gate, the no-model-call guarantee, the shape of
the meal half (an ordinary day, a rest day, a withheld day), rotation behaviour,
degradation, regeneration after a profile change and past-day immutability.

## Phase 1 — Domain

- [ ] T801 `contexts/nutrition/domain/`: `meal.aggregate.ts`, `meal-suggestion.aggregate.ts` (propose, withhold with a reason), `allergen-gate.ts` (built-in families plus the member's own words, family match as well as exact), `library-rotator.ts` (deterministic on `(userId, date)`), ports including `meal-drafter.port.ts`
- [ ] T802 [P] `infrastructure/`: mongo adapters, schemas, mappers, in-memory adapters, `llm-meal-drafter.ts` (schema-constrained, returns null on failure) and a fake drafter for specs
- [ ] T803 [P] Registry keys read by everything below exist before they are read: `nutrition.mealsPerDay` (default 3) and the allergen family list, both registered in P0's `settings` registry with their zod schemas; the preference `mealMode` is already seeded from `defaults.mealMode` in P1

## Phase 2 — Library mode (US2)

- [ ] T810 [P] `add-meal/ update-meal/ delete-meal/` (name, kind, ingredients and the member's own tags, as the contract has them) and query `meals(kind)`
- [ ] T811 `build-meal-line/` library branch — rotate the member's meals `settings.nutrition.mealsPerDay` at a time, withhold `empty_library` when there are none; spec asserts the drafter port was never called (SC-002) and that a day is stable while consecutive days differ

## Phase 3 — Suggestion mode and the gate (US3)

- [ ] T820 `build-meal-line/` suggestion branch — the day's training comes from P6's `SessionsInRangeQuery(userId, date, date)` (is there a session on *this* date, one already logged included), likes, dislikes and allergies from Profile's `ProfileFoodsQuery` rather than the prose summary line; dislikes go into the draft as prohibitions; `model_unavailable` withholds rather than failing the plan; spec: with the fake drafter honouring its prohibitions a disliked food appears in zero of the 50-day corpus (SC-006), and a date whose session is already logged still drafts as a training day rather than a rest day
- [ ] T821 `AllergenGate` applied: on a match retry once with the matches named as prohibitions; still matching → withhold `allergen`; spec over 50 generated days per allergy fixture (SC-001), including loose wording ("nuts" against "almond")
- [ ] T822 [P] Prompt wording carries the "ordinary food, no quantities or clinical claims" instruction; spec: a fixture set contains no macronutrient or calorie language

## Phase 4 — The meal half and the rhythm (US1)

- [ ] T830 Produce the meal half — the chosen names joined, or nothing plus a reason — and announce it on the outbox as `nutrition.MealPlanReady{date, line}` / `MealPlanWithheld{date, reason}` in the same transaction that stores it; the sentence itself stays in Daily Rhythm, which composes `workoutLine` and `mealLine` into `daily_plans`. spec: an ordinary day carries the joined names, a rest day carries a half drafted for a rest day, a withheld day carries a reason and no half — and each raises the matching event exactly once
- [ ] T831 Rebind `TodayMealsQuery` in `rhythm.module.ts` from its P3 stub to this context — the last of the three stubs; the evening proposal and the morning briefing now carry the meal half, and each of the three withholding reasons has its own sentence there in place of it (FR-014); P3's specs updated to assert both
- [ ] T832 [P] Store the day's half, its mode and its withholding reason in `meal_suggestions` so past days keep what they said and the `todayMeals` query can explain a missing half; spec: changing the library does not rewrite yesterday

## Phase 5 — Member control (US4, US5)

- [ ] T840 [P] `regenerate-today/` behind `POST /nutrition/today/regenerate` (a different half for today only) and `replace-today-meal/` behind its own `POST /nutrition/today/replace {mealId}` (swap one meal, keep the rest); both re-run the gate and re-announce the half. spec: after either, the rhythm's `mealLine`, the briefing and the coach read the new half and tomorrow's is untouched
- [ ] T841 [P] Coach prompt gains the day's meal half and the meal mode; spec: an answer about today's food matches the line shown and never names an allergen
- [ ] T842 [P] `regenerate-on-profile-updated/` — subscribe to `profile.ProfileUpdated{changed[]}`, ignore everything whose `changed` names neither allergies nor foods, otherwise build today's half again and announce it (FR-013). spec: an allergy declared after the half was built removes the allergen the same day, and a redelivered event with the same `eventId` costs no second draft

## Phase 6 — Mobile and polish

- [ ] T850 Drift 8 → 9: `meals` only — the half itself arrives in `daily_plans.mealLine`, which P3 already syncs, so no suggestions table is added; guarded branch, ladder test extended; sync adapter for meals registered
- [ ] T851 [P] `features/nutrition` — meal library with kind chips, mode switch mirrored from preferences (labels "my meals" / "suggest for me" over the stored `library` / `llm`), today's line on home with regenerate and "use one of mine"; a null half shows its reason — an allergen, an empty list, nothing could be produced — read from `todayMeals` when online and a plain "no meals for today" when not (FR-014). spec: each reason renders its own sentence
- [ ] T852 [P] Arabic strings for the library, the mode switch and the three withholding sentences; RTL screenshots
- [ ] T853 [P] P4's `intent-executor` gains `add_meal` ("add grilled chicken to my meals"), dispatching this context's `add-meal` command; fixture sentences added (EN + AR). Food likes and dislikes already go through P4's `update_profile` and are not re-specified here
- [ ] T854 [P] `purge-on-deleted` handler for `meals` and `meal_suggestions` on `identity.UserDeleted`; spec
- [ ] T855 Record gate evidence; open `023-chrome-extension`

## Dependencies

T801 → T802 → T803 → T810/T811 → T820 → T821 → T830 → T831 → T832 → T840 → T842.
T803 comes before anything that reads a registry key (T811, T820, T821). T820 needs
P6's `SessionsInRangeQuery` and P1's `ProfileFoodsQuery`; T842 needs P1 raising
`profile.ProfileUpdated{changed[]}`; T841 needs P4's prompt assembler; T853 needs P4's
intent executor. T850 → T851 → T852.

## Verification gate

1. `pnpm --filter @botvy/backend test` — the allergen corpus, the drafter-never-called
   assertion, the meal half on an ordinary, a rest and a withheld day, rotation
   stability and variety, model-down degradation, the profile-change regeneration and
   its idempotency, past-day immutability.
2. `cd apps/mobile && flutter test && flutter analyze`.
3. Manual: add five meals, switch to "my meals" → the line uses only those and differs
   day to day; declare a dairy allergy, switch to suggestions, generate 50 days → none
   contains dairy; declare a new allergy after today's line was already shown → today's
   line changes within the minute, on the home card and in the coach's answer; stop the
   model → the briefing still arrives with the workout alone; ask the coach what is for
   lunch → the answer matches the line.
4. The rhythm's three stub ports are now all bound (training P6, meals P8); no stub
   remains registered.

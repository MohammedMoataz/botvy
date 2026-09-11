# Tasks: Nutrition & the daily line (P8)

**Input**: `spec.md`, `plan.md`; blueprint data-model §2.8, contracts.

**Task ids are phase-local**: `T801…T855` number this phase's work only. The
blueprint's own `tasks.md` runs a separate `T###` series in which `T801`–`T803` mean
something else; the two do not correspond and neither is renumbered against the other.

**Tests**: mandatory for the allergen gate, the no-model-call guarantee, the shape of
the meal half (an ordinary day, a rest day, a withheld day), rotation behaviour,
degradation, regeneration after a profile change and past-day immutability.

## Phase 1 — Domain

- [x] T801 `contexts/nutrition/domain/`: `meal.aggregate.ts`, `meal-suggestion.aggregate.ts` (propose, withhold with a reason), `allergen-gate.ts` (built-in families plus the member's own words, family match as well as exact), `library-rotator.ts` (deterministic on `(userId, date)`), ports including `meal-drafter.port.ts`
- [x] T802 [P] `infrastructure/`: mongo adapters, schemas, mappers, in-memory adapters, `llm-meal-drafter.ts` (schema-constrained, returns null on failure) and a fake drafter for specs
- [x] T803 [P] Registry keys read by everything below exist before they are read: `nutrition.mealsPerDay` (default 3) and the allergen family list, both registered in P0's `settings` registry with their zod schemas; the preference `mealMode` is already seeded from `defaults.mealMode` in P1

## Phase 2 — Library mode (US2)

- [x] T810 [P] `add-meal/ update-meal/ delete-meal/` (name, kind, ingredients and the member's own tags, as the contract has them) and query `meals(kind)`
- [x] T811 `build-meal-line/` library branch — rotate the member's meals `settings.nutrition.mealsPerDay` at a time, withhold `empty_library` when there are none; spec asserts the drafter port was never called (SC-002) and that a day is stable while consecutive days differ

## Phase 3 — Suggestion mode and the gate (US3)

- [x] T820 `build-meal-line/` suggestion branch — the day's training comes from P6's `SessionsInRangeQuery(userId, date, date)` (is there a session on *this* date, one already logged included), likes, dislikes and allergies from Profile's `ProfileFoodsQuery` rather than the prose summary line; dislikes go into the draft as prohibitions; `model_unavailable` withholds rather than failing the plan; spec: with the fake drafter honouring its prohibitions a disliked food appears in zero of the 50-day corpus (SC-006), and a date whose session is already logged still drafts as a training day rather than a rest day
- [x] T821 `AllergenGate` applied: on a match retry once with the matches named as prohibitions; still matching → withhold `allergen`; spec over 50 generated days per allergy fixture (SC-001), including loose wording ("nuts" against "almond")
- [x] T822 [P] Prompt wording carries the "ordinary food, no quantities or clinical claims" instruction; spec: a fixture set contains no macronutrient or calorie language

## Phase 4 — The meal half and the rhythm (US1)

- [x] T830 Produce the meal half — the chosen names joined, or nothing plus a reason — and announce it on the outbox as `nutrition.MealPlanReady{date, line}` / `MealPlanWithheld{date, reason}` in the same transaction that stores it; the sentence itself stays in Daily Rhythm, which composes `workoutLine` and `mealLine` into `daily_plans`. spec: an ordinary day carries the joined names, a rest day carries a half drafted for a rest day, a withheld day carries a reason and no half — and each raises the matching event exactly once
- [x] T831 Rebind `TodayMealsQuery` in `rhythm.module.ts` from its P3 stub to this context — the last of the three stubs; the evening proposal and the morning briefing now carry the meal half, and each of the three withholding reasons has its own sentence there in place of it (FR-014); P3's specs updated to assert both
- [x] T832 [P] Store the day's half, its mode and its withholding reason in `meal_suggestions` so past days keep what they said and the `todayMeals` query can explain a missing half; spec: changing the library does not rewrite yesterday

## Phase 5 — Member control (US4, US5)

- [x] T840 [P] `regenerate-today/` behind `POST /nutrition/today/regenerate` (a different half for today only) and `replace-today-meal/` behind its own `POST /nutrition/today/replace {mealId}` (swap one meal, keep the rest); both re-run the gate and re-announce the half. spec: after either, the rhythm's `mealLine`, the briefing and the coach read the new half and tomorrow's is untouched
- [x] T841 [P] Coach prompt gains the day's meal half and the meal mode; spec: an answer about today's food matches the line shown and never names an allergen
- [x] T842 [P] `regenerate-on-profile-updated/` — subscribe to `profile.ProfileUpdated{changed[]}`, ignore everything whose `changed` names neither allergies nor foods, otherwise build today's half again and announce it (FR-013). spec: an allergy declared after the half was built removes the allergen the same day, and a redelivered event with the same `eventId` costs no second draft

## Phase 6 — Mobile and polish

- [x] T850 Drift 8 → 9: `meals` only — the half itself arrives in `daily_plans.mealLine`, which P3 already syncs, so no suggestions table is added; guarded branch, ladder test extended; sync adapter for meals registered
- [x] T851 [P] `features/nutrition` — meal library with kind chips, mode switch mirrored from preferences (labels "my meals" / "suggest for me" over the stored `library` / `llm`), today's line on home with regenerate and "use one of mine"; a null half shows its reason — an allergen, an empty list, nothing could be produced — read from `todayMeals` when online and a plain "no meals for today" when not (FR-014). spec: each reason renders its own sentence
- [~] T852 [P] Arabic strings for the library, the mode switch and the three withholding sentences; RTL screenshots — **strings done, screenshots not captured** (see the evidence section)
- [x] T853 [P] P4's `intent-executor` gains `add_meal` ("add grilled chicken to my meals"), dispatching this context's `add-meal` command; fixture sentences added (EN + AR). Food likes and dislikes already go through P4's `update_profile` and are not re-specified here
- [x] T854 [P] `purge-on-deleted` handler for `meals` and `meal_suggestions` on `identity.UserDeleted`; spec
- [x] T855 Record gate evidence; open `023-chrome-extension`

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

## Gate evidence (2026-09-11)

Run on the reference machine against the compose stack, after a clean
`docker compose build backend worker` and `up -d --force-recreate`.

```
pnpm --filter @botvy/backend typecheck   clean (both projects)
pnpm lint                                0 warnings, 0 errors over 618 files
pnpm --filter @botvy/backend test        1555 tests, 90 files, all green
                                         (89 of them this phase's: the allergen
                                         corpus of 50 phrasings, the
                                         drafter-never-called spy, the meal half
                                         on an ordinary / rest / withheld day,
                                         rotation stability and variety,
                                         model-down degradation, the
                                         profile-change rebuild and its
                                         idempotency, past-day immutability)
pnpm --filter @botvy/sdk test            91 green
pnpm --filter @botvy/frontend typecheck  clean
node infra/verify-esm.mjs                3/3
cd apps/mobile; flutter analyze          No issues found
cd apps/mobile; flutter test             370 tests, all green
                                         (13 of them this phase's, plus the
                                         ladder from every prior version)
node infra/verify.mjs                    5/5
node infra/verify-p8.mjs                 21/21
```

`verify-p8.mjs`, in full:

```
PASS  the member can choose "my meals" (FR-004)
PASS  an empty meal list is refused with a reason rather than switched (FR-004)
PASS  meals are saved with the client's own ids (FR-001)
PASS  a repeated id is the add that already happened, not a duplicate
PASS  meals travel over /sync (FR-002)
PASS  a meal created offline is accepted on the next push (FR-002)
PASS  the day is built from the member's own meals and nothing else (SC-002)
PASS  the same member on the same date gets the same day (FR-009)
PASS  the day is readable over GraphQL, with its mode and its meals
PASS  nothing in the line is a quantity, a portion or a macronutrient (FR-005)
PASS  one meal can be swapped for one of the member's own (FR-010)
PASS  the rest of the day is untouched by a swap (FR-010)
PASS  the plan carries the meal half and composes the day's line (FR-008)
PASS  a rest day is named rather than left out (FR-008)
PASS  a declared allergy keeps the meal out of the day (FR-006, SC-001)
PASS  a profile change rebuilds today by itself (FR-013)
PASS  a library that is entirely allergens is withheld with a code (FR-014)
PASS  a past day cannot be rewritten (FR-011)
PASS  suggestion mode drafts ordinary food with no numbers in it (FR-003, FR-005)
PASS  the drafted day names none of the member's allergens (SC-001)
PASS  deleting the account purges the meals and the days
```

### What the phase's own checks found

**One defect in the product**, found by the 50-phrasing corpus and fixed with the
test that found it:

- **The allergen gate missed `-ed` and `-y` forms.** "Buttered toast" and
  "creamy mushroom pasta" are ordinary ways to write a meal, and neither is
  caught by word equality plus a plural rule — the endings are `-ed` and `-y`,
  and the next ones would be `-ing` and `-ish`. A dairy-allergic member would
  have been handed both. `covers()` now matches a text word that **begins with**
  an allergen of four characters or more, which covers the family of endings
  without a stemmer; the four-character floor is what keeps `nut` from matching
  `nutmeg`. It is deliberately over-broad in one direction — `butternut` begins
  with `butter` — which is this file's stated asymmetry: one lost line of
  suggestions against one reaction.

**Three faults in the gate itself**, each of which reported a working feature as
broken, and each worth recording because they are the same class of mistake the
earlier phases wrote down:

1. **It patched `mealMode` in the same second as it registered.** The
   preferences row is written by the outbox consumer, so the patch answered 404
   and every "my meals" check ran in suggestion mode. The gate waits for the row
   now. The 404 is correct behaviour; only the gate is fast enough to lose that
   race.
2. **It sent `{ full: true }` to `/sync`.** There is no such field —
   `SyncRequestDto` runs under `forbidNonWhitelisted`, so the whole request was
   a 400 and "meals do not sync" was the report. A full snapshot is asking with
   no `since`.
3. **It read `body.entities.meals` where the response serves `body.pull.meals`.**
   The same mistake P7's gate made twice, in the same shape: a read that cannot
   tell "I asked wrongly" from "the feature is broken".

And one thing the gate had to be taught rather than fixed: `/rhythm/tick` walks
the member's clock and does nothing at four in the afternoon, so the plan check
uses the operator's forced prompt (`/internal/rhythm/prompt`), which ignores the
time of day for exactly this reason.

### Decisions taken during implementation, and where they differ from the plan

- **`daily_plans` gained a `mealReason` column.** The plan said the reason would
  come from the `todayMeals` query while online with "a plain sentence" as the
  offline fallback — which is a member on a plane being told less than a member
  on wifi, for one string. The reason is a synced column beside the line now, so
  the phone renders the same sentence in the same language with no network, and
  P3's `meal-line-changed.handler.ts` stops writing an English sentence into a
  row an Arabic-reading member syncs.
- **`daily_plans.workoutLine` is finally written.** It has been carried by the
  aggregate, the view, the resolver and the sync adapter since P3 and set by
  nothing. The draft builder fills it from the day's session, and
  `DailyPlan.dayLine` composes FR-008's `"Workout: … | Meals: …"` from the two
  halves — which is also the one place that names a rest day.
- **Swapping a meal is `POST /nutrition/today/meals/:index/replace`**, not
  `/nutrition/today/replace {mealId}`. The slot is matched by **position**: two
  `any` meals can share a kind, and the member tapped a row rather than a
  category.
- **The event-driven rebuild is idempotent on the day's own row** rather than
  through a separate store. `meal_suggestions.causeEventId` is the key, for the
  reason `usage_log` keys on `eventId` at its index: the check and the write are
  then the same row.
- **`replace-today-meal` does not run the allergen gate.** The member is naming
  a meal out of their own library, for themselves, having read it — the gate
  exists to stop *the system* handing them something, not to police them. The
  same meal is still held back from an automatic rotation.

### What is not done

- **T852's RTL screenshots.** The Arabic strings are in and the parity test
  asserts every key has a translation, but no screenshots were captured: this
  machine has no emulator running. The strings are exercised by
  `localisation_parity_test.dart`; the screenshots are a manual step for the
  release checklist.

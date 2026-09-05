# Implementation Plan: Nutrition & the daily line (P8)

**Branch**: `022-nutrition-daily-plan` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/022-nutrition-daily-plan/spec.md`; blueprint data-model §2.8,
contracts `rest-commands.md` (Nutrition), `events.md`; research P-04.

## Summary

The Nutrition context: a member's meal library, a day's suggestion produced either by
rotating that library (no model at all) or by a schema-constrained model call, an
allergen gate that withholds rather than warns, and the composed
"Workout: … | Meals: …" line that the rhythm has been leaving blank. It binds the last
port P3 left open.

## Technical Context

**Primary Dependencies**: none new; the model call reuses `shared/llm`

**Storage**: MongoDB `meals`, `meal_suggestions`; phone drift `meals`,
`meal_suggestions` (schemaVersion 8 → 9)

**Testing**: vitest — allergen gate over a fixture of 50 generated days per allergy,
zero model calls in library mode (asserted by a spy on the LLM port), rotation
variety, degradation when the model is down, past days immutable

**Performance Goals**: library mode < 5 ms; suggestion mode within the rhythm's
existing budget, and never blocking the plan

**Constraints**: withhold rather than warn; no clinical claims; the plan is sent even
when food cannot be produced

**Scale/Scope**: ~25 backend files, ~10 mobile files

## Constitution Check (v2.1.0)

| Principle | Status | How |
|---|---|---|
| I. Store per context | PASS | Nutrition owns its two collections; allergies come from Profile's summary port, training from Training's |
| II. n8n | PASS | Untouched |
| III. Local-first LLM | PASS | Local model, schema-constrained; library mode calls nothing |
| IV. Forward-only migrations | PASS | One `migrate-mongo` script; drift 8 → 9 guarded |
| V. Single public surface | PASS | Behind Caddy |
| VI. Multi-user, principals | PASS | Per member |
| VII. Test-then-verify | PASS | The allergen gate is the safety-critical rule and is specced over a fixture corpus |
| VIII. YAGNI | PASS | No tracking, recipes, macros or shopping |
| IX. Contexts, slices, ports | PASS | `TodayMealsQuery` — the port P3 declared — is bound here |
| X. Commands / queries / streams | PASS | Meals are commands, the day's line is a query |
| XI. Times belong to the user | PASS | `forDate` is the member's local date |
| XII. Configuration | PASS | `mealMode` is a member preference; `nutrition.mealsPerDay` and the allergen family list are registry keys |

## Design

### Context layout

```text
contexts/nutrition/
├── domain/
│   ├── meal.aggregate.ts
│   ├── meal-suggestion.aggregate.ts     # propose(mode, meals) · withhold(reason)
│   ├── allergen-gate.ts                 # families + the member's own words; contains(text, allergies) → matches[]
│   ├── library-rotator.ts               # deterministic, seeded by (userId, date) so a day is stable but varies
│   └── ports: meal.repository.ts · meal-suggestion.repository.ts · meal-drafter.port.ts
├── infrastructure/ mongo-*.repository.ts · llm-meal-drafter.ts · in-memory-*.ts
└── features/
    ├── add-meal/ update-meal/ delete-meal/
    ├── build-day-line/          # the composer: workout + meals; called by the rhythm
    ├── regenerate-today/ replace-today-meal/
    └── meals/ today-meals/      (queries)
```

### The two modes

```text
mode = preferences.mealMode
if mode == 'library':
    meals = LibraryRotator.pick(userId, date, mealsPerDay)   # no model call, deterministic per (userId, date)
    if library is empty → withhold with reason 'empty_library'  (the client invites the member to add meals)
else:
    draft = MealDrafter.draft({ trainingFocus, likes, dislikes, mealsPerDay })   # schema-constrained
    if draft is null (model down) → withhold with reason 'model_unavailable'
gate = AllergenGate.check(draft, allergies)
if gate.matches: retry once with the matches named as prohibitions; still matching → withhold 'allergen'
```

`LibraryRotator` is deterministic on `(userId, date)` so the same day always yields
the same meals (a member who reopens the app does not see it change) while consecutive
days differ. `MealDrafter` is a port: the model adapter lives in infrastructure and a
fake is used in specs, which is how SC-002 is measured rather than assumed — the spec
asserts the port was never called in library mode.

### The line

`build-day-line(userId, date)` composes:

```text
workout = NextSessionQuery/SessionOnQuery(date) → its title, or "Rest" when there is none
meals   = today-meals(date) → names joined
"Workout: {workout} | Meals: {meals}"      or      "Workout: {workout}"   when meals were withheld
```

The rhythm's draft builder (P3) calls it through the `TodayMealsQuery` port, which is
rebound here from its stub — the last of the three stubs P3 declared. A withheld line
never delays or blocks the plan (FR-008, SC-004).

### Coach consistency

The Coach's prompt gains the day's line and the member's meal mode through the
existing summary queries, so an answer about food matches what the member was shown
and inherits the same allergen prohibition wording from P1's profile line.

### Mobile

`features/nutrition`: the meal library (add, edit, delete, kind chips), the mode
switch mirrored from preferences, today's line on home with a regenerate action and a
"use one of mine" picker. Everything reads drift; the line is stored per day so it is
readable offline and past days keep what they said.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `MealDrafter` as a port with a fake | SC-002 requires proving no model call happens in library mode | Asserting behaviour by reading logs is not a test |
| Withhold-and-retry rather than filter | An allergen slipping through in different wording is a safety failure, and filtering words from a generated list produces nonsense | Post-hoc word filtering leaves the model's intent intact and can produce a half-sentence |

## Verification gate

```powershell
pnpm --filter @botvy/backend test   # allergen gate over the fixture corpus, zero model calls in library mode,
                                    # rotation variety and stability, model-down degradation, past days immutable
cd apps/mobile; flutter test; flutter analyze
# manual: add five meals and switch to "my meals" → the line uses only those and changes across days;
#         declare a dairy allergy in suggestion mode → 50 generated days contain none; stop the model →
#         briefings still arrive with the workout alone
```

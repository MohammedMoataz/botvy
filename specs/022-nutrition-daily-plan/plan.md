# Implementation Plan: Nutrition & the daily line (P8)

**Branch**: `022-nutrition-daily-plan` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/022-nutrition-daily-plan/spec.md`; blueprint data-model §2.8,
contracts `rest-commands.md` (Nutrition), `events.md`; research P-04.

## Summary

The Nutrition context: a member's meal library, a day's suggestion produced either by
rotating that library (no model at all) or by a schema-constrained model call, an
allergen gate that withholds rather than warns, and the **meal half** of the day's
line — `mealLine` — that the rhythm has been leaving blank. The sentence
"Workout: … | Meals: …" itself is composed in the Daily Rhythm context from its own
workout half and this one, exactly as the blueprint has it; Nutrition supplies the
half and announces it, and never reads a training session in order to write the other
half. It binds the last port P3 left open.

## Technical Context

**Primary Dependencies**: none new; the model call reuses `shared/llm`

**Storage**: MongoDB `meals`, `meal_suggestions`; phone drift `meals`
(schemaVersion 8 → 9). The meal half reaches the phone inside `daily_plans.mealLine`,
a table P3 already syncs — no drift table for suggestions is added

**Testing**: vitest — allergen gate over a fixture of 50 generated days per allergy,
zero model calls in library mode (asserted by a spy on the LLM port), the shape of the
meal half on an ordinary day, a rest day and a withheld day, rotation variety,
degradation when the model is down, regeneration on a profile change (idempotent on
the event id), past days immutable

**Performance Goals**: library mode < 5 ms; suggestion mode within the rhythm's
existing budget, and never blocking the plan

**Constraints**: withhold rather than warn; no clinical claims; the plan is sent even
when food cannot be produced

**Scale/Scope**: ~25 backend files, ~10 mobile files

## Constitution Check (v2.1.1)

| Principle | Status | How |
|---|---|---|
| I. Store per context | PASS | Nutrition owns its two collections; allergies and food preferences come from Profile through `ProfileFoodsQuery`, the day's training from Training's `SessionsInRangeQuery` |
| II. n8n | PASS | Untouched |
| III. Local-first LLM | PASS | Local model, schema-constrained; library mode calls nothing |
| IV. Forward-only migrations | PASS | One `migrate-mongo` script; drift 8 → 9 guarded |
| V. Single public surface | PASS | Behind Caddy |
| VI. Multi-user, principals | PASS | Per member |
| VII. Test-then-verify | PASS | The allergen gate is the safety-critical rule and is specced over a fixture corpus; the meal half's three shapes each carry a `spec:` |
| VIII. YAGNI | PASS | No tracking, recipes, macros or shopping |
| IX. Contexts, slices, ports | PASS | `TodayMealsQuery` — the port P3 declared — is bound here, and every path that changes the meal half announces it with `nutrition.MealPlanReady`/`MealPlanWithheld` rather than writing the rhythm's document |
| X. Commands / queries / streams | PASS | Meals are commands, the day's line is a query |
| XI. Times belong to the user | PASS | `forDate` is the member's local date |
| XII. Configuration | PASS | `mealMode` is a member preference seeded from `defaults.mealMode`; `nutrition.mealsPerDay` and the allergen family list are registry keys P0 registers and this phase reads by name |

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
    ├── build-meal-line/         # the meal half only; raises MealPlanReady / MealPlanWithheld
    ├── regenerate-today/ replace-today-meal/
    ├── regenerate-on-profile-updated/    # profile.ProfileUpdated{changed: allergies|foods}
    └── meals/ today-meals/      (queries)
```

### The two modes

`preferences.mealMode` stores exactly two values and there is no third vocabulary:
`'library'` is the mode the member sees labelled **"my meals"**, `'llm'` the one
labelled **"suggest for me"**. The contract, the GraphQL enum, the preference and the
mobile switch all use that stored pair; "my meals", "suggest for me", "my library" and
"generic" are translation strings over the two and never appear in code.

```text
mode = preferences.mealMode                                  # 'library' | 'llm'
perDay = settings.nutrition.mealsPerDay
if mode == 'library':
    meals = LibraryRotator.pick(userId, date, perDay)        # no model call, deterministic per (userId, date)
    if library is empty → withhold with reason 'empty_library'  (the client invites the member to add meals)
else:                                                        # 'llm'
    draft = MealDrafter.draft({ trainingFocus, likes, dislikes, perDay })   # schema-constrained
    if draft is null (model down) → withhold with reason 'model_unavailable'
gate = AllergenGate.check(draft, allergies)
if gate.matches: retry once with the matches named as prohibitions; still matching → withhold 'allergen'
```

`LibraryRotator` is deterministic on `(userId, date)` so the same day always yields
the same meals (a member who reopens the app does not see it change) while consecutive
days differ. `MealDrafter` is a port: the model adapter lives in infrastructure and a
fake is used in specs, which is how SC-002 is measured rather than assumed — the spec
asserts the port was never called in library mode.

### The meal half

`build-meal-line(userId, date)` produces the food half and nothing else:

```text
meals    = the rotation or the gated draft, above
mealLine = their names joined, "oats, chicken salad, lentil soup"   |   null when withheld
→ nutrition.MealPlanReady { date, line }        or   nutrition.MealPlanWithheld { date, reason }
```

The sentence is not built here. Daily Rhythm composes
`"Workout: {workoutLine} | Meals: {mealLine}"` from its own workout half and this one,
names the rest day when there is no session, and shows the workout alone when
`mealLine` is null (FR-008, SC-004) — that is where the blueprint's `daily_plans` keeps
the two halves, and this phase does not move it.

Two paths carry the half outward and both are needed. At draft time the rhythm pulls it
through the `TodayMealsQuery` port, rebound here from its P3 stub — the last of the
three. Afterwards every path that *changes* the half — `regenerate-today`,
`replace-today-meal` and the profile consumer below — raises `MealPlanReady` or
`MealPlanWithheld` again, and the rhythm's draft saga rewrites `daily_plans.mealLine`.
Without that second path a regenerated line would sit in `meal_suggestions` while the
briefing, the home card and the coach went on reading the one it replaced — which is
what FR-010 and FR-013 are for. A withheld half never delays or blocks the plan.

Swapping a single meal is its own command, `POST /nutrition/today/meals/{index}/replace
{ mealId }`, beside `POST /nutrition/today/regenerate`: it keeps the rest of the day's
meals and announces the new half like any other change.

**Built as `/meals/{index}/replace` rather than `/replace { mealId }`**, and the
difference is the slot: two `any` meals can share a kind, and the member tapped a row
rather than a category, so the position is what identifies what is being replaced.

### What the drafter is told about the day

The suggestion branch asks Training `SessionsInRangeQuery(userId, date, date)` — a port
P6 declares — and passes the session's sport and focus, or "rest day" when the range
comes back empty. The question is *is there a session on this date*, a session already
logged included; a "what is next" lookup is the wrong one, because on a day whose
session is finished it reaches into tomorrow and drafts for a training day that has
already been had.

### What the gate is told about the member

Allergies, liked and disliked foods come from Profile through
`ProfileFoodsQuery(userId) → { allergies, likedFoods, dislikedFoods }`, a structured
query P1 gains beside `ProfileSummaryQuery`. The summary is a prose line of filled
fields assembled for a prompt; matching an allergen word by word against a sentence is
precisely the fragile thing that ends with a member being handed an allergen, so the
gate is given lists.

### When the profile changes

`regenerate-on-profile-updated` subscribes to `profile.ProfileUpdated{changed[]}` and
does nothing unless `changed` names allergies or foods. When it does, today's meal half
is built again from scratch and announced like any other change, so a member who
declares a nut allergy at noon does not spend the afternoon looking at almonds
(FR-013). The handler is idempotent on `eventId`: the relay delivers at least once, and
a redelivery must not cost a second draft.

### Coach consistency

The Coach's prompt gains the day's meal half and the member's meal mode through the
existing summary queries, so an answer about food matches what the member was shown and
inherits the same allergen prohibition wording from P1's profile line. The `add_meal`
intent dispatches this context's ordinary `add-meal` command through P4's executor
rather than opening a second write path.

### Mobile

`features/nutrition`: the meal library (add, edit, delete, kind chips), the mode switch
mirrored from preferences, today's line on home with a regenerate action and a "use one
of mine" picker. The line is read from drift `daily_plans.mealLine`, which P3 already
syncs, so it is readable offline and past days keep what they said.

**`daily_plans` gained a `mealReason` column, which this section originally said it
would not.** The plan was for the card to read the reason from the `todayMeals` query
while online and fall back to a plain "no meals for today" when not — which is a member
on a plane being told less than a member on wifi, for one string, and it left P3's
`meal-line-changed.handler.ts` writing a rendered English sentence into `mealLine`
itself: a row an Arabic-reading member syncs. The line and the **code** are two columns
now; each of the three reasons — an allergen, an empty list, nothing could be produced —
has its own sentence in English and Arabic on each surface, and the morning briefing
puts the same three in place of the meal half (FR-014).

### Decisions taken here

Two things the analysis left open were settled from the constitution and the blueprint
rather than invented: the meal half rides `daily_plans`, because that table is synced
already and a pull-only `meal_suggestions` entity would widen the sync contract for one
string; and a withholding reason travels as a code rather than a rendered sentence,
because the member's language is a preference and every surface already owns its own
strings (XI, XII).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `MealDrafter` as a port with a fake | SC-002 requires proving no model call happens in library mode | Asserting behaviour by reading logs is not a test |
| Withhold-and-retry rather than filter | An allergen slipping through in different wording is a safety failure, and filtering words from a generated list produces nonsense | Post-hoc word filtering leaves the model's intent intact and can produce a half-sentence |

## Verification gate

```powershell
pnpm --filter @botvy/backend test   # allergen gate over the fixture corpus, zero model calls in library mode,
                                    # the meal half on an ordinary, a rest and a withheld day, rotation variety
                                    # and stability, model-down degradation, regeneration on a profile change,
                                    # past days immutable
cd apps/mobile; flutter test; flutter analyze
# manual: add five meals and switch to "my meals" → the line uses only those and changes across days;
#         declare a dairy allergy in suggestion mode → 50 generated days contain none; stop the model →
#         briefings still arrive with the workout alone
```

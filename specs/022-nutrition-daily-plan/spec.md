# Feature Specification: Workout and meals, on one line

**Feature Branch**: `022-nutrition-daily-plan`

**Created**: 2026-09-05

**Status**: Draft (phase P8 of `specs/013-platform-v2-blueprint`)

**Input**: Blueprint P8 — "meals library, generic suggestion via model or library,
Workout: X | Meals: Y line, allergen withholding."

## Why this feature exists

The daily plan has been carrying a blank where the food should be since the rhythm
shipped. This phase fills it — deliberately modestly. Botvy is not a nutrition app: it
does not count calories, weigh portions or claim medical knowledge. It answers one
question the member actually asks every morning, on one line: what am I training
today, and what am I eating.

A member who wants control keeps their own list of meals and Botvy rotates it, with
nothing produced on their behalf. A member who wants ideas gets generic suggestions.
Either way, a declared allergy is a hard stop.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — One line that says the day (Priority: P1)

The morning briefing, the evening proposal and the home screen all show a line in the
form "Workout: [what] | Meals: [what]". When there is no training, the line says so
rather than pretending.

**Acceptance Scenarios**:

1. **Given** an upper-body session and a meal set, **When** the briefing arrives,
   **Then** it reads "Workout: Upper body | Meals: oats, chicken salad, lentil soup".
2. **Given** a rest day, **When** the line is shown, **Then** it names the rest rather
   than leaving the workout blank.
3. **Given** no meals could be produced, **When** the line is shown, **Then** it shows
   the workout alone rather than a broken line.

---

### User Story 2 — Keep my own meals (Priority: P1)

A member lists meals they actually eat — a name, whether it is breakfast, lunch,
dinner or a snack, and optionally its ingredients and their own labels for grouping
them. They can choose to have Botvy use only their list.

**Independent Test**: add five meals, choose "my meals" → every day's line uses only
those, and nothing is produced on their behalf.

**Acceptance Scenarios**:

1. **Given** the member's own list and that mode, **When** the day's line is built,
   **Then** it uses only their meals and varies across days rather than repeating one.
2. **Given** an empty list and that mode, **When** the line is built, **Then** the
   member is invited to add meals rather than being given generic ones silently.
3. **Given** that mode, **When** a day is planned, **Then** nothing is produced on the
   member's behalf at all: the meals come from their own list and nowhere else.

---

### User Story 3 — Or let Botvy suggest (Priority: P2)

In the other mode, Botvy suggests ordinary meals that suit the day's training,
avoiding what the member dislikes and never touching what they are allergic to.
Suggestions are generic — categories of food a person eats — not a diet plan.

**Acceptance Scenarios**:

1. **Given** a hard training day, **When** the line is built, **Then** the suggestion
   reflects it in plain terms rather than prescribing macronutrients.
2. **Given** a disliked food, **When** a run of days is suggested, **Then** it appears
   on none of them.
3. **Given** a declared allergy, **When** any suggestion would contain it, **Then**
   the whole line is withheld and regenerated, and the member is told why if it
   cannot be produced safely.
4. **Given** today's meals were already chosen, **When** the member declares a new
   allergy or changes what they like and dislike, **Then** today's meals are chosen
   again on the spot rather than tomorrow, and the old ones stop being shown.

---

### User Story 4 — Change today's line (Priority: P3)

A member can ask for a different suggestion for today, or replace it with one of their
own meals.

**Acceptance Scenarios**:

1. **Given** today's line, **When** the member asks for another, **Then** a different
   one is produced without changing tomorrow's.
2. **Given** today's line, **When** the member swaps one meal for one of their own,
   **Then** the rest of the day's meals stay as they were, and everywhere the line is
   shown follows within the same day.

---

### User Story 5 — The coach knows what I eat (Priority: P2)

The Coach chat can answer about the day's meals and about the member's own list,
using the same rules — never suggesting an allergen, never inventing a clinical claim.

**Acceptance Scenarios**:

1. **Given** a question about today's food, **When** the coach answers, **Then** it
   matches the line the member was shown.
2. **Given** the member says "add grilled chicken to my meals" in the Coach chat,
   **When** the message is understood, **Then** the meal joins their list exactly as
   adding it by hand would, and the coach says so.

### Edge Cases

- Allergies recorded loosely ("nuts") against a suggestion naming a specific nut: the
  match is by family as well as by word, and when in doubt the line is withheld.
- A member with an empty profile: generic suggestions are still ordinary and safe.
- Nothing can be produced in suggestion mode: the day's line shows the workout alone;
  the plan is never delayed for food.
- A member switching modes mid-week: today is rebuilt on request, past days are not
  rewritten.
- A meal deleted from the member's list after it was used: past days keep what they
  said.

## Requirements *(mandatory)*

- **FR-001** A member MUST be able to keep a personal list of meals with a name, a
  kind (breakfast, lunch, dinner, snack or any) and, optionally, ingredients and their
  own labels for grouping them.
- **FR-002** A member MUST be able to choose between using their own list and letting
  Botvy suggest; the choice MUST be a preference.
- **FR-003** In "my meals" mode the system MUST NOT produce anything on the member's
  behalf and MUST vary the selection across days.
- **FR-004** In "my meals" mode with an empty list the system MUST invite the member
  to add meals rather than silently switching modes.
- **FR-005** Suggestions MUST be generic and ordinary; the system MUST NOT prescribe
  quantities, calories, macronutrients or anything of clinical character. "Generic and
  ordinary" is held to its negative half: no such language appears anywhere in a
  suggestion.
- **FR-006** A suggestion containing a declared allergen MUST be withheld entirely,
  not shown with a warning; the system MUST retry and, failing that, show the workout
  alone and say why.
- **FR-007** A food the member has listed as disliked MUST NOT appear in the day's
  meals; over a run of days the count MUST be zero rather than merely low.
- **FR-008** The day's line MUST read "Workout: … | Meals: …", MUST name a rest day
  explicitly, and MUST degrade to the workout alone when meals cannot be produced.
- **FR-009** The line MUST appear in the morning briefing, the evening proposal and
  the home screen, and MUST be readable offline once produced.
- **FR-010** A member MUST be able to regenerate today's line or replace it with one
  of their own meals, without affecting other days.
- **FR-011** Past days MUST keep the line they were given.
- **FR-012** The Coach MUST answer about meals consistently with the line shown and
  under the same allergen rule, and MUST be able to add a meal to the member's list
  when asked to in conversation.
- **FR-013** A newly declared allergy, or a change to what the member likes and
  dislikes, MUST cause today's meals to be chosen again the same day, and everywhere
  today's line is shown MUST follow.
- **FR-014** Whenever meals are withheld — for an allergen, for an empty list, or
  because nothing could be produced — the member MUST be told which of the three it
  was, in the same words on the home screen and in the morning briefing.

### Key Entities

**Meal** (a member's own), **Day's meal suggestion** (what was proposed for a date,
in which mode, and whether it was withheld and why).

## Success Criteria *(mandatory)*

- **SC-001** Zero suggestions containing a declared allergen across 50 generated days
  per allergy fixture.
- **SC-002** In "my meals" mode, nothing is produced on the member's behalf — measured,
  not assumed.
- **SC-003** The day's line appears in 100% of briefings that have a plan.
- **SC-004** With suggestions unavailable, 100% of briefings still arrive, with the
  workout alone.
- **SC-005** A member sets up five meals and switches mode in under 2 minutes.
- **SC-006** Across the same 50-day corpus, a food the member listed as disliked
  appears in zero days' meals.

## Assumptions

- Botvy gives ordinary food ideas, not dietary advice; the instruction under which a
  suggestion is made says so, and nothing in the product claims otherwise.
- Three meals a day by default; a member's own list may cover fewer kinds and the line
  adapts.
- Allergen matching uses a small built-in family list (nuts, dairy, gluten, shellfish,
  egg, soy) plus the member's own words.
- Nothing is tracked about what was actually eaten in this phase.

## Out of scope

- Calorie or macronutrient tracking, portion sizes, weight-loss targets.
- Recipes, shopping lists, grocery integration.
- Logging what was eaten and reporting on it.
- Any medical or clinical claim.

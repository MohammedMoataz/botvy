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

A member who wants control keeps their own list of meals and Botvy rotates it, with no
model involved at all. A member who wants ideas gets generic suggestions. Either way,
a declared allergy is a hard stop.

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
dinner or a snack, and optionally its ingredients. They can choose to have Botvy use
only their list.

**Independent Test**: add five meals, choose "my meals" → every day's line uses only
those, and no model is called.

**Acceptance Scenarios**:

1. **Given** the member's own list and that mode, **When** the day's line is built,
   **Then** it uses only their meals and varies across days rather than repeating one.
2. **Given** an empty list and that mode, **When** the line is built, **Then** the
   member is invited to add meals rather than being given generic ones silently.
3. **Given** that mode, **When** a day is planned, **Then** nothing is sent to the
   model at all.

---

### User Story 3 — Or let Botvy suggest (Priority: P2)

In the other mode, Botvy suggests ordinary meals that suit the day's training,
avoiding what the member dislikes and never touching what they are allergic to.
Suggestions are generic — categories of food a person eats — not a diet plan.

**Acceptance Scenarios**:

1. **Given** a hard training day, **When** the line is built, **Then** the suggestion
   reflects it in plain terms rather than prescribing macronutrients.
2. **Given** a disliked food, **When** suggestions are made, **Then** it is avoided
   where possible and never insisted on.
3. **Given** a declared allergy, **When** any suggestion would contain it, **Then**
   the whole line is withheld and regenerated, and the member is told why if it
   cannot be produced safely.

---

### User Story 4 — Change today's line (Priority: P3)

A member can ask for a different suggestion for today, or replace it with one of their
own meals.

**Acceptance Scenarios**:

1. **Given** today's line, **When** the member asks for another, **Then** a different
   one is produced without changing tomorrow's.

---

### User Story 5 — The coach knows what I eat (Priority: P2)

The Coach chat can answer about the day's meals and about the member's own list,
using the same rules — never suggesting an allergen, never inventing a clinical claim.

**Acceptance Scenarios**:

1. **Given** a question about today's food, **When** the coach answers, **Then** it
   matches the line the member was shown.

### Edge Cases

- Allergies recorded loosely ("nuts") against a suggestion naming a specific nut: the
  match is by family as well as by word, and when in doubt the line is withheld.
- A member with an empty profile: generic suggestions are still ordinary and safe.
- The model is unavailable in suggestion mode: the day's line shows the workout alone;
  the plan is never delayed for food.
- A member switching modes mid-week: today is rebuilt on request, past days are not
  rewritten.
- A meal deleted from the member's list after it was used: past days keep what they
  said.

## Requirements *(mandatory)*

- **FR-001** A member MUST be able to keep a personal list of meals with a name, a
  kind (breakfast, lunch, dinner, snack or any) and optional ingredients.
- **FR-002** A member MUST be able to choose between using their own list and letting
  Botvy suggest; the choice MUST be a preference.
- **FR-003** In "my meals" mode the system MUST NOT call the model at all and MUST
  vary the selection across days.
- **FR-004** In "my meals" mode with an empty list the system MUST invite the member
  to add meals rather than silently switching modes.
- **FR-005** Suggestions MUST be generic and ordinary; the system MUST NOT prescribe
  quantities, calories, macronutrients or anything of clinical character.
- **FR-006** A suggestion containing a declared allergen MUST be withheld entirely,
  not shown with a warning; the system MUST retry and, failing that, show the workout
  alone and say why.
- **FR-007** Disliked foods MUST be avoided where possible.
- **FR-008** The day's line MUST read "Workout: … | Meals: …", MUST name a rest day
  explicitly, and MUST degrade to the workout alone when meals cannot be produced.
- **FR-009** The line MUST appear in the morning briefing, the evening proposal and
  the home screen, and MUST be readable offline once produced.
- **FR-010** A member MUST be able to regenerate today's line or replace it with one
  of their own meals, without affecting other days.
- **FR-011** Past days MUST keep the line they were given.
- **FR-012** The Coach MUST answer about meals consistently with the line shown and
  under the same allergen rule.

### Key Entities

**Meal** (a member's own), **Day's meal suggestion** (what was proposed for a date,
in which mode, and whether it was withheld and why).

## Success Criteria *(mandatory)*

- **SC-001** Zero suggestions containing a declared allergen across 50 generated days
  per allergy fixture.
- **SC-002** In "my meals" mode, zero model calls are made — measured, not assumed.
- **SC-003** The day's line appears in 100% of briefings that have a plan.
- **SC-004** With the model stopped, 100% of briefings still arrive, with the workout
  alone.
- **SC-005** A member sets up five meals and switches mode in under 2 minutes.

## Assumptions

- Botvy gives ordinary food ideas, not dietary advice; the wording of the suggestion
  prompt says so, and nothing in the product claims otherwise.
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

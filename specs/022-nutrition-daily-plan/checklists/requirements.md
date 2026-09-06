# Specification Quality Checklist: Nutrition & the daily line (P8)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-05
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details — spec.md names no model, schema or collection; the one mechanism word left is inside the blueprint quotation in **Input**
- [x] Focused on user value — one line that answers the morning question
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers — ordinary food not advice, three meals by default, family-based allergen matching, no eating log, all stated
- [x] Requirements testable and unambiguous — FR-001…FR-014; FR-007 now counts disliked foods rather than asking for them to be "avoided where possible"
- [x] Success criteria measurable — SC-001…SC-006, including the measured claim that nothing is produced in "my meals" mode
- [x] Success criteria technology-agnostic
- [x] All acceptance scenarios defined — 5 stories, including the chat "add grilled chicken to my meals" (US5) and the same-day rebuild after a profile change (US3)
- [x] Edge cases identified — loose allergy wording, empty profile, nothing producible, mode switch mid-week, deleted meal
- [x] Scope clearly bounded — no macros, recipes, shopping or clinical claims
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes
- [x] No implementation details leak into specification

## Phase-specific

- [x] plan.md carries the constitution check (v2.1.1) and justifies the drafter port and withhold-and-retry
- [x] Every FR maps to a task (001 → T810, 002 → T811/T820, 003 → T811, 004 → T811, 005 → T822, 006 → T821, 007 → T820, 008 → T830 with the sentence itself composed in P3, 009 → T831/T832/T850, 010 → T840, 011 → T832, 012 → T841/T853, 013 → T842, 014 → T831/T851/T852); every SC too (001 → T821, 002 → T811, 003 → T831, 004 → T820/T830, 005 → manual gate step 3, 006 → T820)
- [x] The meal half is announced with `MealPlanReady`/`MealPlanWithheld` from every path that changes it — the first build, both member commands and the profile consumer — so a regenerated line reaches the briefing and the coach rather than only `meal_suggestions`
- [x] Every cross-context read is a query the owning phase declares: `ProfileFoodsQuery` (P1) for allergies and food preferences, `SessionsInRangeQuery` (P6) for the day's training; no collection of another context is read
- [x] Registry keys are registered (T803) before the slices that read them (T811, T820, T821)
- [x] The safety-critical rule (withhold, never warn) is stated in the spec and specced over a corpus
- [x] The last of P3's three stub ports is bound here and the check is in the gate

## Notes

- Validation run 2026-09-05: all items pass.
- Re-validated 2026-09-06 after the analysis pass. FR-013 (same-day rebuild when
  allergies or foods change) and FR-014 (each withholding reason said in the same words
  everywhere) are new, with SC-006 for disliked foods; the composition of the
  "Workout: … | Meals: …" sentence moved out of this phase to Daily Rhythm, which is
  where the blueprint always had it.
- "Generic and ordinary" (FR-005) stays judged by its negative half — no quantity,
  calorie, macronutrient or clinical language anywhere in a suggestion (T822). That is
  the only part of it a test can hold, and it is enough.

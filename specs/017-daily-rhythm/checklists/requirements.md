# Specification Quality Checklist: Daily Rhythm (P3)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-05
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details — spec.md never names cron, MongoDB or the tick's mechanics
- [x] Focused on user value — the ritual that turns lists into coaching
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers — the two evening touches and the morning one, the Owner-set size of the priority list, the Owner-set check-in window, and the absent training/meal line before P6/P8 are all stated in Assumptions or in the requirement itself
- [x] Requirements testable and unambiguous — FR-001…FR-013, with the check-in window and the mood range quantified
- [x] Success criteria measurable — SC-001…SC-005; SC-003 is marked observational in spec.md and is watched after release rather than gated
- [x] Success criteria technology-agnostic
- [x] All acceptance scenarios defined — 5 stories, including the once-a-day and catch-up cases
- [x] Edge cases identified — late registration, travel, quiet hours vs own choice, empty day, model unavailable
- [x] Scope clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes
- [x] No implementation details leak into specification

## Phase-specific

- [x] plan.md carries the constitution check (v2.1.1) and justifies the stub ports, the dual delivery, the Conversations skeleton opened here and the rebuild chosen over the stale-marking saga
- [x] Every FR maps to a task (001 → T320, 001a → T324, 002 → T320/T323, 003 → T322, 004 → T330, 005 → T305/T321/T324/T330, 006 → T310, 007 → T340/T341, 008 → T340, 009 → T324, 010 → T350/T351, 011 → T310, 012 → T320, 013 → T321/T324/T330)
- [x] Every SC has a home (001 → T313, 002 → T310, 003 → observational, no task, 004 → T341, 005 → T354)
- [x] Cross-context reads are QueryBus dispatches to the owning context's handlers, or declared ports with stubs — never another context's collection
- [x] The conversation the touches are written into is created in this phase (T305), not assumed from an earlier one; the `rhythm_states` row likewise (T306)
- [x] Verification gate includes the downtime, two-time-zone and streak checks that cannot be inferred from unit tests alone

## Notes

- Validation run 2026-09-05: all items pass.
- Re-validated 2026-09-06 after the cross-phase analysis: the Conversations skeleton
  and the `rhythm_states` bootstrap were added, the claim methods split three ways,
  the cross-context reads moved onto the QueryBus, and the check-in window, mood range
  and priority-list size were quantified against the settings registry.

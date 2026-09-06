# Specification Quality Checklist: Coach & Planner Chat (P4)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-05
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details — spec.md never names WebSocket, Ollama or JSON schemas
- [x] Focused on user value — a coach that knows the member, a planner that acts
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers — one reply per conversation per flush, model-dependent quality, the reference host and the seeded quick questions all stated
- [x] Requirements testable and unambiguous — FR-001…FR-022; the two absolutes are gone (the allergen rule is measured across the test corpus and enforced on the way out, the off-topic rule names the signal and the title)
- [x] Success criteria measurable — SC-001…SC-007, with the fixture hit rate and the first-token latency as the quality gates
- [x] Success criteria technology-agnostic
- [x] All acceptance scenarios defined — 6 stories
- [x] Edge cases identified — multi-device, long answers, app closed mid-answer, access withdrawn mid-conversation, another member's conversation, unsupported request, invalid instruction, quoted text
- [x] Scope clearly bounded — no web search, voice or tool loops
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes
- [x] No implementation details leak into specification

## Phase-specific

- [x] plan.md carries the constitution check (v2.1.1) and justifies the shared turn runner and the second model call
- [x] The four decisions the analysis pass left open (the usage writer, the off-topic signal, the allowance's day, the reference host) are settled in plan.md rather than left to the implementer
- [x] Every FR maps to a task (001 → P3 T305 + T405/T404, 002 → T420/T421, 003 → T410, 004 → T412, 005 → T402/T412, 006 → T412, 007 → T422, 008 → T413, 009 → T430, 010 → T431, 011 → T404/T406, 012 → T420, 013 → T423/T425, 014 → T414, 015 → T412, 016 → T420/T442, 017 → T424, 018 → T415, 019 → T452, 020 → T404/T420, 021 → T420, 022 → T453)
- [x] Every SC has a proving step (001 → T451 + gate 2/4, 002 → T451, 003 → T415 + T451, 004 → T430, 005 → T422 + gate 4, 006 → gate 5, 007 → T403/T420)
- [x] The one requirement this phase does not own is named: the pinned conversations are created by P3 (`017` T305); P4 backfills the members who predate it (T405)
- [x] The v1 junction-box defect is named and structurally avoided (one slice per responsibility, one shared turn runner)
- [x] Verification gate includes a live-model fixture run, not only unit tests

## Notes

- Validation run 2026-09-05: all items pass.
- Re-run 2026-09-06 after the analysis pass: FR-015…FR-022 and SC-007 added to the
  map, the SC row added, the Conversations ownership split with P3 recorded, and
  "suggested question" replaced by "quick question" throughout.

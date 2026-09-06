# Specification Quality Checklist: Training (P6)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-05
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details — spec.md never names collections, sagas or query ports
- [x] Focused on user value — the athlete's week and the next practice
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers — one session per slot, no progression, media deferred, two-week materialisation, all stated
- [x] Requirements testable and unambiguous — FR-001…FR-018
- [x] Success criteria measurable — SC-001…SC-005; SC-001 carries its 5-second bound
- [x] Success criteria technology-agnostic
- [x] All acceptance scenarios defined — 6 stories, each with an independent test
- [x] Edge cases identified — rest day, slot change, two sports one hour, missed session, short program, cut-off before a pending session; a program archived over sessions it already filled is answered in US4 sc.4
- [x] Scope clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes
- [x] No implementation details leak into specification

## Phase-specific

- [x] plan.md carries the constitution check (v2.1.1) and justifies materialisation and the single set shape
- [x] Every FR maps to a task (001 → T610, 002 → T610/T611, 003 → T611, 004 → T601/T620, 005 → T620, 006-007 → T621/T612, 008 → T611/T630/T631, 009 → T632, 010 → T642, 011 → T640/T641, 012 → T633/T650–T652, 013 → T611, 014 → T623, 015 → T662, 016 → T664, 017 → T661, 018 → T603)
- [x] Every task carries a requirement or is named cross-cutting (T660, T663, T665 are the three)
- [x] `NextSessionQuery` is bound here as P3 planned; `SessionsInRangeQuery` is declared here and replaces the placeholder P5 held
- [x] Verification gate exercises the cut-off on both sides on a real device
- [x] No fixture in this phase is pinned to a written date — plan.md and tasks.md both require them relative to `Date.now()` in a fixed test zone
- [x] No new package on either side; exercise ordering uses the Flutter SDK's own widget

## Notes

- Validation run 2026-09-05: all items pass.
- Revised 2026-09-06 after the cross-phase analysis pass: FR-014…FR-018 added for the
  session reminder, the chat intents, the onboarding step, the coach's training line and
  the missed rule; the materialiser gained program filling, its idempotency key, the
  `SessionScheduled` announcement and the `profile.PreferencesChanged` trigger; the
  backend sync adapters, the athlete-profile bootstrap and the sessions chat card were
  tasked. The handler for `knowledge.SuggestionAccepted` is deliberately left to P7,
  where the event that feeds it is raised; plan.md records that and the four other
  decisions the analysis did not settle.

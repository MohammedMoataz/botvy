# Specification Quality Checklist: Chrome Extension (P9)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-05
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details — spec.md never names Dexie, MV3, WXT or Socket.IO
- [x] Focused on user value — Botvy beside the work, capture in one action
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers — Chrome only, panel as the surface, no push channel in the extension, store submission optional, reachability assumption, all stated
- [x] Requirements testable and unambiguous — FR-001…FR-015; the qualifiers that were vague now carry numbers (offline repair at the deleted-item horizon, out of step past five minutes, five attempts, 120-character titles, a warm profile defined in SC-004)
- [x] Success criteria measurable — SC-001…SC-006, SC-006 rewritten so it is verified here rather than by a reviewer
- [x] Success criteria technology-agnostic
- [x] All acceptance scenarios defined — 5 stories, each with an independent test
- [x] Edge cases identified — suspension, a cache older than the deleted-item horizon, second profile, private window, unreachable Botvy, long selection, a changed time zone or language
- [x] Scope clearly bounded — no chat, no new-tab page, no other stores; store submission named as optional in this phase
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes
- [x] No implementation details leak into specification

## Phase-specific

- [x] plan.md carries the constitution check (v2.1.1) and justifies the redundant liveness paths and the optional host permission
- [x] Every FR maps to a task (001 → T930/T931, 002 → T932, 003 → T940/T941, 004 → T920, 005 → T921/T932, 006 → T912/T920, 007 → T921/T933, 008 → T950, 009 → T952, 010 → T911, 011 → T951, 012 → T951, 013 → T903/T953, 014 → T935, 015 → T920)
- [x] Every SC maps to a task (001 → T920/T960, 002 → T901/T960, 003 → T940/T941, 004 → T912/T930, 005 → T952, 006 → T951/T961)
- [x] Sync rules are reused from the shared package rather than reimplemented for the browser
- [x] The member's time zone and language have a named source (T953, over the query channel) — the sync subset the blueprint fixes for the extension does not carry the profile and was not widened to get it
- [x] The token lifecycle is written down and tested — refresh on waking, refresh and reconnect on expiry, sign-in prompt only on a failed refresh (plan.md, T950)
- [x] Sign-out ends the session on the server and removes the device before clearing locally (T952)
- [x] Every branch has a unit test named beside it; Playwright is left to the flows (T901, T902, T903, T940, T950, T952)
- [x] Verification gate includes the capture step from the blueprint's P9 gate, a clean-profile permission check, and a storage inspection after sign-out
- [x] Fixed values are each declared a constant or an operator key, with a reason (plan.md, "Fixed values")

## Notes

- Validation run 2026-09-05: all items pass.
- Remediation 2026-09-06: FR-013…FR-015 added (the member's own day, English and
  Arabic, the desktop alert notice); FR-002, FR-003, FR-005, FR-007, FR-008 and FR-009
  reworded; two acceptance scenarios added for the offline conflict and the exhausted
  row; the sign-in work moved ahead of the panel and capture; the capability probe
  dropped (Knowledge ships in P7 of the same deployment) and its task with it.

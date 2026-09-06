# Specification Quality Checklist: Foundation (P0)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-05
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — spec.md speaks of "identity store", "product store", "automation tool", "edge"; names land in plan.md/research.md
- [x] Focused on user value and business needs — Owner and Developer journeys; v1 continuity for phones in use
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — the two open points (identity database reuse, phone side-by-side id) resolved as F-02 and F-07 with the blueprint's assumptions
- [x] Requirements are testable and unambiguous — FR-001…FR-020 each observable
- [x] Success criteria are measurable, and a task produces each number — `verify.mjs`
      prints the elapsed seconds (SC-001), the Phase 4 independent test is wall-clock
      timed (SC-002), every CI job carries `timeout-minutes: 15` (SC-003), the spine
      spec runs SC-004's twenty attempts
- [x] Success criteria are technology-agnostic
- [x] Success criteria do not contradict the requirements they measure — SC-004 asks
      for one execution after the subscriber deduplicates, which is what FR-010's
      at-least-once delivery can actually promise
- [x] All acceptance scenarios are defined — 5 stories, Given/When/Then, each with an
      Independent Test
- [x] Edge cases are identified — first start of the product store, existing v1
      tables, port collisions, push absent vs unreadable at boot vs unreadable later,
      automation tool down
- [x] Scope is clearly bounded — Out of scope names the next phase
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Phase-specific

- [x] plan.md carries the twelve-row constitution check against v2.1.1 (repository ports in IX)
- [x] Every hard-coded number is declared constant-or-registry-key in plan.md §Constants and keys (XII)
- [x] Every requirement maps to at least one task, and every branchy task to a spec (VII)
- [x] Verification gate lists concrete commands and expected output

## Requirement → task map

| Requirement | Tasks |
|---|---|
| FR-001 stack from one declaration, one public port | T040, T044 |
| FR-002 env validated at start | T010 |
| FR-003 bootstrap, idempotent | T028 (both seeds), T043, T044 (re-run assertion) |
| FR-004 product store transactional from first start | T040 |
| FR-005 nightly backup of each store, retention, restore | T040, T041, T090 |
| FR-006 health page | T024, T029 |
| FR-007 heartbeats, stale at 15 min | T018, T024, T072 |
| FR-008 one machine-readable record per log line | T011 |
| FR-009 three channels, one credential check, three principal kinds | T020, T025, T026, T027 |
| FR-010 outbox in-transaction, at-least-once, dedupe on event id | T013, T015–T018, T017b, T043 (`ping_echo` dedupe), T074 |
| FR-011 settings registry, `readOnly` | T019, T029 |
| FR-012 demonstration command | T070–T074 |
| FR-013 three surfaces, sign-in, en/ar RTL | T004, T051, T052, T053 |
| FR-014 one shared client library and generated types | T031, T050, T054 |
| FR-015 phone database with sync columns and a ladder test | T053 |
| FR-016 CI lints, builds and tests every surface | T060 |
| FR-017 release tag → images, installer, package, deploy-or-skip | T061, T062 |
| FR-018 v1 under `legacy/`, runnable | T001, T080, T081 |
| FR-019 shared time, model-server and media services | T012, T021, T022, T023 |
| FR-020 append-only audit trail and the port to write it | T029 |
| SC-001 up + bootstrap + ok under 5 min | T044, gate 1 |
| SC-002 dev loop under 20 min | Phase 4 independent test, gate 6 |
| SC-003 PR checks under 15 min | T060, gate 4 |
| SC-004 20 attempts, ≤10 s, one execution after dedupe | T074, gate 3 |
| SC-005 stopped job stale within 15 min | T024, gate 3 |
| SC-006 v1 starts from `legacy/` unedited | T080, gate 5 |

## Notes

- Validation run 2026-09-05: all items pass. Next: `/speckit-analyze` on this folder, then `/speckit-implement` (implementation not yet authorised — awaiting the owner's go).
- Remediation pass 2026-09-06 (`/speckit-analyze` findings U1–U4, I1–I7, G1–G5, C1–C4, O1, D1, A1 and cross-phase X7): the `n8n` service client is seeded by the backend and only verified by `bootstrap.mjs`; FR-004 and the platform names left `spec.md`; SC-004 and FR-010 now agree; the settings registry carries every blueprint key with a `readOnly` flag; `audit_log`, `idempotency_keys` and `DevicesQuery` are defined; the branchy paths that had only a manual gate have specs.

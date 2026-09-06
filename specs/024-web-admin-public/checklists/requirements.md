# Specification Quality Checklist: Web — Admin & Public (P10)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-05
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details — spec.md never names Next.js, GraphQL or PrimeReact
- [x] Focused on user value — one place to run it, one place to explain it
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers — few administrators, content-only site, downloads from release artefacts, tokens not money, all stated
- [x] Requirements testable and unambiguous — FR-001…FR-014; the phone width is 360 px
      rather than "phone-sized"
- [x] Success criteria measurable — SC-001…SC-006; SC-004 counts steps from the
      overview and SC-005 names an automated audit per page
- [x] Success criteria technology-agnostic
- [x] All acceptance scenarios defined — 7 stories
- [x] Edge cases identified — self-ban, last administrator, setting changed mid-run, automation unreachable, member deleted underfoot, API down
- [x] Scope clearly bounded — no member-data editing, no impersonation, no analytics
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes
- [x] No implementation details leak into specification

## Phase-specific

- [x] plan.md carries the constitution check (v2.1.1) and justifies the schema-driven form and live heartbeats
- [x] Every FR maps to a task (001 → T1020, 002 → T1020, 003 → T1021, 004 → T1001, 005 → T1002/T1026, 006-007 → T1022, 008 → T1023, 009 → T1023, 010 → T1024, 011 → T1004/T1025, 012 → T1030, 013 → T1031/T1042, 014 → T1010)
- [x] Every SC maps to a check (001 → T1040 stale-job case, 002 → T1040, 003 → T1005, 004 → T1040 step count, 005 → T1041, 006 → T1042)
- [x] The settings page derives itself from the registry, so later phases add keys without interface work
- [x] Every screen this phase draws is fed by a contract that already declares what it needs — `Setting.schema`/`readOnly`, `User.deviceCount`, `Health.defaultAdminPassword`, `usage(byMember:)`, the `audit` query, `DELETE /admin/knowledge/:linkId`
- [x] Screens that earlier phases delivered are tasked as extensions, not as new work — users, devices, service clients, the default-password warning, the ingestion queue
- [x] Verification gate includes an audit of the public pages, the two refusal paths, and the end-to-end suite running in CI

## Notes

- Validation run 2026-09-05: all items pass.
- Re-validated 2026-09-06 after the analysis pass. Changes: the history sentence now
  matches what P1 and P7 shipped; FR-006/007 point at the setting's own published rule
  and its read-only marking; FR-014, SC-004 and SC-005 became measurable; the banned
  member's notifications moved to P2, which owns them (plan.md); service clients are
  unchanged since P1 and so carry no requirement here; the event-forwarding slices were
  dropped in favour of the registry key they already are.

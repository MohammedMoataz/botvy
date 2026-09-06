# Specification Quality Checklist: Identity & Profile (P1)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-05
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details — spec.md says "session credential", "renewal credential", "session chain" and "machine credential"; the words access token, refresh token, JWT, argon2 and Prisma appear nowhere in it (grepped)
- [x] Focused on user value — a way in, and a member the coach can know
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — Google-link policy, photo scope and v1 profile carry-over resolved in Assumptions and plan.md
- [x] Requirements testable and unambiguous — FR-000…FR-015, each with a number where one was owed (15 minutes in FR-004, 5 seconds in US4-AS1)
- [x] Success criteria measurable — SC-001…SC-006
- [x] Success criteria technology-agnostic
- [x] All acceptance scenarios defined — 6 stories
- [x] Edge cases identified — travel, Google/email collision, oversized photo, double submit, deletion, default password
- [x] Scope clearly bounded — Out of scope names the two pinned chats (they arrive with the daily rhythm phase), 2FA, passkeys, email recovery
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes
- [x] No implementation details leak into specification

## Phase-specific

- [x] plan.md carries the constitution check against v2.1.1 and justifies its two deviations
- [x] Every FR maps to a task (FR-000→T146, 001→T110, 002→T111, 003→T112, 004→T113, 005→T114, 006→T110/T144, 007→T111/T115, 008→T120/T123, 009→T125, 010→T123, 011→T122/T124, 012→T122/T126, 013→T130/T131, 014→T111/T130/T132, 015→T118/T144)
- [x] Repository ports used for every store access; no driver import outside `infrastructure/`; the only reader of a v1 table is the one-off import script of T127
- [x] Every operator-tunable value is a registry key P0 registered and this phase reads by name — `defaults.*` in T122/T124, `auth.registrationOpen` in T110/T144; no hard-coded default
- [x] Every contract event this phase produces is raised by a task and asserted in its spec — `identity.UserRegistered` (T110), `PasswordChanged` (T114), `DeviceRegistered`/`DeviceRemoved` (T115), `UserDeleted` (T116), `UserBanned`/`UserUnbanned` (T130/T132), `profile.ProfileUpdated` (T123), `profile.PreferencesChanged` (T124)
- [x] Verification gate lists commands and the manual checks that cannot be automated yet, including Google sign-in on phone and extension and the RTL screenshots

## Notes

- Validation run 2026-09-05: all items pass.
- Re-validated 2026-09-06 after the analysis pass: the pinned-chat promise moved out
  of FR-012 and into Out of scope, registration became a registry key, the v1 import
  became a script, and the credential vocabulary was made member-facing. All items
  still pass.

# Specification Quality Checklist: Tasks, Labels, Reminders (P2)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-05
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details — spec.md says "advance warnings", "the server's fallback", never FCM, MongoDB or rrule
- [x] Focused on user value — the daily list and alarms that arrive on time
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers — one label per task, sub-tasks out of scope, natural language deferred to P4, all stated
- [x] Requirements testable and unambiguous — FR-001…FR-020; "an alert the system generated" is defined once, above FR-011, and FR-014 and US6-1 both read against that definition
- [x] Success criteria measurable — SC-001…SC-006 with numbers; SC-005 is measured by T245's seeded 2,000-row render timing and SC-006 is timed by hand at the gate, which the gate says
- [x] Success criteria technology-agnostic
- [x] All acceptance scenarios defined — 7 stories
- [x] Edge cases identified — past moment (with the moment it is offered instead named), DST gap, exact-alarm permission, alarm cap, refused change
- [x] Scope clearly bounded
- [x] Dependencies and assumptions identified — the shared deletion horizon is called out explicitly

## Feature Readiness

- [x] All functional requirements have acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes
- [x] No implementation details leak into specification

## Phase-specific

- [x] plan.md carries the constitution check (v2.1.1) and justifies both deviations
- [x] Every FR maps to a task (001-008 → T200–T206/T243, 009-010 → T210/T211/T244, 011 → T242, 012 → T222, 013 → T221, 014 → T221/T221a/T242, 015 → T242, 016-020 → T230–T232/T241/T246)
- [x] Alert pipeline and sync protocol match the blueprint contracts rather than restating them
- [x] No cross-context write survives — the sweep's tombstone purge and token reaping and the sync facade's device touch are `CommandBus` dispatches (T222, T231), and the Constitution Check's principle I row says so
- [x] Every event the blueprint has this phase consume has a handler — `profile.ProfileUpdated`/`PreferencesChanged`, `identity.UserBanned`/`UserUnbanned`/`DeviceRegistered`/`DeviceRemoved` (T221a) — and `notifications.AlertSent`/`AlertFailed`, which later phases listen for, has an emitter (T222)
- [x] The cross-context queries later phases call are declared here — `TasksDueQuery`, `TasksOpenBeforeQuery` on the `QueryBus` (T207)
- [x] Every mandated test has an owner — recurrence and the conflict table (T203/T231), the `pendingOp` filter and alarm-plan parity (T246), deleting keeps the status (T203), the partial unique index (T204)
- [x] The four settings keys this phase reads are named, not hard-coded — `labels.palette` (T204), `notifications.sweepBatch`/`expiryHours` and `reminders.tombstoneDays` (T222, T231); all four are registered in P0
- [x] The demonstration slice from P0 has a removal task (T260)

## Notes

- Validation run 2026-09-05: all items pass.
- Re-validated 2026-09-06 after the cross-phase remediation pass: the quiet-hours
  definition, the `CommandBus` hops, the Planning query handlers, Profile's sync
  adapters, the mandated-test owners and the two unmeasured success criteria were the
  gaps; all are closed above. Task ids stay phase-local and unrenumbered.

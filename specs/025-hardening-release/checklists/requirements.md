# Specification Quality Checklist: Hardening & Release (P11)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-05
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details — spec.md speaks of backups, findings and archives, never mongodump or Actions
- [x] Focused on user value — being able to rely on it
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers — the accepted default-password trade, the archive definition and the import's scope are stated
- [x] Requirements testable and unambiguous — FR-001…FR-013; what makes a backup verifiable and what the security review must cover are both enumerated rather than implied
- [x] Success criteria measurable — SC-001…SC-008
- [x] Success criteria technology-agnostic
- [x] All acceptance scenarios defined — 6 stories
- [x] Edge cases identified — different machine, untested backup, banned member, readable archive, unfixable finding; each now has a requirement or a task behind it (FR-012 for the banned member, T1102's different-machine section for the first)
- [x] Scope clearly bounded — no external test, no high availability, no scheduled drills
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes
- [x] No implementation details leak into specification

## Phase-specific

- [x] plan.md carries the constitution check (v2.1.1); Complexity Tracking records no deviations, the two entries it used to hold being compliances rather than departures
- [x] Every FR maps to a task (001 → T1101/T1104, 002 → T1103, 003 → T1103, 004 → T1110/T1111/T1114/T1115, 005 → T1113, 006 → T1112, 007 → T1120–T1124, 008 → T1130/T1131, 009 → T1140/T1143, 010 → T1150/T1151/T1153, 011 → T1142, 012 → T1120/T1121, 013 → T1140/T1143)
- [x] Every SC maps to a task (001 → T1103, 002 → T1112, 003 → T1111, 004 → T1120–T1124, 005 → T1143, 006 → T1150/T1151, 007 → T1154, 008 → T1152)
- [x] Nothing is removed before parity is proven, and the order is enforced by the task dependencies
- [x] Publishing precedes the fresh-install rehearsal, which precedes the deploy — the rehearsal installs what was published, so it cannot come first
- [x] The gate requires performed rehearsals, not written intentions, and every item names a command whose output is recorded

## Notes

- Validation run 2026-09-05: all items pass. This phase closes the v2 blueprint.
- Remediation pass 2026-09-06: the security review's items enumerated against
  constitution VI, the publish/rehearse/deploy order corrected, rollback and the
  seven-day soak added, the backup keys moved to `backup.retentionDays` /
  `backup.staleHours` with the read-only `ops.lastBackupAt`, and the plan's input list
  corrected. Re-validated: all items still pass.

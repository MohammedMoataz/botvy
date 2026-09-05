# Tasks: Hardening & Release (P11)

**Input**: `spec.md`, `plan.md`; every earlier phase's success criteria.

**Tests**: the restore is performed, not described; the measurements are run.

## Phase 1 — Backups (US1)

- [ ] T1101 Nightly backup of both stores and the media volume into a dated directory outside the compose project; retention from `ops.backupRetentionDays` (default 14); `infra/backup.sh` and its compose service
- [ ] T1102 [P] `docs/restore.md` — the full procedure including the secret set that must accompany the archives (both signing secrets, the service token, the automation webhook secret, the automation tool's encryption key)
- [ ] T1103 **The rehearsal**: on a clean machine, following `docs/restore.md` only, restore and start; confirm health, sign in as an existing member, confirm their data, and confirm a phone last synced before the backup reconciles to a complete picture; record the elapsed time and every correction the procedure needed
- [ ] T1104 [P] Registry key `ops.backupRetentionDays`; the overview shows the last successful backup and marks it stale after 48 hours

## Phase 2 — Security review (US2)

- [ ] T1110 Write `docs/security-review.md` covering: the published surface, every credential and what it alone allows, rate limits on every entry point including the socket, the media and fetcher guards, log content, dependency advisories, and the default administrator password
- [ ] T1111 Fix each finding as a task in its own context; record any accepted risk with an explicit decision and reason
- [ ] T1112 [P] Log scrubbing pass: sample a day of logs and confirm no password, token or member content; add redaction where needed
- [ ] T1113 **Rotate the inherited exposed key**: issue a new service-account key, delete the old one at the provider, install the new one, verify notifications still arrive, confirm the old key no longer works, and update `secrets/README.md`
- [ ] T1114 [P] Rate limits verified per entry point (REST, GraphQL, socket, internal) with a spec each

## Phase 3 — Retiring v1 (US3)

- [ ] T1120 `docs/parity.md` — every old capability named against its new equivalent, checked off with evidence
- [ ] T1121 Move remaining members: tell them what changed, point them at the new build, confirm each signs in
- [ ] T1122 Stop the old stack; archive its database dump and data volumes outside the repository; record where
- [ ] T1123 Remove `legacy/` in one commit; confirm the build, tests and images are green without it
- [ ] T1124 Migration dropping the v1 tables from the identity database, only after T1122; the `LegacyProfileReader` from P1 removed with it

## Phase 4 — Optional import (US4)

- [ ] T1130 [P] `infra/import-v1.mjs` — read the archived v1 reminders and conversations, create them through the API's commands with an `importedFrom` marker and original timestamps mapped through each member's zone; idempotent on the v1 identifier
- [ ] T1131 [P] Run it if the Owner wants it; verify a member's history and that a second run changes nothing; delete the script afterwards

## Phase 5 — Documentation and release (US5)

- [ ] T1140 `SETUP.md` rewritten for someone who did not build the system: prerequisites, environment contract, run, bootstrap, verification table, backups, tunnel, and changing the administrator password as the first step
- [ ] T1141 [P] `README.md`, `CLAUDE.md` paths refreshed after the `legacy/` removal, `docs/` index
- [ ] T1142 **Fresh-install rehearsal**: a clean machine, the published release and `SETUP.md` only, to a healthy system; record the elapsed time
- [ ] T1143 Tag `v2.0.0`: both images to the registry, the app and the extension published as release assets together; the deploy job runs against the host

## Phase 6 — Measurement (US6)

- [ ] T1150 Run every success criterion from P0–P10 against the released system and record the result here, criterion by criterion
- [ ] T1151 [P] Anything missed: record what it was, why, and what will be done, as a follow-up note rather than a silent omission
- [ ] T1152 Close the blueprint: mark `specs/013-platform-v2-blueprint/tasks.md` phases complete with links to each phase's evidence

## Dependencies

T1101 → T1102 → T1103. T1110 → T1111 → T1112/T1113/T1114. T1120 → T1121 → T1122 →
T1123 → T1124. T1130 needs T1122's archive. T1140 → T1142 → T1143 → T1150.

## Verification gate

1. The restore rehearsal succeeded following the written procedure only, in under 30
   minutes; the record is in this file.
2. Every review finding is fixed or recorded with an accepted decision; the log sample
   is clean; the inherited key is replaced and the old one confirmed dead.
3. The parity checklist is complete, the old stack is off, its data archived,
   `legacy/` removed, and the build green without it.
4. A person following `SETUP.md` alone reached a healthy system from the published
   release in under 30 minutes.
5. `v2.0.0` published with images, app and extension together.
6. Every stated outcome from P0–P10 has a recorded measurement in this file.

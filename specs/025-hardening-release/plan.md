# Implementation Plan: Hardening & Release (P11)

**Branch**: `025-hardening-release` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/025-hardening-release/spec.md`; blueprint `quickstart.md`, research
R-04 (backups), R-27 (release), F-01/F-02 (the legacy tree and the shared identity
database); `legacy/secrets/README.md` (the exposed key).

## Summary

No new product surface. This phase proves the operational properties the platform has
been asserting: backups that restore, a reviewed attack surface, a rotated credential,
documentation someone else can follow, the old system deliberately retired, and a
measured release.

## Technical Context

**Primary Dependencies**: none new; `mongodump`/`mongorestore`, `pg_dump`/`pg_restore`,
GitHub Actions from P0

**Storage**: both stores plus the media volume; archives outside the repository

**Testing**: a restore rehearsal on a clean machine or a fresh VM; a log sample
scanned by pattern; the measurement run for every stated outcome

**Performance Goals**: restore under 30 minutes; setup under 30 minutes

**Constraints**: nothing is removed before parity is proven; every accepted risk is
written down rather than assumed

**Scale/Scope**: ~15 infrastructure and documentation files, ~6 backend changes from
review findings, one import script if the Owner wants it

## Constitution Check (v2.1.1)

| Principle | Status | How |
|---|---|---|
| I. API owns data | PASS | The import script runs through the API's own commands, not by writing to stores directly |
| II. n8n | PASS | Its encryption key is part of the backup set and the restore procedure |
| III. Local-first LLM | PASS | Unchanged |
| IV. Forward-only migrations | PASS | Removing the legacy tables is a new migration, and only after the archive exists |
| V. Single public surface | PASS | The review's first item is confirming exactly one published port |
| VI. Multi-user, principals | PASS | The review covers every principal kind and the consequence of losing each secret |
| VII. Test-then-verify | PASS | The restore is performed, not described; the measurements are run, not estimated |
| VIII. YAGNI | PASS | No high availability, no scheduled drills, no external test |
| IX. Contexts, slices, ports | PASS | Review findings land as slices in their own contexts |
| X. Commands / queries / streams | PASS | Unchanged |
| XI. Times belong to the user | PASS | The import maps old times through the member's recorded zone |
| XII. Configuration | PASS | Backup schedule and retention are registry keys, not constants |

## Design

### Backups and the restore rehearsal

Nightly: `mongodump --archive --gzip` of the product store, `pg_dump -Fc` of the
identity database, and a copy of the media volume, all into a dated directory kept
outside the compose project. Retention is a registry key (`ops.backupRetentionDays`,
default 14). The secret set that must accompany them — both signing secrets, the
service token, the automation webhook secret and the automation tool's encryption key
— is listed in the procedure, because a backup without them restores data nobody can
sign in to.

The rehearsal is the deliverable: on a clean machine, following
`docs/restore.md` and nothing else, restore both stores and the media, start the
stack, confirm the health page, sign in as an existing member, confirm their tasks and
history, and confirm a phone that has not synced since before the backup reconciles to
a complete picture rather than losing or duplicating rows (the deletion-horizon rule
from the sync contract). The elapsed time and any correction to the procedure are
recorded in `tasks.md`.

### Security review

A written pass over: the published surface (exactly one port, everything else on the
compose network); every credential and what an attacker holding only it could do
(access token, refresh token, service token, automation key, backup archive); rate
limits on each entry point including the socket; the media proxy's guard; the fetcher's
guard from P7; log content; dependency advisories; and the shipped default
administrator password. Each finding becomes a task, is fixed, or is recorded in
`docs/security-review.md` with an explicit accepted decision and a reason.

The inherited exposed service-account key is replaced: a new key issued, the old one
deleted at the provider, the new one placed in the secrets directory, devices verified
to still receive notifications, and the old key confirmed dead.

### Retiring the old system

Parity checklist in `docs/parity.md`: for every capability the old system had —
reminders with lead times and undo, chat with history, the nightly coaching cycle, the
admin surface, push — the new system's equivalent is named and checked off. Only then:
stop the old stack, archive its database dump and its data volumes outside the
repository, remove `legacy/` in a single commit, and add a migration that drops the v1
tables from the identity database (they have sat ignored since P0). Members still on
the old app are told what changed and pointed at the new build.

### Optional import

`infra/import-v1.mjs`, run once by the Owner if they want history: reads the archived
v1 reminders and conversations, and creates them through the API's commands with an
`importedFrom` marker and the original timestamps, mapping times through each member's
recorded zone. Idempotent on the v1 identifier, so running it twice changes nothing.
It is a script, not a feature, and it is deleted after use.

### Documentation and release

`SETUP.md` rewritten for someone who did not build the system: prerequisites, the
environment contract, the run, the bootstrap, the verification table, backups, the
tunnel, and the first step of changing the administrator password. `README.md` for the
repository. `docs/restore.md`, `docs/security-review.md`, `docs/parity.md`. The release
tags `v2.0.0`, publishing both images, the app and the extension together.

### Measurement

Every success criterion stated across phases P0–P10 is run against the released system
and recorded in this phase's `tasks.md`, with anything missed carried into a follow-up
note rather than quietly dropped.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| The import writes through the API rather than the stores | Constitution I; it also gets validation, events and alerts for free | Direct writes would bypass every rule the platform is built on and could not raise the events that plan alerts |
| Keeping the archive outside the repository | Member data must not enter version control | Committing a dump (unreviewable, unremovable, and a leak) |

## Verification gate

```powershell
# the rehearsal, on a clean machine, following docs/restore.md only
# then, on the restored system:
curl -s http://localhost/health          # healthy, jobs fresh
pnpm -r test; cd apps/mobile; flutter test
# the parity checklist complete, legacy/ removed, the build green without it
# the exposed key replaced and the old one confirmed dead
# every stated outcome measured and recorded in tasks.md
```

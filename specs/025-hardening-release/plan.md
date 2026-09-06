# Implementation Plan: Hardening & Release (P11)

**Branch**: `025-hardening-release` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/025-hardening-release/spec.md`; blueprint `quickstart.md`, research
R-04 (backups) and R-27 (release); the blueprint's `contracts/internal.md` and its
settings registry in `data-model.md`; `secrets/README.md`, which records the exposed
key and is itself outside version control.

## Summary

No new product surface. This phase proves the operational properties the platform has
been asserting: backups that restore, a reviewed attack surface, a rotated credential,
documentation someone else can follow, the old system deliberately retired, and a
measured release.

## Technical Context

**Primary Dependencies**: none new; `mongodump`/`mongorestore`, `pg_dump`/`pg_restore`,
GitHub Actions from P0

**Storage**: both stores plus the media volume; archives outside the repository

**Testing**: a restore rehearsal on a clean machine or a fresh VM; a fresh-install
rehearsal from the published release, phone and extension included; a log sample
scanned by a named pattern set; guard specs for each rule constitution VI states; a
seven-day health soak; the measurement run for every stated outcome

**Performance Goals**: restore under 30 minutes; setup under 30 minutes

**Constraints**: nothing is removed before parity is proven; every accepted risk is
written down rather than assumed

**Scale/Scope**: ~15 infrastructure and documentation files, ~6 backend changes from
review findings, one import script if the Owner wants it

## Constitution Check (v2.1.1)

| Principle | Status | How |
|---|---|---|
| I. API owns data | PASS | The import script and the backup job both reach the API — the import through a scoped internal endpoint, the backup by reporting its outcome to one — and neither writes to a store directly |
| II. n8n | PASS | Its encryption key is part of the backup set and the restore procedure |
| III. Local-first LLM | PASS | Unchanged |
| IV. Forward-only migrations | PASS | Removing the legacy tables is a new migration, and only after the archive exists |
| V. Single public surface | PASS | The review's first item is confirming exactly one published port |
| VI. Multi-user, principals | PASS | The review covers every principal kind and the consequence of losing each secret, and the four guards this principle states — refresh reuse detection, the socket handshake refusing a service token, `/internal/*` refusing a member's, admin routes refusing a member — each get a test rather than a paragraph |
| VII. Test-then-verify | PASS | The restore is performed, not described; the measurements are run, not estimated |
| VIII. YAGNI | PASS | No high availability, no scheduled drills, no external test |
| IX. Contexts, slices, ports | PASS | Review findings land as slices in their own contexts |
| X. Commands / queries / streams | PASS | Unchanged |
| XI. Times belong to the user | PASS | The import maps old times through the member's recorded zone |
| XII. Configuration | PASS | The backup's retention and staleness window are registry keys (`backup.retentionDays`, `backup.staleHours`); the schedule itself is the job's own timer in the compose file, which is a connection detail rather than a knob, and the one thing an operator retunes about it — how long archives are kept, and how late is too late — is a key |

## Design

### Backups and the restore rehearsal

Nightly: `mongodump --archive --gzip` of the product store, `pg_dump -Fc` of the
identity database, and a copy of the media volume, all into a dated directory kept
outside the compose project. Retention is the registry key `backup.retentionDays`
(default 14). The secret set that must accompany them — both signing secrets, the
service token, the automation webhook secret and the automation tool's encryption key
— is listed in the procedure, because a backup without them restores data nobody can
sign in to.

An archive that was written is not yet a backup. Each night the job reads back what it
just wrote: `mongorestore --archive --gzip --dryRun` over the product dump and
`pg_restore -l` over the identity dump, both of which parse the whole file and list its
contents, and a checksum plus a file count over the media copy. A non-zero exit or an
empty listing fails the night, and the failure is what gets reported.

The job runs in its own container, so it cannot write `ops_heartbeats` itself — only
the API writes data (constitution I). It finishes by calling the API's internal surface
with a service-client token, in the shape `contracts/internal.md` already defines for
machine callers: a scoped `POST /internal/backups/report` carrying the outcome, the
archive sizes and the verification result, which is where this phase adds a row to the
internal scope table. The API writes the `backup` heartbeat and the read-only
`ops.lastBackupAt`, and `/health` and the admin overview call it stale once
`backup.staleHours` (default 48) has passed — the same shape as every other job, so a
backup that quietly stops running is visible rather than assumed.

The rehearsal is the deliverable: on a clean machine, following
`docs/restore.md` and nothing else, restore both stores and the media, start the
stack, confirm the health page, sign in as an existing member, confirm their tasks and
history, and confirm a phone that has not synced since before the backup reconciles to
a complete picture rather than losing or duplicating rows (the deletion-horizon rule
from the sync contract). The elapsed time and any correction to the procedure are
recorded in `tasks.md`.

The procedure carries a section for the case the spec's edge cases name: a restore onto
a machine with a different name or address. What changes there is not the data but the
things that named the old machine — the tunnel's hostname and its credential, the
allowed browser origin, the edge's site address, the address the phone and the
extension are pointed at, and the callback address registered with the sign-in
provider. The procedure lists them together so the restorer changes them once rather
than discovering them one failure at a time.

### Rolling back a bad deploy

A release that turns out to be wrong is not undone by editing anything. Both images are
published under an immutable version tag, so a rollback is re-pinning the previous tag
in the host's environment file and recreating the two services; nothing is rebuilt and
nothing is patched in place. The schema does not come back with it: migrations are
forward-only (constitution IV), so the previous release's code runs against the current
schema, which is safe exactly when that release's migrations only added things. Where a
migration removed or narrowed something, there is no rollback — the way back is the
last verified backup and the restore procedure, at the cost of everything written
since, and that is the sentence `docs/restore.md` has to say plainly rather than imply.
The re-pin is exercised once during the deploy so the procedure is known to work before
it is needed.

### Security review

A written pass over: the published surface (exactly one port, everything else on the
compose network, and the automation editor reachable only from that network — never
through the tunnel); the browser origin policy, which names the web app's origin and
nothing else, with credentials allowed only for it; the response headers the edge sets
(HSTS, `X-Content-Type-Options`, a frame policy, a referrer policy, and a content
security policy the web app actually loads under); every credential and what an
attacker holding only it could do (access token, refresh token, service token,
automation key, backup archive); rate limits on each entry point including the socket;
the media proxy's guard; the fetcher's guard from P7; log content; dependency
advisories; and the shipped default administrator password. Each finding becomes a
task, is fixed, or is recorded in `docs/security-review.md` with an explicit accepted
decision and a reason.

Four of those are not paragraphs but guards, and constitution VI states them as rules,
so each gets a test rather than a claim: a refresh token replayed after it has been
rotated is detected and the whole family revoked; a service token offered in the socket
handshake is refused at the handshake rather than after connecting; `/internal/*`
refuses a member's access token; and an admin route refuses a member's. They run
beside the rate-limit specs, in the contexts that own them.

Replacing a machine credential is written down as a procedure rather than performed
once and forgotten: issue a second service client with the same scopes, move the
callers to it, confirm they still work, revoke the first, and confirm the revoked token
is refused. It is the same shape the exposed key's rotation follows, and it is what the
review records under constitution VI.

The log scan is reproducible or it is not a criterion. It reads a full day from the
edge, the backend, the worker, the automation tool and both database containers, plus
the release build's own device log, and greps each for: a JSON Web Token's three
dot-separated base64url segments; `Bearer ` followed by a non-empty value;
`password`, `refreshToken`, `accessToken`, `serviceToken` or `token=` followed by
anything but a redaction marker; an email address; a push registration token's shape;
and a sentence planted in a seeded conversation before the sample began, which is how
member content is looked for rather than guessed at. Every hit is either a redaction
bug to fix or a false positive written down in `docs/security-review.md`.

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
v1 reminders and conversations, and creates them through the API with an
`importedFrom` marker and the original timestamps, mapping times through each member's
recorded zone. Idempotent on the v1 identifier, so running it twice changes nothing.
It is a script, not a feature, and it is deleted after use.

A member's own commands do not accept a caller-supplied time, and they should not: a
phone that decides when something happened is a phone that can rewrite history. So the
import does not use them. It calls a scoped internal endpoint — a machine principal,
the same kind n8n uses — which accepts `originalAt` and `importedFrom` and is the only
path on which either is honoured. Messages stay immutable: an imported message is
appended and takes the next `seq` like any other, so devices pull it through the same
cheap cursor and nothing already on a phone is edited; its place in the member's
history comes from the original time it carries, which is what the conversation view
orders by. That is the one decision the analysis left open, and it is settled this way
because the alternative — writing rows with back-dated sequence numbers — would break
the pull cursor for every device that had already passed them.

### Documentation and release

`SETUP.md` rewritten for someone who did not build the system: prerequisites, the
environment contract, the run, the bootstrap, the verification table, backups, the
tunnel, and the first step of changing the administrator password. The rewrite takes
the deferred-rotation section with it: once the exposed key is replaced there is
nothing left to defer, and a document that still says a live key is compromised is
worse than one that never mentioned it. `README.md` for the repository.
`docs/restore.md`, `docs/security-review.md`, `docs/parity.md`.

Publishing and deploying are two acts, and the fresh-install rehearsal sits between
them. `v2.0.0` is tagged and its artefacts published first — both images to the
registry, the app and the extension as release assets, each carrying that same version
in its own manifest — because the rehearsal installs from the published release and
cannot install from something that does not exist yet. Only after the rehearsal has
passed does the deploy job run against the host, and only then is the tag announced.

The rehearsal ends where the spec's second scenario ends, not at a healthy server: the
published app and the published extension are installed on a clean device and a clean
browser profile and pointed at the freshly installed system. That they can be pointed
at all is a decision, and it is a runtime one rather than a build per installation.
The blueprint already gives the phone a Settings screen carrying the base URL
(blueprint `tasks.md` T103) and P0 already reads that URL from secure storage,
falling back to the value compiled in at build time
(`specs/014-foundation/tasks.md` T053); the extension keeps the same value in its own
extension storage beside its tokens. So the release ships one artefact each, the
compiled-in value is only a convenience for the maintainer's own instance, and an
installer types their address on first run. Building a private app per installation
would mean every installer needs a build toolchain, which contradicts a setup someone
who did not build the system can follow.

### Measurement

Two sets of numbers, and they are not the same set. Every success criterion stated by
phases P0–P10 in their own specs is run against the released system and recorded in
this phase's `tasks.md`. The blueprint's ten — SC-001 registration under three minutes,
SC-002 a task on the phone within ten seconds, SC-003 every reminder firing offline
within sixty seconds, SC-004 the evening and morning prompts within five minutes,
SC-005 no suggestion containing a declared allergen, SC-006 the first streamed token
within five seconds, SC-007 an article done within three minutes, SC-008 a stalled job
visible within fifteen minutes, SC-009 every member screen passing right-to-left
review, and SC-010 a member changing every named default without help — are measured as
one table, and that table is written into
`specs/013-platform-v2-blueprint/tasks.md` where the blueprint says it belongs, with a
copy here so this phase's record is self-contained. Anything missed is carried into a
follow-up note rather than quietly dropped.

SC-009 is the one that has never been checked whole. Each phase reviewed its own new
screens in Arabic; nobody has walked the released build end to end. This phase does
that sweep once, across every member-facing screen on the phone, the web app and the
extension, and records it with the rest.

## Complexity Tracking

No deviations. Everything this phase does — importing through the API rather than the stores,
keeping the archive out of version control, dropping the v1 tables with a new migration
rather than an edited one — is what the constitution already requires, and a compliance
recorded as a violation only makes the next reader distrust the table.

## Verification gate

```powershell
# the rehearsal, on a clean machine, following docs/restore.md only; then, on it:
curl -s http://localhost/health | ConvertFrom-Json     # ok; every job fresh; backup fresh
pnpm -r test; cd apps/mobile; flutter test
# exactly one published port, and it is not on 0.0.0.0 for anything but the edge
docker compose config --format json | ConvertFrom-Json | % { $_.services.PSObject.Properties | ? { $_.Value.ports } | % { "$($_.Name): $($_.Value.ports)" } }
# forward-only history on both stores: nothing pending, nothing modified after apply
pnpm --filter @botvy/backend exec prisma migrate status
pnpm --filter @botvy/backend exec migrate-mongo status
# the old push credential is dead: a send with it must fail with an auth error
node infra/verify-old-key-dead.mjs                     # expects 401/403, fails on success
# the rollback, exercised once: previous tag re-pinned, services recreated, then forward
docker compose --env-file .env.host up -d --force-recreate backend worker
# the seven-day soak: one sample a day, appended, all healthy and all jobs fresh
Get-Content ops/soak-v2.0.0.log                        # 7 rows
# the parity checklist complete, legacy/ removed, the build green without it
# v2.0.0 published before the fresh-install rehearsal, deployed after it
# every stated outcome measured, and the right-to-left sweep recorded,
# here and in the blueprint's tasks.md
```

# Tasks: Hardening & Release (P11)

**Input**: `spec.md`, `plan.md`; every earlier phase's success criteria.

**Tests**: the restore is performed, not described; the measurements are run.

**Task ids** are local to this phase. The blueprint's `tasks.md` runs its own `T###`
series for the same phase, and the two do not correspond — a `T1102` there is not a
`T1102` here.

## Phase 1 — Backups (US1)

- [ ] T1101 Nightly backup of both stores and the media volume into a dated directory outside the compose project; retention from `backup.retentionDays`; `infra/backup.sh` and its compose service. Every archive is verified before the night is called good — `mongorestore --archive --gzip --dryRun`, `pg_restore -l`, and a checksum plus file count over the media copy — and the script ends by reporting the outcome to `POST /internal/backups/report` with the service-client token, because a container outside the API cannot write a heartbeat itself
- [ ] T1102 [P] `docs/restore.md` — the full procedure including the secret set that must accompany the archives (both signing secrets, the service token, the automation webhook secret, the automation tool's encryption key); a section **Restoring onto a different machine** naming everything that carried the old machine's name (tunnel hostname and credential, allowed browser origin, edge site address, the address the app and the extension are pointed at, the sign-in provider's callback); and a section **Rolling back a release** stating that a rollback re-pins the previous immutable image tag and recreates the two services, that the schema is never rolled back so the previous code runs against the current schema and is safe only where that release's migrations were additive, and that where they were not, restoring the last verified backup is the only way back and costs everything written since
- [ ] T1103 **The rehearsal**: on a clean machine, following `docs/restore.md` only, restore and start; confirm health, sign in as an existing member, confirm their data, and confirm a phone last synced before the backup reconciles to a complete picture; record the elapsed time and every correction the procedure needed
- [ ] T1104 [P] Registry keys `backup.retentionDays` (14) and `backup.staleHours` (48), both editable, plus the system-written read-only `ops.lastBackupAt`; `POST /internal/backups/report` writes the `backup` heartbeat and that key, and `/health` and the admin overview call the backup stale once `backup.staleHours` has passed

## Phase 2 — Security review (US2)

- [ ] T1110 Write `docs/security-review.md` covering, item by item: exactly one published port with everything else on the compose network; the automation editor reachable only from that network and never through the tunnel; the browser origin policy naming the web app's origin and nothing else, with credentials allowed only for it; the response headers the edge sets (HSTS, `X-Content-Type-Options`, frame, referrer and content-security policies); every credential and what an attacker holding it alone could do; rate limits on every entry point including the socket; the media and fetcher guards; log content; dependency advisories; the default administrator password; and the written procedure for replacing a machine credential without downtime (issue a second service client with the same scopes, move the callers, confirm, revoke the first, confirm the revoked token is refused)
- [ ] T1111 Fix each finding as a task in its own context; record any accepted risk with an explicit decision and reason
- [ ] T1112 [P] Log scrubbing pass over a full day from the edge, the backend, the worker, the automation tool, both database containers and the release build's own device log, grepped for: a JSON Web Token's three dot-separated base64url segments; `Bearer ` followed by a non-empty value; `password`, `refreshToken`, `accessToken`, `serviceToken` or `token=` followed by anything but a redaction marker; an email address; a push registration token's shape; and a sentence planted in a seeded conversation before the sample began, which is how member content is searched for rather than guessed at. Every hit is a redaction to add or a false positive written down in `docs/security-review.md`
- [ ] T1113 **Rotate the inherited exposed key**: issue a new service-account key, delete the old one at the provider, install the new one, verify notifications still arrive, confirm the old key no longer works, update `secrets/README.md`, and delete the deferred-rotation section from `SETUP.md` together with its entry in the contents — nothing is deferred once this task is done, and a document still calling a live key compromised is worse than one that never raised it
- [ ] T1114 [P] Rate limits verified per entry point (REST, GraphQL, socket, internal) with a spec each
- [ ] T1115 [P] Guard specs, one per rule constitution VI states, in the context that owns each: a refresh token replayed after rotation is detected and its whole family revoked; a service token offered in the socket handshake is refused at the handshake, not after connecting; `/internal/*` refuses a member's access token; an admin route refuses a member's

## Phase 3 — Retiring v1 (US3)

- [ ] T1120 `docs/parity.md` — every old capability named against its new equivalent, checked off with evidence, including that a member banned in the old system is still banned in the new one: name each of them, confirm the new system refuses their sign-in, and record it
- [ ] T1121 Move remaining members: tell them what changed, point them at the new build, confirm each signs in — and that each member the old system had banned still cannot
- [ ] T1122 Stop the old stack; archive its database dump and data volumes outside the repository; record where
- [ ] T1123 Remove `legacy/` in one commit; confirm the build, tests and images are green without it
- [ ] T1124 Migration dropping the v1 tables from the identity database, only after T1122; the `LegacyProfileReader` from P1 removed with it

## Phase 4 — Optional import (US4)

- [ ] T1130 [P] `infra/import-v1.mjs` — read the archived v1 reminders and conversations and create them through the API, calling a scoped internal endpoint as a machine principal rather than the member commands, which do not accept a caller-supplied time and must not start; that endpoint is the only path on which `originalAt` and `importedFrom` are honoured. An imported message is appended and takes the next `seq` like any other, so nothing already on a phone is edited and the pull cursor still works; its place in the history comes from the original time it carries. Times map through each member's recorded zone; idempotent on the v1 identifier
- [ ] T1131 [P] Run it if the Owner wants it; verify a member's history and that a second run changes nothing; delete the script afterwards

## Phase 5 — Documentation and release (US5)

- [ ] T1140 `SETUP.md` rewritten for someone who did not build the system: prerequisites, environment contract, run, bootstrap, verification table, backups, tunnel, pointing the app and the extension at their own address, and changing the administrator password as the first step
- [ ] T1141 [P] `README.md`, `CLAUDE.md` paths refreshed after the `legacy/` removal, `docs/` index
- [ ] T1142 **Publish `v2.0.0`**: tag, both images to the registry, the app and the extension as release assets, each carrying `2.0.0` in its own manifest — the app's version name and code, the extension's manifest version — so all four artefacts name the same release. Publishing comes first because the rehearsal installs from it
- [ ] T1143 **Fresh-install rehearsal**: a clean machine, the published release and `SETUP.md` only, to a healthy system; then the published app on a clean device and the published extension on a clean browser profile, each pointed at that system's address and signed in; record the elapsed time
- [ ] T1144 Deploy the published tag to the host, and exercise the rollback once: re-pin the previous image tag in the host's environment file, recreate the two services, confirm the system comes up, re-pin forward again, and record both directions

## Phase 6 — Measurement (US6)

- [ ] T1150 Run every success criterion each phase P0–P10 stated in its own spec against the released system and record the result here, criterion by criterion
- [ ] T1151 Measure the blueprint's ten as one table — SC-001 registration under three minutes, SC-002 a task on the phone within ten seconds, SC-003 every reminder firing offline within sixty seconds, SC-004 evening and morning prompts within five minutes, SC-005 no suggestion containing a declared allergen, SC-006 the first streamed token within five seconds, SC-007 an article done within three minutes, SC-008 a stalled job visible within fifteen minutes, SC-009 right-to-left review, SC-010 a member changing every named default without help — writing the measured table into `specs/013-platform-v2-blueprint/tasks.md` where the blueprint asks for it, with a copy here
- [ ] T1152 [P] Right-to-left sweep for SC-009: walk every member-facing screen of the released build in Arabic — the phone, the web app and the extension — and record the pass, since each phase has only ever reviewed its own new screens
- [ ] T1153 [P] Anything missed: record what it was, why, and what will be done, as a follow-up note rather than a silent omission
- [ ] T1154 **Seven-day soak**: once a day for seven consecutive days after the deploy, append a `/health` sample to `ops/soak-v2.0.0.log` and confirm it reads healthy with every job — including the backup — fresh; the seven rows are the record
- [ ] T1155 Close the blueprint: mark `specs/013-platform-v2-blueprint/tasks.md` phases complete with links to each phase's evidence

## Dependencies

T1101 → T1102 → T1103. T1104 → T1101 (the keys and the report endpoint before the job
that reads and calls them). T1110 → T1111 → T1112/T1113/T1114/T1115. T1120 → T1121 →
T1122 → T1123 → T1124. T1130 needs T1122's archive. T1140 → T1142 (publish) → T1143
(the rehearsal, which installs what T1142 published) → T1144 (deploy) → T1150/T1151 →
T1154 (seven days from the deploy) → T1155.

## Verification gate

1. The restore rehearsal succeeded following the written procedure only, in under 30
   minutes; the record is in this file, and on the restored system
   `curl -s http://localhost/health` reads ok with every job — including `backup` —
   fresh.
2. Every review finding is fixed or recorded with an accepted decision; the log sample
   is clean; `pnpm --filter @botvy/backend test` is green including the four guard
   specs (refresh reuse, socket handshake, `/internal/*`, admin role) and the rate-limit
   specs.
3. Exactly one container publishes a port, and it is the edge:
   `docker compose config --format json | ConvertFrom-Json` listed for services with
   `ports`, output recorded.
4. The history is forward-only on both stores:
   `pnpm --filter @botvy/backend exec prisma migrate status` and
   `... exec migrate-mongo status` both report everything applied and nothing modified,
   output recorded.
5. The inherited key is replaced and the old one dead: `node infra/verify-old-key-dead.mjs`
   exits non-zero on a successful send and records the provider's rejection.
6. The parity checklist is complete — banned members included — the old stack is off,
   its data archived, `legacy/` removed, and `pnpm -r build; pnpm -r test` green
   without it.
7. `v2.0.0` is published with both images, the app and the extension, all naming the
   same version; a person following `SETUP.md` alone reached a healthy system from that
   published release in under 30 minutes and connected the published app and extension
   to it.
8. The rollback was exercised in both directions and recorded.
9. Seven consecutive daily samples in `ops/soak-v2.0.0.log`, every one healthy with
   every job fresh: `Get-Content ops/soak-v2.0.0.log` shows seven rows.
10. Every stated outcome from P0–P10 has a recorded measurement in this file, and the
    blueprint's SC-001…SC-010 table is filled in
    `specs/013-platform-v2-blueprint/tasks.md`, right-to-left sweep included.

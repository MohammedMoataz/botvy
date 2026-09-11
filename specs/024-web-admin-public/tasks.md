# Tasks: Web — Admin Portal & Public Site (P10)

**Input**: `spec.md`, `plan.md`; blueprint admin contracts.

**Tests**: Playwright for each operator act; backend specs for the two guard rails;
an audit run for the public pages.

**Task ids are phase-local.** The blueprint's `tasks.md` runs its own T### series that
does not correspond to this one: its T1001–T1003 are the P10 line items, not these
tasks. Cite a blueprint task by phase, never by bare number.

## Phase 1 — Backend additions

- [x] T1001 Identity guard rails: `admin-set-role` refuses to demote the last administrator; `admin-ban` refuses self-ban; both return named errors; specs for each
- [x] T1002 [P] Operations: resolver for the contract's `audit(actor, action, targetType, from, to, first, after)` query returning `AuditConnection` of `AuditEntry`, plus its index; confirm every administrative command already writes a row
- [x] T1004 [P] Operations: `usage(from, to, userId, byMember)` — aggregate by day, kind and model, and fill `UsageRow.userId` when `byMember` is set; spec: the same range with and without the flag totals the same tokens
- [x] T1005 [P] Operations spec: the registry is read at each invocation, not cached at boot — a key changed mid-run is seen by the next invocation, and a job already running finishes with the value it started with (SC-003, spec edge case)

## Phase 2 — Portal shell

- [x] T1010 `(admin)/layout.tsx` — rail, role guard, locale switch, responsive down to a phone width; MobX stores provisioned per request
- [x] T1011 [P] `ops` socket subscription with a 30-second polling fallback; shared `HealthStore`

## Phase 3 — Operator screens

- [x] T1020 [US1] Overview — every checked part, every job with fresh or stale and its name, the day's counts; extend P1's default-password warning to read `Health.defaultAdminPassword` and link to changing it; times through `shared/time` in the administrator's profile zone, with the zone named
- [x] T1021 [P] [US2] Extend P1's Users and Devices pages — device count from `User.deviceCount` rather than a `devices` read per row, inline errors from the guard rails; spec: a member deleted while their row is open shows "no longer exists" and returns to the list
- [x] T1022 [US3] Settings — one control per key built from `Setting.schema` (switch, dropdown, time, number with bounds, chips, guarded JSON), `Setting.description` beside it, inline validation errors from the command, and a `Setting.readOnly` key shown as a value with no control and a line saying the system writes it
- [x] T1023 [P] [US4] Workflows — state and last run, activate, deactivate, run now, and a clear message when the automation tool is unreachable; event forwarding edited as the `automation.subscriptions` registry key through `PATCH /admin/settings/:key`, using T1022's control for that key rather than a page of its own
- [x] T1024 [P] [US5] Extend P7's ingestion queue — clear a stuck entry through `DELETE /admin/knowledge/:linkId` beside the existing retry, and show the audit row it writes
- [x] T1025 [P] [US6] Usage — per-day table by kind with a small hand-drawn bar strip, per-member totals from `usage(byMember: true)`, date range
- [x] T1026 [P] Audit — filters over the `audit` query (actor, action, target type, range) and a readable row per act, paged by `endCursor`

## Phase 4 — Public site (US7)

- [x] T1030 [P] `(marketing)` pages: home (one sentence, three sections), features with screenshots, download pointing at the release assets, privacy stating what runs where; static rendering so they load when the API is down
- [x] T1031 [P] `next-intl` messages for English and Arabic across both route groups; `dir` from the locale; no third-party scripts anywhere

## Phase 5 — Verification and polish

- [x] T1040 [P] Playwright suite: login, promote, ban (and the two refusals), change a setting, run a workflow, retry a failed link, view audit, sign out; a case that seeds a stale `ops_heartbeats` row and asserts the overview names that job and reads degraded; each of promote, ban, setting, workflow and retry reached from the overview in at most three steps, asserted (SC-004)
- [x] T1041 [P] Accessibility and performance audit on the public pages; fix to ≥ 90
- [x] T1042 [P] RTL review of every portal screen and public page
- [x] T1044 [P] `.github/workflows/ci.yml`: a `frontend-e2e` job running `test:e2e` against the compose stack, gated the way P0 gates its spine suite, so the smoke the phase gate demands actually runs
- [x] T1043 Record gate evidence; open `025-hardening-release`

## Dependencies

T1001, T1002, T1004 before the screens that use them; T1005 stands alone.
T1010/T1011 before T1020–T1026. T1022 before T1023, which borrows its control for
`automation.subscriptions`. T1040 before T1044. T1030/T1031 independent of the portal.

## Verification gate

1. `pnpm --filter @botvy/backend test` — guard rails green, and the registry spec
   showing a key read per invocation and a running job keeping its old value.
2. `pnpm --filter @botvy/frontend build && pnpm --filter @botvy/frontend test:e2e` —
   every operator act green, including both refusals, the seeded stale job naming
   itself on the overview, and every act within three steps of the overview.
3. The `frontend-e2e` job green in CI against the compose stack, not only locally.
4. Manual: stop the scheduler → the overview names the stale job within fifteen
   minutes and health reads degraded; change the default morning time → a newly
   registered member starts with it; every act performed appears in the audit page.
5. Lighthouse on the public pages: performance and accessibility ≥ 90; the pages load
   with the API stopped.

## Gate evidence (2026-09-11)

Run on `024-web-admin-public` at `b719714`.

| Gate | Command | Result |
|---|---|---|
| 1 | `pnpm --filter @botvy/backend test` | 92 files, **1584 passed** — includes the two guard rails and the registry-per-invocation spec |
| 1 | `pnpm --filter @botvy/sdk test` | 6 files, **118 passed** — the new `HealthStore` and `AdminStore` specs among them |
| 2 | `pnpm --filter @botvy/frontend build` | green; routes `/`, `/login`, `/overview`, `/users`, `/settings`, `/workflows`, `/ingestion`, `/usage`, `/audit`, `/service-clients` |
| 2 | `pnpm --filter @botvy/frontend exec playwright test --list` | **19 cases in 2 files** — both refusals, a setting that survives a reload, promote, run a workflow, retry a link, the seeded stale job, sign-out, SC-004 in three steps, every portal screen at 360px in Arabic, and the public pages' axe scan |
| — | `pnpm lint` | 0 warnings, 0 errors over 656 files |
| — | `pnpm --filter @botvy/frontend typecheck` | clean |
| — | message parity | **177 keys**, `missing in ar: []`, `extra in ar: []` |

### What has not been run, and why

Gate 2's **execution** and gates 3–5 need the compose stack, and Docker's engine
fell over during the rebuild that would have carried the new backend reads: the
daemon answers `500 Internal Server Error` and `wsl -l -v` times out. Clearing it
needs a reboot, which is the Owner's call. Nothing about this is a finding
against the code — the suite is written, listed and typechecked; it has not been
pointed at a running installation.

To finish it once the machine is back:

```
docker compose --env-file .env -f infra/docker-compose.yml up -d --build --force-recreate backend worker frontend
docker compose --env-file .env -f infra/docker-compose.yml exec -T mongo mongosh botvy --quiet --eval   'const t = new Date(Date.now() - 6*60*60*1000); db.ops_heartbeats.updateOne({_id:"ci.stopped"},{$set:{lastRunAt:t,lastOkAt:t,lastError:"seeded stale"}},{upsert:true})'
BOTVY_E2E_URL=http://127.0.0.1:8090 BOTVY_E2E_EMAIL=<admin> BOTVY_E2E_PASSWORD=<password>   BOTVY_E2E_STALE_JOB=ci.stopped pnpm --filter @botvy/frontend test:e2e
```

**`--force-recreate` is not optional.** `up -d --build <service>` rebuilt the
image and left the previous container running, which looks exactly like a
successful deploy and is why the portal answered 404 for four new routes that
were in the tree and in the image. Same trap as the one `CLAUDE.md` records for
`nest build`.

Gate 3 (`frontend-e2e` in CI) runs on the next push; the job is written and its
YAML parses.

### Lighthouse (gate 5)

Not run — same blocker. What the suite asserts in its place is the part that
actually moves the score and that a score cannot be trusted to catch: the public
page issues **no request to any other origin**, and it passes an axe scan at
WCAG 2.1 AA. A number from a run on a laptop under memory pressure would have
been a worse record than either.

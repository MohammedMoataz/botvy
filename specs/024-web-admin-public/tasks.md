# Tasks: Web — Admin Portal & Public Site (P10)

**Input**: `spec.md`, `plan.md`; blueprint admin contracts.

**Tests**: Playwright for each operator act; backend specs for the two guard rails;
an audit run for the public pages.

**Task ids are phase-local.** The blueprint's `tasks.md` runs its own T### series that
does not correspond to this one: its T1001–T1003 are the P10 line items, not these
tasks. Cite a blueprint task by phase, never by bare number.

## Phase 1 — Backend additions

- [ ] T1001 Identity guard rails: `admin-set-role` refuses to demote the last administrator; `admin-ban` refuses self-ban; both return named errors; specs for each
- [ ] T1002 [P] Operations: resolver for the contract's `audit(actor, action, targetType, from, to, first, after)` query returning `AuditConnection` of `AuditEntry`, plus its index; confirm every administrative command already writes a row
- [ ] T1004 [P] Operations: `usage(from, to, userId, byMember)` — aggregate by day, kind and model, and fill `UsageRow.userId` when `byMember` is set; spec: the same range with and without the flag totals the same tokens
- [ ] T1005 [P] Operations spec: the registry is read at each invocation, not cached at boot — a key changed mid-run is seen by the next invocation, and a job already running finishes with the value it started with (SC-003, spec edge case)

## Phase 2 — Portal shell

- [ ] T1010 `(admin)/layout.tsx` — rail, role guard, locale switch, responsive down to a phone width; MobX stores provisioned per request
- [ ] T1011 [P] `ops` socket subscription with a 30-second polling fallback; shared `HealthStore`

## Phase 3 — Operator screens

- [ ] T1020 [US1] Overview — every checked part, every job with fresh or stale and its name, the day's counts; extend P1's default-password warning to read `Health.defaultAdminPassword` and link to changing it; times through `shared/time` in the administrator's profile zone, with the zone named
- [ ] T1021 [P] [US2] Extend P1's Users and Devices pages — device count from `User.deviceCount` rather than a `devices` read per row, inline errors from the guard rails; spec: a member deleted while their row is open shows "no longer exists" and returns to the list
- [ ] T1022 [US3] Settings — one control per key built from `Setting.schema` (switch, dropdown, time, number with bounds, chips, guarded JSON), `Setting.description` beside it, inline validation errors from the command, and a `Setting.readOnly` key shown as a value with no control and a line saying the system writes it
- [ ] T1023 [P] [US4] Workflows — state and last run, activate, deactivate, run now, and a clear message when the automation tool is unreachable; event forwarding edited as the `automation.subscriptions` registry key through `PATCH /admin/settings/:key`, using T1022's control for that key rather than a page of its own
- [ ] T1024 [P] [US5] Extend P7's ingestion queue — clear a stuck entry through `DELETE /admin/knowledge/:linkId` beside the existing retry, and show the audit row it writes
- [ ] T1025 [P] [US6] Usage — per-day table by kind with a small hand-drawn bar strip, per-member totals from `usage(byMember: true)`, date range
- [ ] T1026 [P] Audit — filters over the `audit` query (actor, action, target type, range) and a readable row per act, paged by `endCursor`

## Phase 4 — Public site (US7)

- [ ] T1030 [P] `(marketing)` pages: home (one sentence, three sections), features with screenshots, download pointing at the release assets, privacy stating what runs where; static rendering so they load when the API is down
- [ ] T1031 [P] `next-intl` messages for English and Arabic across both route groups; `dir` from the locale; no third-party scripts anywhere

## Phase 5 — Verification and polish

- [ ] T1040 [P] Playwright suite: login, promote, ban (and the two refusals), change a setting, run a workflow, retry a failed link, view audit, sign out; a case that seeds a stale `ops_heartbeats` row and asserts the overview names that job and reads degraded; each of promote, ban, setting, workflow and retry reached from the overview in at most three steps, asserted (SC-004)
- [ ] T1041 [P] Accessibility and performance audit on the public pages; fix to ≥ 90
- [ ] T1042 [P] RTL review of every portal screen and public page
- [ ] T1044 [P] `.github/workflows/ci.yml`: a `frontend-e2e` job running `test:e2e` against the compose stack, gated the way P0 gates its spine suite, so the smoke the phase gate demands actually runs
- [ ] T1043 Record gate evidence; open `025-hardening-release`

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

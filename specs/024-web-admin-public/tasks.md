# Tasks: Web — Admin Portal & Public Site (P10)

**Input**: `spec.md`, `plan.md`; blueprint admin contracts.

**Tests**: Playwright for each operator act; backend specs for the two guard rails;
an audit run for the public pages.

## Phase 1 — Backend additions

- [ ] T1001 Identity guard rails: `admin-set-role` refuses to demote the last administrator; `admin-ban` refuses self-ban; both return named errors; specs for each
- [ ] T1002 [P] Operations: `audit` query (filter by actor, action, target, date range, cursor) and its index; confirm every administrative command already writes a row
- [ ] T1003 [P] Operations: `automation.subscriptions` read and write slices so the interface can list and toggle event forwarding
- [ ] T1004 [P] Operations: `usage` query aggregated by day, kind, model and member

## Phase 2 — Portal shell

- [ ] T1010 `(admin)/layout.tsx` — rail, role guard, locale switch, responsive down to a phone width; MobX stores provisioned per request
- [ ] T1011 [P] `ops` socket subscription with a 30-second polling fallback; shared `HealthStore`

## Phase 3 — Operator screens

- [ ] T1020 [US1] Overview — every checked part, every job with fresh or stale and its name, the day's counts, and the default-password warning with a link
- [ ] T1021 [P] [US2] Users — search, last sign-in, device count, role menu, ban switch, inline errors from the guard rails; Devices page
- [ ] T1022 [US3] Settings — rendered from the registry schema (switch, dropdown, time, number with bounds, chips, guarded JSON), inline validation errors, system-written keys read-only
- [ ] T1023 [P] [US4] Automation — workflows with state and last run, activate, deactivate, run now; event subscriptions with toggles; a clear message when the automation tool is unreachable
- [ ] T1024 [P] [US5] Ingestion queue — all members, state, reason, attempts, retry, clear
- [ ] T1025 [P] [US6] Usage — per-day table by kind with a small hand-drawn bar strip, per-member totals, date range
- [ ] T1026 [P] Audit — filters and a readable row per act; Service clients — create with the secret shown once, revoke

## Phase 4 — Public site (US7)

- [ ] T1030 [P] `(marketing)` pages: home (one sentence, three sections), features with screenshots, download pointing at the release assets, privacy stating what runs where; static rendering so they load when the API is down
- [ ] T1031 [P] `next-intl` messages for English and Arabic across both route groups; `dir` from the locale; no third-party scripts anywhere

## Phase 5 — Verification and polish

- [ ] T1040 [P] Playwright suite: login, promote, ban (and the two refusals), change a setting, run a workflow, retry a failed link, view audit, sign out
- [ ] T1041 [P] Accessibility and performance audit on the public pages; fix to ≥ 90
- [ ] T1042 [P] RTL review of every portal screen and public page
- [ ] T1043 Record gate evidence; open `025-hardening-release`

## Dependencies

T1001–T1004 before the screens that use them. T1010/T1011 before T1020–T1026.
T1030/T1031 independent of the portal.

## Verification gate

1. `pnpm --filter @botvy/backend test` — guard rails green.
2. `pnpm --filter @botvy/frontend build && pnpm --filter @botvy/frontend test:e2e` —
   every operator act green, including both refusals.
3. Manual: stop the scheduler → the overview names the stale job within fifteen
   minutes and health reads degraded; change the default morning time → a newly
   registered member starts with it; every act performed appears in the audit page.
4. Lighthouse on the public pages: performance and accessibility ≥ 90; the pages load
   with the API stopped.

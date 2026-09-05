# Tasks: Botvy v2 — Phase Roadmap

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`

**Organisation**: this blueprint's tasks are **phases**. Each phase becomes its own
spec-kit feature (`/speckit-specify` → `/speckit-clarify` → `/speckit-plan` →
`/speckit-tasks` → `/speckit-checklist` → `/speckit-analyze` → `/speckit-implement`)
on its own numbered branch, and lands only when its verification gate passes with
real output (constitution VII). Tasks below are the phase's scope, not its full
task list — the phase's own `tasks.md` expands them.

Format: `[ID] [P?] Description` — `[P]` = can run in parallel within the phase.

Legend for surfaces: **API** (apps/backend: `backend` + `worker` processes), **MOB** (Flutter), **WEB** (Next.js),
**EXT** (extension), **INF** (compose/CI), **PKG** (shared packages).

---

## Phase 0 — Foundation (`014-foundation`)

**Goal**: an empty but complete skeleton of every surface, both stores, the
outbox, the edge and CI/CD — so every later phase adds slices, not plumbing.

- [ ] T001 INF Restructure the monorepo: `apps/{backend,frontend,extension,mobile}`, `packages/{contracts,sdk,tokens}`; move v1 to `legacy/` (read-only until P11) — keep `pnpm-workspace.yaml`
- [ ] T002 [P] API Bootstrap NestJS 12 app with `BOTVY_ROLE` switch (`backend` | `worker`), pino logging, zod env schema (fail-fast)
- [ ] T003 [P] API Persistence: PrismaService (Postgres, Identity schema from `data-model.md §1`), MongooseModule (replica set URI), `migrate-mongo` wiring, health probes for both
- [ ] T004 [P] API Shared kernel: `shared/time` (port `common/time.ts` + tests), `shared/cqrs` (base Command/Query/Event, Result, uuidv7), `shared/auth` (Principal, JwtAuthGuard, GqlAuthGuard, WsAuthGuard, RolesGuard, ServiceTokenGuard), `shared/settings` (registry + Mongo service + cache + `SettingChanged` invalidation), `shared/outbox` (OutboxWriter in tx, OutboxRelay change stream, webhook fan-out with HMAC), `shared/llm` (OllamaClient chat/extract/summarize), `shared/push` (port), `shared/media` (port)
- [ ] T005 [P] API GraphQL code-first module with Apollo, DataLoader factory, `me` placeholder resolver; Socket.IO gateway with handshake auth and rooms
- [ ] T006 [P] API Operations context: `settings` registry keys from `data-model.md §2.11`, `ops_heartbeats`, `/health`, `/internal/alerts`, admin settings PATCH
- [ ] T007 [P] PKG `contracts` (OpenAPI + SDL generation scripts), `sdk` (fetch client, socket client, AuthStore with single-flight refresh ported from v1 admin), `tokens` (JSON → CSS vars + Dart theme)
- [ ] T008 [P] WEB Next.js 16 skeleton: route groups `(marketing)` + `(admin)`, MobX provider per request, PrimeReact pinned MIT line + tokens theme, login page, standalone Dockerfile
- [ ] T009 [P] EXT WXT skeleton: side panel (React + MobX + Bootstrap), background worker (alarms, socket keep-alive stub), Dexie schema, sign-in screen
- [ ] T010 [P] MOB Flutter skeleton: `flutter_bloc`, `go_router`, `get_it`, tokens → `flex_color_scheme` light/dark, l10n en/ar with RTL, drift `botvy_v2.sqlite` with `SyncColumns` mixin and migration ladder test harness, dio client + socket client ports
- [ ] T011 INF compose: caddy (Caddyfile routes), frontend, backend, worker, postgres, mongo (RS healthcheck init), mongodump, n8n, cloudflared profile; `.env.example` contract; `bootstrap.mjs` (both migrations, n8n owner/API key, service client, workflow import)
- [ ] T012 INF GitHub Actions: `ci.yml` (lint+test all apps), `release.yml` (tags → GHCR images → SSH `compose pull && up -d`), `mobile.yml` (APK artifact), `extension.yml` (zip artifact)
- [ ] T013 API One end-to-end proof: a `PingCommand` writes an outbox event → relay → in-process handler + n8n webhook → heartbeat stamped

**Gate**: `docker compose up -d` all healthy; `curl /health` → `ok` with both stores;
`pnpm -r test` green; T013 round trip visible in n8n executions; APK and extension
artifacts produced by CI on a tag.

---

## Phase 1 — Identity & Profile (`015-identity-profile`)

- [ ] T101 API Identity slices: register (confirm + min 8), login (email or username), google-sign-in (idToken) + OAuth code flow, refresh (rotation + family reuse detection), logout, change-password (revoke all), register-device, delete-account (`UserDeleted`), user-by-id / devices queries; admin seed (port); `service_clients` admin slices
- [ ] T102 [P] API Profile context: `profiles`, `user_preferences` bootstrap on `UserRegistered`; update-profile, upload-photo (media volume), record-body-metric, update-preferences; GraphQL `profile`, `preferences`, `me`, `myDevices`
- [ ] T103 [P] MOB Auth feature (login/register with confirm/Google via `google_sign_in` 7), Profile feature (photo picker/cropper, body metrics, foods, allergies), Preferences screen (every default), Settings (base URL, language)
- [ ] T104 [P] WEB Admin login + Users list (role, ban), Devices, Settings registry form (port Config page), Overview with `/health`
- [ ] T105 [P] EXT Sign-in (email/password + `launchWebAuthFlow`), token storage in `chrome.storage`, `AuthStore` reuse
- [ ] T106 API Tests: refresh reuse revokes family; service token refuses user JWT and vice-versa; admin seed never resets a changed password; preferences default from settings

**Gate**: register on phone → same profile on web admin Users; Google sign-in on
phone and extension; `vitest` for T106 green; RTL screenshots of auth + profile in Arabic.

---

## Phase 2 — Tasks, Labels, Reminders, Notifications, Sync v2 (`016-tasks-labels-reminders`)

- [ ] T201 API Planning context: labels CRUD (palette + custom), tasks create/update/complete/reopen/cancel/defer/delete/restore/purge/rollover, recurrence (`rrule`, schedule vs completion), label snapshot refresh; GraphQL `tasks(filter)`, `labels`, `task`
- [ ] T202 [P] API Reminders context (port + snooze + reactivate); GraphQL `reminders(view)`
- [ ] T203 API Notifications context: `alerts` planning saga for tasks/reminders (lead times from preferences), sweep (claim-then-send, skip synced devices, expire, purge, invalid-token reaping), `pendingAlerts` for sync, `notifications/test`
- [ ] T204 API Sync facade + `SyncableEntity` adapters for tasks, labels, reminders, profile, preferences; conflict rule; lagged cursor; full-snapshot rule; `sync.ChangesApplied` → `sync.nudge`
- [ ] T205 [P] MOB Tasks feature (Today with "To Do — Today" group, Upcoming, Overdue, by label, Completed, Deleted with restore; label editor with colour picker), Reminders feature (port screens: undo, deleted view, snooze), local alarm scheduler from `pendingAlerts` + rows, sync engine port with generic mixin
- [ ] T206 [P] EXT Side panel Today tasks + labels (Dexie), quick add, complete/undo, sync push/pull subset
- [ ] T207 INF n8n `notifications_sweep.json` retargeted; heartbeat visible in admin
- [ ] T208 API/MOB Tests: recurrence advance (both modes), conflict rule table, delete keeps status, partial unique `clientId`, `pendingOp` filter regression, alarm plan mirrors server plan

**Gate**: airplane-mode alarm fires; sweep does not duplicate a synced device's
alarm; PC↔phone task propagation < 10 s; all T208 tests green.

---

## Phase 3 — Daily Rhythm (`017-daily-rhythm`)

- [ ] T301 API Rhythm context: `rhythm_states`, tick (per-user local time, claim-then-send, catch-up), evening prompt → `daily_plans` draft (tasks by priority, tomorrow's session via `NextSessionQuery`, meal line via Nutrition query — stubs until P6/P8), morning briefing, confirm/skip, rollover of unfinished tasks (`deferCount`), check-in record + streak (`adherence.ts` port), check-in classifier (port, coach-chat only)
- [ ] T302 [P] API Notifications: `evening`/`morning`/`checkin` alerts; Conversations: write prompts into `coach` (system/assistant messages) and `chat.message` push (Conversations context skeleton for messages/seq lands here)
- [ ] T303 [P] MOB Home screen (greeting, today's plan, streak, week adherence dots), Rhythm cards (confirm tomorrow, check-in with mood slider), notification tap routing
- [ ] T304 INF n8n `rhythm_tick.json` (cron + unconditional webhook); admin Run button
- [ ] T305 API Tests: Cairo vs Berlin fire at their own 22:00 once; downtime catch-up; DST day fires once; check-in ignored outside coach chat; rollover increments `deferCount`

**Gate**: evening + morning prompts arrive on the phone and in the coach chat at
the member's times; streak updates; T305 green; `ops_heartbeats.rhythm_tick` fresh.

---

## Phase 4 — Coach Chat (`018-coach-chat`)

- [ ] T401 API Conversations context complete: pinned `coach`/`planner` (protected), `free` chats, `messages` with per-user `seq`, clear watermark, quick questions (global + user, mood-aware), WS gateway (`chat.send/cancel`, events per `ws-chat.md`), batch offline replay, intent extraction (grammar-constrained, `intent.md`) → CommandBus dispatch to Planning/Reminders/Meetings/Profile with templated confirmation, prompt assembly (`coach.md`/`planner.md`/`chat.md`: profile line with BMI in code, allergies as prohibitions, today's plan, streak), `chat.moved`, usage + quota, cancel
- [ ] T402 [P] MOB Chat feature: pinned section divider, quick chips, streaming bubbles via socket, stop button, offline queue → batch, markdown rendering (`flutter_markdown_plus`), moved-conversation handling
- [ ] T403 [P] WEB (admin) Usage page; quick-questions management
- [ ] T404 API Tests: intent fixtures (EN/AR relative time), protected conversation rejections, seq monotonic per user, cancel aborts stream, quota enforcement

**Gate**: "remind me to call Dad in two hours" creates the reminder at the right
local time; coach uses weight from profile; Stop halts within 1 s; offline message
answered on reconnect; intent fixture harness passes.

---

## Phase 5 — Meetings & Calendar (`019-meetings-calendar`)

- [ ] T501 API Meetings context: create/update/complete/cancel, RRULE + exdates + overrides (skip/move occurrence), location (link | address), prep notes/minutes, reminder offsets; `calendar_events`; GraphQL `meeting`, `meetings`, `agenda(from,to)` (meetings + prep blocks + timed tasks + sessions + events), `monthOverview`; alert planning saga (14-day rolling window); sync adapters
- [ ] T502 [P] MOB Meetings feature (editor with recurrence picker daily/weekly/monthly + end, link/address, prep, offsets), Calendar feature (`table_calendar` month + agenda day/week), Home agenda strip
- [ ] T503 [P] EXT Side panel Meetings agenda + add meeting; context-menu "add selection as task", "add page as link" (link add lands in P7 but the menu item can queue)
- [ ] T504 API Tests: monthly on 31st → last day of Feb; skip one occurrence leaves the series; moved occurrence alerts re-planned; agenda merge ordering

**Gate**: weekly meeting × 6 with one skipped shows 5 occurrences on phone and
extension; 30-min reminder fires per occurrence; T504 green.

---

## Phase 6 — Training / Athlete (`020-training`)

- [ ] T601 API Training context: sports, slots, session materialiser saga (14 days), sessions create/update/log/complete/cancel/skip, programs CRUD + apply, workouts library; GraphQL `athleteProfile`, `nextPractice` (cutoff rule), `sessions`, `program(s)`, `workouts`; sync adapters; `SessionScheduled` alerts; Rhythm draft includes training
- [ ] T602 [P] MOB Athlete feature: sports picker (multi), weekly slots editor, "current / next practice" card, week view per sport, session detail with set logging (target vs actual), programs list/apply, workouts library; Today shows the training slot as a distinct item
- [ ] T603 API Tests: cutoff before/after 21:00; two sports in one week; program apply fills slot sessions; rest day = no session

**Gate**: Wednesday 21:30 shows Friday's session as next; Today shows the 18:00
slot; logged sets persist offline and sync; T603 green.

---

## Phase 7 — Knowledge Ingestion & Suggestions (`021-knowledge-ingestion`)

- [ ] T701 API Knowledge context: add/retry/remove link, kind detection (article/website/video/playlist), worker pipeline (readability+jsdom, youtubei.js transcripts + playlist expansion with `playlistMaxItems`, map-reduce summarise with `llm.summarizeModel`, media refs via signed proxy), state machine + `LinkStateChanged` nudges, `knowledge_docs`; `SuggestionSaga` on `SessionScheduled` when `aiSuggestions` (schema-constrained draft from the member's docs by sport), accept/dismiss → Training; GraphQL `links`, `link`, `suggestions`; `/internal/knowledge/ingest/:id`
- [ ] T702 [P] MOB Knowledge feature inside Athlete: add link, status chips with retry, summary + key points + media viewer, suggestions inbox (accept into session / dismiss); preference toggle for suggestions
- [ ] T703 [P] WEB (admin) Ingestion queue page (all users, retry, failures)
- [ ] T704 API Tests: failed → retry increments attempts and caps; playlist children created once; suggestion not generated when `aiSuggestions=false`; summary chunking on a 20k-word fixture

**Gate**: 3-video playlist → 3 children `done` within 20 min on the reference
host; suggestion for tomorrow's session references a saved source; failure UX
visible and retryable; T704 green.

---

## Phase 8 — Nutrition & Daily Plan Line (`022-nutrition-daily-plan`)

- [ ] T801 API Nutrition context: meals library CRUD (sync adapter), daily meal suggestion (mode `llm` generic via `summarize`/`chat` model with allergies as prohibitions; mode `library` rotation without any model call), allergen check withholds; `MealPlanReady/Withheld` → Rhythm draft `mealLine`; "Workout: X | Meals: Y" line composed in Rhythm; GraphQL `meals`, `todayMeals`
- [ ] T802 [P] MOB Nutrition feature (meals library, today's line, regenerate), Profile foods/allergies wired
- [ ] T803 API Tests: allergen withheld; library mode never calls the model; line format

**Gate**: mode `library` with 5 meals rotates only those; dairy allergy never
appears in generic mode across 50 generations; T803 green.

---

## Phase 9 — Chrome Extension complete (`023-chrome-extension`)

- [ ] T901 EXT Side panel polish: Today tasks (labels, priority colours, complete/undo/defer), Meetings agenda (next 7 days, join link), quick add (task | reminder | meeting), context-menu capture (selection → task; page → link), sync indicator + manual sync, socket keep-alive with `chrome.alarms` reconnect, `sync.nudge` handling, offline queue in Dexie, notifications via `chrome.notifications` on `alert.fired`
- [ ] T902 INF `extension.yml` builds zip on tag; optional Web Store upload behind a repo variable
- [ ] T903 EXT Playwright e2e: sign in, add task, complete, offline add → reconnect sync

**Gate**: task completed in panel appears on phone < 10 s; selection captured as
task with page URL in notes; works after SW restart; e2e green.

---

## Phase 10 — Web: Admin Portal & Public Site (`024-web-admin-public`)

- [ ] T1001 WEB Admin: Overview (health, heartbeats, stats), Users (search, role, ban/unban, devices), Settings registry (typed form from schema), Automation (workflows list/activate/run, event subscriptions editor), Ingestion queue, Usage charts, Audit log, Service clients (create shows token once)
- [ ] T1002 [P] WEB Marketing: landing, features, download (APK + extension), privacy; i18n en/ar
- [ ] T1003 WEB Playwright smoke: login, patch a setting, run a workflow, ban/unban

**Gate**: every admin action leaves an `audit_log` row; stale job visible within 15
min; Lighthouse ≥ 90 on landing; smoke green.

---

## Phase 11 — Hardening & Release (`025-hardening-release`)

- [ ] T1101 INF Backups: nightly `mongodump` + `pg_dump`, restore drill documented and executed once
- [ ] T1102 API Security review: rate limits per surface, throttle WS, CORS for web origin only, media proxy SSRF re-check, service-token rotation procedure, seeded admin warning, dependency audit
- [ ] T1103 [P] DOC `SETUP.md` rewritten for v2; `README.md`; `CLAUDE.md` rules refreshed
- [ ] T1104 [P] INF Optional one-shot import of v1 reminders/conversations from Postgres → Mongo (only if the owner wants it)
- [ ] T1105 INF Decommission v1: remove `legacy/`, retire old compose services, rotate the known-compromised Firebase key
- [ ] T1106 ALL Release v2.0.0: tag, images, APK, extension zip; SC-001…SC-010 measured and recorded in this file

**Gate**: restore drill passes; `/health ok` for 7 days with heartbeats fresh;
success criteria table filled with measured values.

---

## Dependencies & order

```text
P0 ─► P1 ─► P2 ─► P3 ─► P4 ─► P5 ─► P6 ─► P7 ─► P8 ─► P9 ─► P10 ─► P11
                     └── Notifications, Sync (P2) are prerequisites for every later phase
                     P3 stubs training/meal queries until P6/P8 land
                     P4 depends on P2 (tasks/reminders commands) and P3 (coach chat exists)
                     P9 depends on P2 + P5 contracts; P10 on P1 + P7 (ingestion queue)
```

Within a phase, `[P]` tasks touch different apps and can proceed together.

## Cross-cutting checklist applied to every phase

- Spec has no implementation details; plan passes the constitution check; `/speckit-analyze` clean before `/speckit-implement`.
- Every user-facing time resolved with `shared/time` against the profile zone.
- Every new default has a `settings.defaults.*` key **and** a `user_preferences` field.
- Every scheduled or event-driven job writes a heartbeat.
- Every branchy rule (recurrence, conflict, claim, cutoff, allergen) has a test; fixtures relative to `Date.now()`.
- Every new synced table on the phone bumps `schemaVersion` with a matching migration branch and an old-schema open test.
- Arabic RTL screenshots reviewed for new screens.

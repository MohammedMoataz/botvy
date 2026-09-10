# Tasks: Tasks, Labels, Reminders, Notifications, Sync (P2)

**Input**: `spec.md`, `plan.md`; blueprint data-model §2.2–2.4, `contracts/sync.md`,
`contracts/events.md`.

**Task ids** are phase-local: `T2xx` here numbers this phase's work only. The
blueprint's `tasks.md` carries its own `T###` series whose numbers look alike and
mean something else; a reference across the two always names the document.

**Tests**: mandatory for recurrence (both modes), the conflict rule table, alert
claim atomicity, quiet-hours shifting, cancellation on source change, full-vs-delta
sweep, the drift ladder, the `pendingOp` filter, deleting leaving the status
untouched, the label name's partial unique index, and the phone's alarm plan
mirroring the server's.

## Phase 1 — Planning context

- [X] T200 `migrate-mongo` script for `tasks`, `labels`, `reminders` and `alerts` — every index this phase needs, declared here and nowhere else: `nameLower` unique **partial** with `$exists: true` (missing and null are one value to Mongo), the alerts' partial unique over the optional `source.occurrenceAt`, and the read indexes from data-model §2.2–2.4. Runs before the schemas so T204's uniqueness spec has its index
- [X] T201 `contexts/planning/domain/`: `task.aggregate.ts` (schedule, edit, complete with recurrence advance, reopen, cancel, defer, tombstone, restore, purge, skipOccurrence), `label.aggregate.ts`, `recurrence.ts` (`rrule` wrapper: `next(after)`, `skip(date)`, `humanText`, mode), ports `task.repository.ts`, `label.repository.ts`, `task-read.repository.ts`
- [X] T202 [P] `infrastructure/`: mongo adapters, schemas describing shape only (no `index()` calls — T200 owns every index), mappers (upcast by `schemaVersion`), in-memory adapters
- [X] T203 [P] Slices `create-task/ update-task/ complete-task/ reopen-task/ cancel-task/ defer-task/ delete-task/ restore-task/ purge-task/ skip-occurrence/` — each raising its event; `create-task` takes the client's UUIDv7 `id`; `defer-task` increments `deferCount`, records `deferredFrom` and raises `TaskDeferred`; specs with the in-memory adapter — spec: the same create replayed twice leaves one task and no second event; spec: deleting a completed task and a cancelled one leaves each `status` exactly as it was, and the Deleted view reports it
- [X] T204 [P] Slices `create-label/ update-label/ delete-label/` + the Planning-internal snapshot refresh on `LabelUpdated`; colours offered from `settings.labels.palette` (registered in P0 — read the key, never a literal) with a free colour allowed; spec: rename shows on tasks; spec: a duplicate name is refused by the partial unique index from T200, and a label created without a name-lowered value does not collide with another that lacks one
- [X] T205 [P] Queries `tasks(filter)` (Today, Upcoming, Overdue, by label, Completed, Deleted; cursor pagination), `labels` (with open counts), `task(id)`
- [X] T206 `rollover/` slice (used by P3): move named tasks to a date through the same aggregate method `defer-task` uses, so `deferCount`, `deferredFrom` and `TaskDeferred` come out identical whichever entry point moved them
- [X] T207 [P] Cross-context queries on the `QueryBus`: `TasksDueQuery(userId, date)` (that member's tasks due on the date, in their own zone) and `TasksOpenBeforeQuery(userId, date)` (still-open tasks before the moment) and `TimedTasksInRangeQuery(userId, from, to)` (tasks carrying a time, over a window, for the agenda), each a `@QueryHandler` over `task-read.repository.ts`. P3's evening draft (`017` T304) and P5's agenda (`019` T530) call these; without them a later phase binds a port straight to Planning's collection. Spec: both scope by `userId` and resolve the day boundary in the member's zone, not the server's

## Phase 2 — Reminders context

- [X] T210 `contexts/reminders/`: domain aggregate + port, mongo and in-memory adapters, mappers
- [X] T211 [P] Slices `create/ update/ snooze/ complete/ cancel/ reactivate/ delete/ restore/ purge/ clear-deleted` and query `reminders(view)`; `create` takes the client's UUIDv7 `id` and a replay of it is the same reminder, not a second one; `remindAt` resolved through `shared/time` against the member's zone; spec: restore keeps status, purge refused for a live row, reactivate requires a new moment, a `remindAt` an hour behind `Date.now()` is refused as `remind_at_past` with the reason, and a `remindAt` inside a daylight-saving gap lands on the first valid instant after it (fixtures built from `Date.now()`, never a pinned date)

## Phase 3 — Notifications context (US5, US6)

- [X] T220 `contexts/notifications/domain/`: `alert.aggregate.ts` (plan, claim, markSent, markFailed), `alert.repository.ts` port; `infrastructure/mongo-alert.repository.ts` with `claim()` as `findOneAndUpdate({_id, claimedAt: null})`, relying on T200's partial unique index rather than declaring its own; in-memory adapter
- [X] T221 `features/plan-alerts-saga/` — `@EventsHandler` for `TaskScheduled|Rescheduled|Completed|Cancelled|Deleted` and `ReminderScheduled|Rescheduled|Snoozed|Completed|Cancelled|Deleted|Purged`; reconciles the desired alert set; expands lead times from preferences; holds a system-generated alert (every lead-time alert) to the end of quiet hours and never moves the member's own moment; specs for each transition
- [X] T221a Same saga, the events from outside Planning and Reminders: `profile.ProfileUpdated{changed}` with `timezone` → re-plan every future alert from its source's local time; `profile.PreferencesChanged{changed}` with the default lead times → re-plan only the derived alerts of future sources; `identity.UserBanned` → delete unsent alerts, `UserUnbanned` → re-plan from the sources still live; `identity.DeviceRegistered|DeviceRemoved` → re-plan pending alerts for push. Spec: a member whose zone moves from +02:00 to −05:00 has every future alert's instant recomputed against the new zone and none against the server's clock — the v1 three-hour shift, caught here (fixtures relative to `Date.now()`); spec: a banned member's unsent alerts are gone and an unban restores them from live sources
- [X] T222 `features/sweep/` — service-only `POST /internal/notifications/sweep`: due + unsent in batches of `settings.notifications.sweepBatch`, group by user, no push device → leave unsent, filter `lastSeenAt < plannedAt`, claim, send, raise `notifications.AlertSent{alertId, source, deviceIds}` per delivered row and `AlertFailed{…, error}` per failure (P4 turns these into `alert.fired`; P9 shows them), expire past `settings.notifications.expiryHours`, heartbeat. Nothing here writes another context's store: a token FCM reports invalid is a `RemoveDevice{deviceId}` dispatched to Identity over the `CommandBus`, and tombstones past `settings.reminders.tombstoneDays` are a `PurgeTombstones{before}` dispatched to Planning and to Reminders, each purging its own collections and reporting the count the sweep returns as `purged`. Spec: two concurrent sweeps send once; a synced device is skipped; the sweep issues commands and never a cross-context write
- [X] T223 [P] `features/pending-alerts/` (next 7 days, for the phone to schedule locally) and `features/send-test/`
- [X] T224 [P] `workflows/notifications_sweep.json` (cron 5 min + webhook, retry 3×/5 s, error workflow set) and its import in `bootstrap.mjs`

## Phase 4 — Sync facade (US7)

- [X] T230 `contexts/sync/domain/syncable-entity.port.ts` + `infrastructure/sync-registry.ts` (multi-provider token); Planning registers `TaskSyncAdapter` and `LabelSyncAdapter`, Reminders `ReminderSyncAdapter`. Profile's `ProfilePatchAdapter` and `PreferencesPatchAdapter` are **written here**, in the Profile context — the blueprint places them in P2 and P1 built the aggregates without them — and both skip the conflict check per `contracts/sync.md`, the writable fields and the server-written fields being disjoint. Spec: a profile patch whose `baseUpdatedAt` is stale is still accepted, and never reported as `stale`
- [X] T231 `features/sync/` — `POST /api/v1/sync`: apply pushes parents-first (labels → tasks), conflict rule per `contracts/sync.md`, cursor `now − 5 s`, `full` when `since` is null or older than `settings.reminders.tombstoneDays`, pull per entity, `pendingAlerts`, dispatch `TouchDevice{deviceId, at}` to Identity over the `CommandBus` rather than writing `devices.lastSeenAt` itself, raise `sync.ChangesApplied`; specs cover every row of the conflict table, the full-vs-delta rule, and that a completed round trip leaves the device's last-seen time advanced through the command
- [X] T232 [P] `ChangesApplied` handler → `sync.nudge` to the member's other sockets + FCM data nudge to disconnected devices

## Phase 5 — Mobile

- [X] T240 Drift 2 → 3: `tasks`, `labels`, `reminders`, `alerts_local` with the `SyncColumns` mixin, guarded branches, indexes; ladder test opening a v2-shaped file
- [X] T241 `core/sync/sync_engine.dart` — generalised v1 engine: single-flight latch with one queued re-run, connectivity + resume + explicit kick triggers, apply order, rejection branching on `entity`, delete sweep only on `full`, `pushAttempts` cap with a retry affordance, `rescheduleAll()` every pass; port `sync_test.dart` cases
- [X] T242 `core/notifications` — plan from local rows + `pendingAlerts`, quiet hours, notification actions (complete, snooze), exact-alarm permission surface, cap at 50 with rolling re-plan, no retroactive firing; port `notificationIdFor` and `planPings`
- [X] T243 [P] `features/tasks` — Today (grouped "To Do — Today"), Upcoming, Overdue, by label, Completed, Deleted; create/edit sheet (date + time picker, priority, label, repeat rule, estimate); swipe complete/cancel; delete with undo; label editor with palette and free colour
- [X] T244 [P] `features/reminders` — ported screens on Cubits: list with sync badges, editor with lead chips, deleted view with restore/reactivate/erase, snooze
- [X] T245 [P] Cubit specs for tasks and reminders against the in-memory drift database, including Today built over a seeded 2,000-row database with the render timed and asserted under 300 ms (SC-005 — the only place that number is measured)
- [X] T246 [P] The two regressions this phase owes its own past: a `pendingOp` filter test proving that a query meaning "not this pending operation" is written `pendingOp.isNull() | pendingOp.equals(x).not()` and still returns the clean rows, whose `pending_op` is NULL and therefore falsy (it has hidden nearly every row twice already); and an alarm-plan parity test asserting the phone's plan for a timed task, a reminder with lead times and a quiet-hours shift is row-for-row the set the server's saga plans for the same fixtures — the two planners drifting apart is what double-notifies or notifies nobody

## Phase 6 — Extension and packages

- [X] T250 [P] Extension: Dexie `tasks`, `labels`, `pending_ops`; sync round trip with the entity subset; Today list with complete/undo; quick add; sync indicator
- [X] T251 [P] `packages/sdk`: `TasksStore`, `LabelsStore`, `SyncStore` (cursor, push queue, rejection handling) shared by the extension and the frontend
- [X] T252 [P] `pnpm gen:contracts` regenerated; mobile REST models regenerated

## Phase 7 — Retire the demo and polish

- [X] T260 Remove the `ping` slice, `pings` collection migration, `ping_echo.json` and the default subscription; the spine is now proven by `planning.TaskScheduled` (`014-foundation` F-13)
- [X] T262 [P] Arabic strings for tasks and reminders (59 keys, plus a parity test that reads the tables rather than a hand-written list of getters — the previous locale test enumerated eleven and so could never notice a key nobody added to it). **RTL screenshots outstanding: they need a device, which is `docs/for-you/inputs-016-to-025.md` I3.**
- [X] T263 [P] `purge-on-deleted` handlers for `tasks`, `labels`, `reminders` (Planning, Reminders) and unsent `alerts` (Notifications) on `identity.UserDeleted`; spec: two deliveries, one purge
- [X] T264 Record gate evidence; open `017-daily-rhythm`

## Dependencies

T200 → T202/T204/T220 (the indexes exist before anything relies on one).
T201 → T202/T203/T204/T205/T206/T207. T210 → T211. T220 → T221 → T221a → T222.
T223 → T231 (`/sync` returns `pendingAlerts` from that query) and T231 → T222 (the
sweep's skip filter is only meaningful once a round trip advances the device's
last-seen time through `TouchDevice`). T230 needs the Planning and Reminders adapters
and builds Profile's two itself. Mobile T240 → T241 → T242 → T243/T244 → T245/T246.
T260 last.

## Verification gate

1. `pnpm --filter @botvy/backend test` — recurrence both modes, every conflict row,
   claim atomicity under two concurrent sweeps, quiet-hours shift, alert cancellation,
   full-vs-delta sweep, deleting a completed and a cancelled task leaving each status
   as it was, the label name's partial unique index, the re-plan after a time-zone
   change, the past-moment refusal and the daylight-saving gap.
2. `cd apps/mobile && flutter test && flutter analyze` — the drift ladder, the
   `pendingOp` filter regression and the alarm-plan parity test (T246) among them, and
   Today rendering under 300 ms on the seeded 2,000-row database (SC-005).
3. Manual: reminder two minutes out fires in airplane mode and snoozes; a task
   created in the extension shows on the phone in under 10 seconds; the same task
   edited offline on two devices converges and the loser is shown the winner; a
   device that synced after planning receives no duplicate from the sweep; a deleted
   task is found and restored inside 15 seconds (SC-006, timed by hand — nothing
   automates it).
4. `/health` shows `notifications.sweep` fresh; the sweep's output records
   `claimed`, `sent`, `skippedLocal`, `expired`, `purged` — `purged` being the total
   the Planning and Reminders `PurgeTombstones` handlers reported back, not a count
   of rows Notifications deleted itself.
5. `ping` gone: `POST /api/v1/ping` → 404, and n8n has no `ping_echo` workflow.

## Gate evidence — 10 September 2026

Run against the live stack after a **clean** image rebuild, with the compiled
code confirmed present in the container (`dist/contexts/{planning,reminders,notifications,sync}`
there, `dist/contexts/operations/features/ping` gone).

| Gate | Result | Note |
|---|---|---|
| `node infra/verify.mjs` (P0) | **4/5** | The fifth is the n8n API key, which only n8n's UI can mint — I1 |
| `node infra/verify-p1.mjs` | **13/13** | Identity and Profile, unaffected by P2 |
| `node infra/verify-p2.mjs` | **14/14** | New this phase |
| `pnpm --filter @botvy/backend test` | **635 pass** | 45 files |
| `cd apps/mobile && flutter test` | **138 pass** | including SC-005 and the two regressions |
| `flutter analyze` | clean | |
| `packages/sdk` tests | **78 pass** | |
| `npx wxt build` (extension) | clean | 632 kB |
| `pnpm lint` | 0 warnings, 0 errors | This line first read `npx oxlint`, which is **not** the project's lint: oxlint discovers `.oxlintrc.json` and this repo's config is `oxlint.json`, so the bare command silently ran 99 built-in rules over 476 files — `legacy/` included, since it also lost the ignore list — instead of the 102 rules the config defines. The three `no-restricted-imports` overrides that enforce constitution IX were among the missing three. Corrected in P3, which probed both forms; the rules do fire under `--config`. |
| `npm run build:clean` (backend) | clean | not incremental — see below |
| `node infra/verify-esm.mjs` | **3/3** | both compiled roles load under plain `node` |

Logs: `T264-verify-p0-20260910T112305Z.log`, `T264-verify-p1-20260910T112305Z.log`, `T264-verify-p2-20260910T112305Z.log`

### What running it actually found

Five defects, none of them visible to a green unit suite, and three of them
already shipped in this phase's own earlier commits:

1. **`AlertSchema` had no `updatedAt`.** Mongoose's `strict: true` rejected
   every alert upsert, so **no alert had ever been created** — the whole
   notification pipeline was dead while 38 unit tests passed, because the
   in-memory adapter has no schema. The evidence was four undelivered outbox
   rows carrying the exact message.
2. **A tombstoned label did not free its name.** The mapper omitted
   `nameLower`, and `$set` leaves fields it is not given alone, so the partial
   unique index kept holding the name. `MongoRepositoryBase` now reads
   `undefined` as `$unset`.
3. **`import { RRule } from 'rrule'`** was `undefined` at runtime — CommonJS
   package, ESM consumer, vitest's own interop hiding it. `node dist/main.js`
   could not boot.
4. **`PREFERENCE_FIELDS` imported from a module that imports without
   re-exporting it.** Compiles, because TypeScript follows the import graph;
   fails at load, because an ES module exports only what it declares.
5. **`nest build` was incremental and therefore vacuous.** A stale
   `tsconfig.build.tsbuildinfo` meant two real type errors were invisible
   locally and surfaced only in the container's clean build. Hence
   `npm run build:clean`.

The gate's own first run scored 8/13, and two of those five failures were the
gate being wrong rather than the code: it called `/internal/notifications/sweep`
through the edge, which Caddy deliberately does not route (constitution V), and
it asserted that deleting an account stops an access token already issued,
which a JWT cannot promise. Both corrected, with the reasoning in the file.

### Still outstanding

- **RTL screenshots** (T262) — needs a physical device, I3.
- **The n8n workflow import** — needs the API key, I1. `notifications_sweep.json`
  is committed and `bootstrap.mjs` will import it the moment the key is set.
- **The manual gate steps** in the phase's own verification list: the
  airplane-mode alarm, the extension-to-phone propagation timing, and the
  15-second Deleted-view recovery (SC-006). All three need a handset.

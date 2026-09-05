# Tasks: Tasks, Labels, Reminders, Notifications, Sync (P2)

**Input**: `spec.md`, `plan.md`; blueprint data-model §2.2–2.4, `contracts/sync.md`,
`contracts/events.md`.

**Tests**: mandatory for recurrence (both modes), the conflict rule table, alert
claim atomicity, quiet-hours shifting, cancellation on source change, full-vs-delta
sweep, the drift ladder and the `pendingOp` filter.

## Phase 1 — Planning context

- [ ] T201 `contexts/planning/domain/`: `task.aggregate.ts` (schedule, edit, complete with recurrence advance, reopen, cancel, defer, tombstone, restore, purge, skipOccurrence), `label.aggregate.ts`, `recurrence.ts` (`rrule` wrapper: `next(after)`, `skip(date)`, `humanText`, mode), ports `task.repository.ts`, `label.repository.ts`, `task-read.repository.ts`
- [ ] T202 [P] `infrastructure/`: mongo adapters (indexes per data-model), schemas, mappers (upcast by `schemaVersion`), in-memory adapters
- [ ] T203 [P] Slices `create-task/ update-task/ complete-task/ reopen-task/ cancel-task/ defer-task/ delete-task/ restore-task/ purge-task/ skip-occurrence/` — each raising its event; specs with the in-memory adapter
- [ ] T204 [P] Slices `create-label/ update-label/ delete-label/` + the Planning-internal snapshot refresh on `LabelUpdated`; spec: rename shows on tasks; duplicate name refused
- [ ] T205 [P] Queries `tasks(filter)` (Today, Upcoming, Overdue, by label, Completed, Deleted; cursor pagination), `labels` (with open counts), `task(id)`
- [ ] T206 `rollover/` slice (used by P3): move named tasks to a date, `deferCount++`, raise `TaskDeferred`

## Phase 2 — Reminders context

- [ ] T210 `contexts/reminders/`: domain aggregate + port, mongo and in-memory adapters, mappers
- [ ] T211 [P] Slices `create/ update/ snooze/ complete/ cancel/ reactivate/ delete/ restore/ purge/ clear-deleted` and query `reminders(view)`; spec: restore keeps status, purge refused for a live row, reactivate requires a new moment

## Phase 3 — Notifications context (US5, US6)

- [ ] T220 `contexts/notifications/domain/`: `alert.aggregate.ts` (plan, claim, markSent, markFailed), `alert.repository.ts` port; `infrastructure/mongo-alert.repository.ts` with `claim()` as `findOneAndUpdate({_id, claimedAt: null})` and the unique index from the data model; in-memory adapter
- [ ] T221 `features/plan-alerts-saga/` — `@EventsHandler` for `TaskScheduled|Rescheduled|Completed|Cancelled|Deleted` and `ReminderScheduled|Rescheduled|Snoozed|Completed|Cancelled|Deleted|Purged`; reconciles the desired alert set; expands lead times from preferences; applies quiet hours to system-generated alerts only; specs for each transition
- [ ] T222 `features/sweep/` — service-only `POST /internal/notifications/sweep`: due + unsent, group by user, no push device → leave unsent, filter `lastSeenAt < plannedAt`, claim, send, reap invalid tokens, expire, purge tombstones, heartbeat; spec: two concurrent sweeps send once; a synced device is skipped
- [ ] T223 [P] `features/pending-alerts/` (next 7 days, for the phone to schedule locally) and `features/send-test/`
- [ ] T224 [P] `workflows/notifications_sweep.json` (cron 5 min + webhook, retry 3×/5 s, error workflow set) and its import in `bootstrap.mjs`

## Phase 4 — Sync facade (US7)

- [ ] T230 `contexts/sync/domain/syncable-entity.port.ts` + `infrastructure/sync-registry.ts` (multi-provider token); Planning, Reminders and Profile register adapters
- [ ] T231 `features/sync/` — `POST /api/v1/sync`: apply pushes parents-first (labels → tasks), conflict rule per `contracts/sync.md`, cursor `now − 5 s`, `full` when `since` is null or older than `reminders.tombstoneDays`, pull per entity, `pendingAlerts`, stamp `devices.lastSeenAt`, raise `sync.ChangesApplied`; specs cover every row of the conflict table and the full-vs-delta rule
- [ ] T232 [P] `ChangesApplied` handler → `sync.nudge` to the member's other sockets + FCM data nudge to disconnected devices

## Phase 5 — Mobile

- [ ] T240 Drift 2 → 3: `tasks`, `labels`, `reminders`, `alerts_local` with the `SyncColumns` mixin, guarded branches, indexes; ladder test opening a v2-shaped file
- [ ] T241 `core/sync/sync_engine.dart` — generalised v1 engine: single-flight latch with one queued re-run, connectivity + resume + explicit kick triggers, apply order, rejection branching on `entity`, delete sweep only on `full`, `pushAttempts` cap with a retry affordance, `rescheduleAll()` every pass; port `sync_test.dart` cases
- [ ] T242 `core/notifications` — plan from local rows + `pendingAlerts`, quiet hours, notification actions (complete, snooze), exact-alarm permission surface, cap at 50 with rolling re-plan, no retroactive firing; port `notificationIdFor` and `planPings`
- [ ] T243 [P] `features/tasks` — Today (grouped "To Do — Today"), Upcoming, Overdue, by label, Completed, Deleted; create/edit sheet (date + time picker, priority, label, repeat rule, estimate); swipe complete/cancel; delete with undo; label editor with palette and free colour
- [ ] T244 [P] `features/reminders` — ported screens on Cubits: list with sync badges, editor with lead chips, deleted view with restore/reactivate/erase, snooze
- [ ] T245 [P] Cubit specs for tasks and reminders against the in-memory drift database

## Phase 6 — Extension and packages

- [ ] T250 [P] Extension: Dexie `tasks`, `labels`, `pending_ops`; sync round trip with the entity subset; Today list with complete/undo; quick add; sync indicator
- [ ] T251 [P] `packages/sdk`: `TasksStore`, `LabelsStore`, `SyncStore` (cursor, push queue, rejection handling) shared by the extension and the frontend
- [ ] T252 [P] `pnpm gen:contracts` regenerated; mobile REST models regenerated

## Phase 7 — Retire the demo and polish

- [ ] T260 Remove the `ping` slice, `pings` collection migration, `ping_echo.json` and the default subscription; the spine is now proven by `planning.TaskScheduled` (blueprint F-13)
- [ ] T261 [P] `migrate-mongo` script for the new collections' indexes
- [ ] T262 [P] Arabic strings for tasks and reminders; RTL screenshots
- [ ] T263 Record gate evidence; open `017-daily-rhythm`

## Dependencies

T201 → T202/T203/T204/T205. T210 → T211. T220 → T221 → T222. T230 needs adapters
from Planning, Reminders and Profile. Mobile T240 → T241 → T242 → T243/T244.
T260 last.

## Verification gate

1. `pnpm --filter @botvy/backend test` — recurrence both modes, every conflict row,
   claim atomicity under two concurrent sweeps, quiet-hours shift, alert cancellation,
   full-vs-delta sweep.
2. `cd apps/mobile && flutter test && flutter analyze`.
3. Manual: reminder two minutes out fires in airplane mode and snoozes; a task
   created in the extension shows on the phone in under 10 seconds; the same task
   edited offline on two devices converges and the loser is shown the winner; a
   device that synced after planning receives no duplicate from the sweep.
4. `/health` shows `notifications.sweep` fresh; the sweep's output records
   `claimed`, `sent`, `skippedLocal`, `expired`, `purged`.
5. `ping` gone: `POST /api/v1/ping` → 404, and n8n has no `ping_echo` workflow.

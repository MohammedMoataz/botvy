# Implementation Plan: Tasks, Labels, Reminders, Notifications, Sync (P2)

**Branch**: `016-tasks-labels-reminders` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/016-tasks-labels-reminders/spec.md`; blueprint data-model §2.2–2.4,
contracts `rest-commands.md` (Planning, Reminders, Notifications), `sync.md`,
`events.md`; research R-05, R-17, R-18, R-31.

## Summary

Three domain contexts (Planning, Reminders, Notifications) and the Sync facade. The
phase's weight is not the CRUD: it is the alert pipeline (device-first with a
claim-before-send server fallback) and the sync protocol generalised into per-context
adapters, both ported from v1's tested behaviour and reshaped onto the repository
ports.

## Technical Context

**Language/Version**: TypeScript 5.x / Node 24; Dart 3.5 / Flutter

**Primary Dependencies**: added — `rrule` (recurrence), `date-fns-tz` only if
`shared/time` proves insufficient (prefer not); mobile — `flutter_local_notifications`
(ported), `timezone`, `flutter_slidable`, `flutter_colorpicker`

**Storage**: MongoDB `tasks`, `labels`, `reminders`, `alerts`; phone drift `tasks`,
`labels`, `reminders`, `alerts_local` (schemaVersion 2 → 3); extension Dexie `tasks`,
`labels`, `pending_ops`

**Testing**: vitest — recurrence advance in both modes, conflict-rule table, claim
atomicity, quiet-hours shifting, alert cancellation on source change, full-vs-delta
sweep; flutter — ladder test, alarm planning mirrors the server, `pendingOp` filter
regression, offline create/edit/delete round trip

**Performance Goals**: Today query < 50 ms server-side for 5,000 tasks; sweep of
200 alerts < 2 s; phone Today render < 300 ms at 2,000 rows

**Constraints**: alarms must work with the process killed; no retroactive firing; the
deletion horizon is one setting read by both the sweep and the sync

**Scale/Scope**: ~70 backend files, ~30 mobile files, ~10 extension files

## Constitution Check (v2.1.0)

| Principle | Status | How |
|---|---|---|
| I. Store per context | PASS | Planning, Reminders and Notifications each own their collections; Notifications learns about sources only from events |
| II. n8n infrastructure only | PASS | `notifications_sweep.json` calls `/internal/notifications/sweep`; no logic in the workflow |
| III. Local-first LLM | PASS | No inference |
| IV. Forward-only migrations | PASS | One `migrate-mongo` script; drift 2 → 3 with guarded branches and a ladder test |
| V. Single public surface | PASS | New routes behind Caddy |
| VI. Multi-user, principals | PASS | Every query and command scoped by `userId`; the sweep is service-only |
| VII. Test-then-verify | PASS | Every branchy rule listed under Testing has a spec; fixtures relative to `Date.now()` |
| VIII. YAGNI | PASS | No sub-tasks, no sections, no time-boxing; the estimate is stored unused |
| IX. Contexts, slices, ports | PASS | Sync depends only on the `SyncableEntity` port each context implements |
| X. Commands / queries / streams | PASS | Writes REST, reads GraphQL, `sync.nudge` over the socket |
| XI. Times belong to the user | PASS | Due dates stored as instants; "today" computed in the member's zone; DST gap rule in `shared/time` |
| XII. Configuration | PASS | `reminders.tombstoneDays`, `notifications.sweepBatch`, `notifications.expiryHours`, `labels.palette` in the registry; lead times and quiet hours per member |

## Design

### Planning context

```text
contexts/planning/
├── domain/ task.aggregate.ts · label.aggregate.ts · recurrence.ts (rrule wrapper: next(after), skip(date), mode)
│          task.repository.ts · label.repository.ts · task-read.repository.ts (ports)
├── infrastructure/ mongo-*.repository.ts · schemas · mappers · in-memory-*.ts
└── features/ create-task/ update-task/ complete-task/ reopen-task/ cancel-task/ defer-task/ delete-task/ restore-task/ purge-task/ skip-occurrence/ rollover/
             create-label/ update-label/ delete-label/
             tasks-query/ labels-query/ task-query/
```

`Task.complete()` decides the next occurrence: mode `schedule` →
`recurrence.next(after: currentDueAt)`; mode `completion` →
`recurrence.next(after: completedAt)` preserving the time of day. Completing a
repeating task closes the current instance and raises `TaskScheduled` for the new
`dueAt` on the same document (one row per series, as the blueprint models it).
`Label.rename/recolour` raises `LabelUpdated`; a Planning-internal handler refreshes
the embedded `label` snapshot on that member's tasks in one bulk write (same context,
so it is a direct repository call, not an event hop).

### Reminders context

Ported v1 behaviour onto the ports: `create/update/snooze/complete/cancel/reactivate/
delete/restore/purge`, `leadTimes` expansion moved out of the domain and into
Notifications (the reminder raises `ReminderScheduled { remindAt, leadTimes }`; the
saga expands). Snooze sets `snoozedUntil` and raises `ReminderSnoozed` so alerts are
re-planned. Restore never rewrites `status`.

### Notifications context — the alert pipeline

```text
contexts/notifications/
├── domain/ alert.aggregate.ts (plan, claim, markSent, markFailed) · alert.repository.ts (port)
├── infrastructure/ mongo-alert.repository.ts (claim = findOneAndUpdate {claimedAt:null}) · in-memory
└── features/ plan-alerts-saga/ (EventsHandler for Task*/Reminder* events)
             sweep/ (internal, service-only)
             pending-alerts/ (query used by /sync)
             send-test/
```

`AlertPlanningSaga` translates every source event into a desired alert set and
reconciles: `TaskScheduled { dueAt }` → one alert at `dueAt` plus the member's
default lead times when the task is timed; `ReminderScheduled` → one per lead time;
`TaskCompleted|Cancelled|Deleted`, `ReminderCompleted|Cancelled|Deleted` → delete
unsent alerts for that source. Quiet hours: an alert the system generated whose
`notifyAt` falls inside the window is planned at the window's end; an alert whose
source is a member-chosen moment (a reminder, a task with an explicit time) is not
moved (FR-014).

`Sweep` (called by n8n every 5 minutes): find due unsent alerts (`sweepBatch`), group
by user, resolve devices through the Identity `DevicesQuery`; if none has a push
token, leave unsent; filter to devices with `lastSeenAt < alert.plannedAt`; claim
atomically; send through `shared/push`; delete devices FCM reports invalid; expire
alerts older than `expiryHours`; purge tombstones past `reminders.tombstoneDays`;
stamp `ops_heartbeats['notifications.sweep']`.

### Sync facade

```text
contexts/sync/
├── domain/ syncable-entity.port.ts (name, pull(userId, since, full), apply(userId, change), purgeHorizonDays)
├── infrastructure/ sync-registry.ts (collects adapters from every context module)
└── features/ sync/ (POST /api/v1/sync — apply pushes parents-first, compute cursor, pull, stamp lastSeenAt, emit ChangesApplied)
```

Each context registers its adapter (`TaskSyncAdapter`, `LabelSyncAdapter`,
`ReminderSyncAdapter`, plus Profile's patch adapters from P1) via a Nest multi-provider
token. The conflict rule, the 5-second cursor lag, the full-snapshot rule and the
rejection shape are exactly the blueprint's `contracts/sync.md`. `ChangesApplied`
triggers `sync.nudge` to the member's other sockets, and an FCM data message to
devices that are not connected.

### Mobile

`features/tasks` (Today with the "To Do — Today" grouping, Upcoming, Overdue, by
label, Completed, Deleted with restore and erase; swipe actions; label editor with
palette + free colour), `features/reminders` (ported screens: list, editor with lead
chips, deleted view, undo snackbars, snooze from the notification action).
`core/sync/sync_engine.dart` — the v1 engine generalised over the drift mixin, with
the single-flight latch, connectivity and resume triggers, and `rescheduleAll()`
after every pass. `core/notifications` gains task and quiet-hours awareness and
notification actions (complete, snooze). Drift 2 → 3 adds `tasks`, `labels`,
`reminders`, `alerts_local` with guarded branches.

### Extension

Dexie tables for tasks and labels, the same sync round trip with
`entities: ['tasks','labels']`, Today list with complete/undo, quick add. The
side panel re-mounts, so cursor and pending ops live in Dexie, tokens in
`chrome.storage`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Alerts as their own context rather than fields on tasks/reminders | Meetings (P5) and the rhythm (P3) need the same pipeline; the sweep must claim rows atomically | Per-source scheduling duplicates the claim, the quiet-hours rule and the device filter three times |
| One row per repeating task instead of materialised occurrences | The blueprint's rule (R-17); the phone can plan the next alarm from the rule | Materialising rows multiplies sync volume and makes "skip one" ambiguous |

## Verification gate

```powershell
pnpm --filter @botvy/backend test        # recurrence both modes, conflict table, claim atomicity, quiet hours, cancellation, full-vs-delta
cd apps/mobile; flutter test; flutter analyze
# manual: airplane-mode reminder fires and snoozes; task created in the extension appears on the phone < 10 s;
#         two offline edits converge with the loser shown the winner; sweep sends nothing to a synced device
curl -s http://localhost/health | jq '.jobs["notifications.sweep"]'
```

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
sweep, deleting leaves the status untouched, the label name's partial unique index,
a re-planned alert after a time-zone change, the refusal of a past moment and the
daylight-saving gap; flutter — ladder test, alarm planning mirrors the server,
`pendingOp` filter regression, offline create/edit/delete round trip, Today's render
time on a seeded 2,000-row database

**Performance Goals**: Today query < 50 ms server-side for 5,000 tasks; sweep of
200 alerts < 2 s; phone Today render < 300 ms at 2,000 rows

**Constraints**: alarms must work with the process killed; no retroactive firing; the
deletion horizon is one setting read by both the sweep and the sync

**Scale/Scope**: ~70 backend files, ~30 mobile files, ~10 extension files

## Constitution Check (v2.1.1)

| Principle | Status | How |
|---|---|---|
| I. Store per context | PASS | Planning, Reminders and Notifications each own their collections; Notifications learns about sources only from events, and the two places it used to reach across — purging another context's tombstones, and touching or removing a device — are `CommandBus` dispatches to the owner (Planning/Reminders `PurgeTombstones`, Identity `RemoveDevice`, Identity `TouchDevice` from the sync facade) |
| II. n8n infrastructure only | PASS | `notifications_sweep.json` calls `/internal/notifications/sweep`; no logic in the workflow |
| III. Local-first LLM | PASS | No inference |
| IV. Forward-only migrations | PASS | One `migrate-mongo` script, and it is the only place an index is declared; drift 2 → 3 with guarded branches and a ladder test |
| V. Single public surface | PASS | New routes behind Caddy |
| VI. Multi-user, principals | PASS | Every query and command scoped by `userId`; the sweep is service-only |
| VII. Test-then-verify | PASS | Every branchy rule listed under Testing has a spec; fixtures relative to `Date.now()` |
| VIII. YAGNI | PASS | No sub-tasks, no sections, no time-boxing; the estimate is stored unused |
| IX. Contexts, slices, ports | PASS | Sync depends only on the `SyncableEntity` port each context implements; Planning publishes `TasksDueQuery` and `TasksOpenBeforeQuery` on the `QueryBus` so P3 and P5 never open its collection |
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
             tasks-due-query/ tasks-open-before-query/ (QueryBus, for other contexts)
```

Two of those queries exist for other contexts rather than for a screen.
`TasksDueQuery(userId, date)` answers with the member's tasks due on a date and
`TasksOpenBeforeQuery(userId, date)` with the ones still open before a moment; both
are `@QueryHandler`s on the `QueryBus`, and they are the only way P3's evening draft
and P5's agenda ever see a task. Declaring them here is what keeps those phases from
binding a port straight to Planning's read repository.

`Task.complete()` decides the next occurrence: mode `schedule` →
`recurrence.next(after: currentDueAt)`; mode `completion` →
`recurrence.next(after: completedAt)` preserving the time of day. Completing a
repeating task closes the current instance and raises `TaskScheduled` for the new
`dueAt` on the same document (one row per series, as the blueprint models it).
`Label.rename/recolour` raises `LabelUpdated`; a Planning-internal handler refreshes
the embedded `label` snapshot on that member's tasks in one bulk write (same context,
so it is a direct repository call, not an event hop).

Every row a client can create offline — a task, a label, a reminder — carries the id
the client minted, a UUIDv7 the server accepts as given (`contracts/rest-commands.md`,
research R-05). A create whose id already exists is answered as the create that
already happened rather than refused, which is what makes a retried push after a
dropped connection cost nothing and FR-016's "without duplicates" true at the
protocol level rather than by luck. Server-only rows — alerts among them — keep
ObjectIds. Indexes are declared in the `migrate-mongo` script alone (T200): the
Mongoose schemas describe shape and never call `index()`, so there is one forward-only
owner of every index and the label-name uniqueness test has its partial index from
Phase 1 onward.

`defer-task` is the slice behind US3-3: it moves the task to the new day, increments
`deferCount`, records `deferredFrom` and raises `TaskDeferred`. `rollover` (T206)
does the same thing for a whole set of tasks at P3's request, and it does it by
calling the same aggregate method — the count is a property of deferring, not of the
nightly job.

### Reminders context

Ported v1 behaviour onto the ports: `create/update/snooze/complete/cancel/reactivate/
delete/restore/purge`, `leadTimes` expansion moved out of the domain and into
Notifications (the reminder raises `ReminderScheduled { remindAt, leadTimes }`; the
saga expands). Snooze sets `snoozedUntil` and raises `ReminderSnoozed` so alerts are
re-planned. Restore never rewrites `status`. `create` and `update` refuse a
`remindAt` already behind the member's own clock with `remind_at_past`, naming the
reason; the client offers the same clock time on the next day and sends that
instead — the server never silently moves a moment the member chose. A `remindAt`
that falls in a daylight-saving gap is resolved through `shared/time` to the first
valid instant after it, never by reading the server's own `TZ`.

### Notifications context — the alert pipeline

```text
contexts/notifications/
├── domain/ alert.aggregate.ts (plan, claim, markSent, markFailed) · alert.repository.ts (port)
├── infrastructure/ mongo-alert.repository.ts (claim = findOneAndUpdate {claimedAt:null}) · in-memory
└── features/ plan-alerts-saga/ (EventsHandler for Task*/Reminder*, identity and profile events)
             sweep/ (internal, service-only)
             pending-alerts/ (query used by /sync)
             send-test/
```

`AlertPlanningSaga` translates every source event into a desired alert set and
reconciles: `TaskScheduled { dueAt }` → one alert at `dueAt` plus the member's
default lead times when the task is timed; `ReminderScheduled` → one per lead time;
`TaskCompleted|Cancelled|Deleted`, `ReminderCompleted|Cancelled|Deleted` → delete
unsent alerts for that source.

Quiet hours turn on the distinction the spec draws beside FR-014, and the saga is
where it lives: the alert at the moment the member chose — a reminder's `remindAt`,
a task's own `dueAt` — is never moved, and every lead-time alert is one the system
derived, so one falling inside the window is planned at the window's end instead.
Nothing else is exempt; a later source (a meeting, the evening prompt) inherits the
same reading without a new rule.

The saga also listens outside Planning and Reminders, because an alert's correct
moment depends on facts those contexts do not own. `profile.ProfileUpdated { changed }`
naming `timezone` re-plans every one of that member's future alerts from its source's
local time — this is the branch that matters, because resolving a due time against
the server's clock rather than the member's zone once shifted every extracted reminder
by three hours, and a member who moves zones reproduces that bug exactly unless the
planned instants are recomputed. `profile.PreferencesChanged { changed }` naming the
default lead times re-plans the *derived* alerts of every future source with the new
set and leaves each member-chosen moment where it is. `identity.UserBanned` deletes
the member's unsent alerts and `identity.UserUnbanned` re-plans from the sources still
live, so nothing reaches a banned member and nothing is lost by the ban either.
`identity.DeviceRegistered` and `DeviceRemoved` re-plan the pending alerts for push,
which is what makes a phone registered a minute ago a candidate for the sweep and a
removed one stop being one.

`Sweep` (called by n8n every 5 minutes): find due unsent alerts
(`settings.notifications.sweepBatch`), group by user, resolve devices through the
Identity `DevicesQuery`; if none has a push token, leave unsent; filter to devices
with `lastSeenAt < alert.plannedAt`; claim atomically; send through `shared/push`;
raise `notifications.AlertSent { alertId, source, deviceIds }` for each row it
delivered and `AlertFailed { …, error }` for each it could not, which is what P4
turns into `alert.fired` on the socket and P9 shows in the extension; expire alerts
older than `settings.notifications.expiryHours`; stamp
`ops_heartbeats['notifications.sweep']`.

Two of the sweep's old duties belong to other contexts and are dispatched, not done.
Purging tombstones past `settings.reminders.tombstoneDays` is a `PurgeTombstones
{ userId?, before }` command sent over the `CommandBus` to Planning and to Reminders,
each of which purges its own collections; a push token FCM reports invalid is a
`RemoveDevice { deviceId }` command to Identity, whose Postgres row it is. The sweep
counts what the handlers report and keeps the same `{ claimed, sent, skippedLocal,
expired, purged }` shape (`contracts/internal.md`) — the difference is who holds the
write, which is principle I and the reason this phase's Constitution Check can say
PASS honestly.

### Sync facade

```text
contexts/sync/
├── domain/ syncable-entity.port.ts (name, pull(userId, since, full), apply(userId, change), purgeHorizonDays)
├── infrastructure/ sync-registry.ts (collects adapters from every context module)
└── features/ sync/ (POST /api/v1/sync — apply pushes parents-first, compute cursor, pull, touch the device, emit ChangesApplied)
```

Each context registers its adapter (`TaskSyncAdapter`, `LabelSyncAdapter`,
`ReminderSyncAdapter`) via a Nest multi-provider token. Profile's two —
`ProfilePatchAdapter` and `PreferencesPatchAdapter` — are built here as well, in the
Profile context: the blueprint places them in P2 and P1 shipped the aggregates
without them, so this phase is where they first exist. Both skip the conflict check
outright (`contracts/sync.md`): the fields a client may patch and the fields the
server's own jobs write are disjoint sets, so there is no version to lose and a
`baseUpdatedAt` comparison would only invent rejections. The conflict rule for
everything else, the 5-second cursor lag, the full-snapshot rule and the rejection
shape are exactly the blueprint's `contracts/sync.md`.

Stamping the device's last-seen time — the fact the sweep's skip filter rests on — is
a `TouchDevice { deviceId, at }` command dispatched to Identity over the `CommandBus`,
never a write from the sync facade into Identity's PostgreSQL row. `ChangesApplied`
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

## Decisions taken here

Three points the blueprint leaves open are settled the way its contracts and the
constitution imply, and are recorded so a later phase does not re-open them. Resuming
after `identity.UserUnbanned` re-plans from the sources that are still live rather
than resurrecting the deleted alert rows, because the alert set is derived state and
the sources are the record. A `remindAt` in the past is refused rather than quietly
moved, since principle XI makes the member's clock the authority and moving their
moment for them is precisely the silent shift it forbids. And Profile's two patch
adapters live in the Profile context but are built by this phase, because an adapter
belongs to the context whose store it reads and nothing before P2 had a `/sync` to
register with.

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
#         two offline edits converge with the loser shown the winner; sweep sends nothing to a synced device;
#         a deleted task is found and restored in under 15 s (SC-006 — timed by hand, there is no automated stand-in)
curl -s http://localhost/health | jq '.jobs["notifications.sweep"]'
```

# Contract: event catalogue

Events are the only way contexts influence each other. Each is appended to the
`outbox` inside the producing transaction (Identity writes `identity_outbox` in the
same Prisma transaction; the worker forwards it) and relayed by the `worker` to in-process handlers/sagas and to n8n
webhook subscriptions. Envelope:

```jsonc
{ "eventId": "uuid", "name": "<context>.<Event>", "context": "planning", "aggregate": { "type": "task", "id": "…" },
  "userId": "…", "occurredAt": "ISO", "payload": { … }, "schemaVersion": 1 }
```

Consumers are idempotent on `eventId`. Payloads carry ids and the few fields a
consumer needs — never whole documents (consumers query their own read side).

| Event | Producer | Payload | Consumers (context → reaction) |
|---|---|---|---|
| `identity.UserRegistered` | Identity | `{ email, locale, timezone? }` | Profile → create `profiles` + `user_preferences` from `settings.defaults.*`; Conversations → create pinned `coach` + `planner`; Rhythm → create `rhythm_states`; Training → create empty `athlete_profiles` |
| `identity.UserBanned` / `UserUnbanned` | Identity | `{}` | Notifications → drop unsent alerts / resume; Conversations → close sockets |
| `identity.UserDeleted` | Identity | `{}` | every Mongo context → delete the user's documents; Notifications → drop alerts |
| `identity.DeviceRegistered` / `DeviceRemoved` | Identity | `{ deviceId, kind, hasPush }` | Notifications → (re)plan pending alerts for push |
| `identity.PasswordChanged` | Identity | `{ bySelf }` | Operations → `audit_log`; Operations → clear the seeded-admin warning |
| `profile.ProfileUpdated` | Profile | `{ changed: ['timezone','allergies',…] }` | Notifications → re-plan alert times when `timezone` changed; Nutrition → regenerate today's meal line when allergies/foods changed; Rhythm → nothing (reads live) |
| `profile.PreferencesChanged` | Profile | `{ changed: [...] }` | Rhythm → re-evaluate today's claims when times changed; Training → re-materialise when cutoff changed; Reminders → default lead times |
| `planning.TaskScheduled` | Planning | `{ taskId, dueAt, allDay, title, priority }` | Notifications → plan alerts (`0m`, and default lead times when timed); Rhythm → if `dueAt` is tomorrow and a draft exists, mark draft stale |
| | | | **Also raised by reopen, restore and the second half of completing a repeating task.** Its meaning is "this task now has a moment that wants alerts planned", and all four make that true — so there is no `TaskReopened` or `TaskRestored`. Two names with one identical handler is how a catalogue starts to lie. |
| `planning.TaskRescheduled` | Planning | `{ taskId, dueAt, allDay, title }` | Notifications → re-plan |
| | | | **Also raised by `defer`,** alongside `TaskDeferred`. The two say different things to different readers — the count is the rhythm's, the moment is Notifications' — and without this the nightly rollover moved every unfinished task and left its alerts at yesterday's time. `title` and `allDay` are here because the saga reads them; P3 found both missing, which is why every task notification was titled "Task due" and why editing a task silently dropped the member's lead times. |
| `planning.TaskCompleted` / `TaskCancelled` / `TaskDeleted` | Planning | `{ taskId, at, recurrenceAdvancedTo? }` | Notifications → drop unsent alerts; Rhythm → update today's plan snapshot status; Conversations → nothing |
| `planning.TaskDeferred` | Planning | `{ taskId, fromDate, toDate, deferCount }` | Rhythm → surface "carried over ×N" in the evening prompt. Notifications listens to the `TaskRescheduled` raised beside it, not to this. |
| `planning.LabelUpdated` / `LabelDeleted` | Planning | `{ labelId, name, color }` | Planning (self) → refresh label snapshots on tasks (same context, done in handler) |
| `reminders.ReminderScheduled` / `ReminderRescheduled` / `ReminderSnoozed` | Reminders | `{ reminderId, remindAt, leadTimes }` | Notifications → (re)plan alerts |
| `reminders.ReminderCompleted` / `ReminderCancelled` / `ReminderDeleted` / `ReminderPurged` | Reminders | `{ reminderId }` | Notifications → drop unsent alerts |
| `notifications.AlertSent` / `AlertFailed` | Notifications | `{ alertId, source, deviceIds, error? }` | Operations → usage/audit; Conversations → `alert.fired` to sockets |
| `rhythm.PlanTomorrowPrompted` | Rhythm | `{ date, taskIds, trainingSessionId, mealLine }` | Notifications → **one member-chosen (`0m`) alert, source `rhythm:plan:<date>`, no lead times and not shifted by quiet hours** (FR-013: the member chose this time); Conversations → the touch is written into the coach chat by the rhythm itself and pushed as `chat.message` |
| `rhythm.EndOfDaySummarySent` | Rhythm | `{ date, taskIds, trainingSessionId, autoConfirmed, checkinAsked }` | Notifications → one member-chosen alert, source `rhythm:end_of_day:<date>`; Conversations → written by the rhythm and pushed; Planning → `rollover` for the tasks in `taskIds` that are open and due **before** `date` began in the member's zone |
| `rhythm.PlanConfirmed` / `PlanSkipped` | Rhythm | `{ date, taskIds, autoConfirmed }` | Rhythm (self) → the morning briefing reads the stored plan; no handler subscribes, so these are for n8n and the audit trail |
| `rhythm.MorningBriefingSent` | Rhythm | `{ date, taskIds }` | Notifications → one member-chosen alert, source `rhythm:morning:<date>`; Conversations → written by the rhythm and pushed |
| `rhythm.CheckinRecorded` | Rhythm | `{ date, mood, adhered }` | Conversations → adjust quick questions by mood (P4); the streak is folded in the same transaction by the handler that raises this, not by a consumer of it — a streak that arrived through the relay would lag the answer the member just gave |
| `training.SportsChanged` / `SlotsChanged` | Training | `{ sports, slots }` | Training (self) → re-materialise sessions 14 days |
| `training.SessionScheduled` | Training | `{ sessionId, plannedAt, sport, focus?, suggestionId? }` — `suggestionId` is present when the session came from an accepted suggestion, so Knowledge can record the outcome without guessing | Notifications → alert (lead time from preferences); Rhythm → include in tomorrow's draft; Knowledge → **if `aiSuggestions`** generate a suggestion for this session; n8n subscribers |
| `training.SessionCompleted` / `SessionCancelled` / `SessionSkipped` | Training | `{ sessionId, at }` | Notifications → drop alerts; Rhythm → today's plan snapshot; Knowledge → mark suggestion outcome |
| `training.ProgramApplied` | Training | `{ programId, startDate }` | Training (self) → fill sessions; Conversations → coach message |
| `knowledge.LinkAdded` | Knowledge | `{ linkId, url, kind }` | Knowledge worker → start ingestion pipeline |
| `knowledge.LinkStateChanged` | Knowledge | `{ linkId, status, failReason? }` | Conversations → `sync.nudge{links}`; Operations → ingestion queue stats |
| `knowledge.LinkIngested` | Knowledge | `{ linkId, docId, tags }` | Knowledge (self) → children/playlist rollup; Conversations → coach message "I read …" |
| `knowledge.SuggestionReady` | Knowledge | `{ suggestionId, forDate, sport, sessionId? }` | Notifications → alert `suggestion`; Conversations → `chat.message` in coach |
| `knowledge.SuggestionAccepted` / `SuggestionDismissed` | Knowledge | `{ suggestionId, sessionId? }` | Training → fill/create session |
| `nutrition.MealPlanReady` / `MealPlanWithheld` | Nutrition | `{ date, line?, reason? }` | Rhythm → update draft's `mealLine` |
| `conversations.MessageSent` | Conversations | `{ conversationId, seq, role }` | The socket push happens in `append-message` itself, not through the relay: a chat frame that waited for the change stream would arrive after the member had already scrolled. This event is for n8n, for usage in P10, and for the `sync.nudge` to the member's *other* devices |
| `conversations.ConversationCreated` | Conversations | `{ conversationId, kind, pinned }` | (informational; the two pinned chats are created from `identity.UserRegistered` in P3) |
| `conversations.IntentDetected` | Conversations | `{ seq, intent, args }` | (informational; the handler dispatches commands directly) |
| `meetings.MeetingScheduled` / `MeetingChanged` / `OccurrenceSkipped` / `OccurrenceMoved` | Meetings | `{ meetingId, startAt, rrule?, reminderOffsets, prepMinutes }` | Notifications → (re)plan alerts for occurrences in the next 14 days (offsets + prep) |
| `meetings.MeetingCompleted` / `MeetingCancelled` / `MeetingDeleted` | Meetings | `{ meetingId }` | Notifications → drop alerts |
| `sync.ChangesApplied` | Sync | `{ installId, entities }` | Conversations → `sync.nudge` to the user's **other** sockets |
| `operations.SettingChanged` | Operations | `{ key }` | all → invalidate settings cache; Notifications/Rhythm re-read |
| `operations.WorkflowRun` / `UserRoleChanged` | Operations | `{ … }` | `audit_log` |

## Sagas (process managers)

| Saga | Listens | Does |
|---|---|---|
| `AlertPlanningSaga` (Notifications) | every *Scheduled/Rescheduled/Completed/Cancelled/Deleted* above | keeps `alerts` consistent with sources; rolling 14-day window for recurring meetings |
| `TomorrowDraftSaga` (Rhythm) | `TaskScheduled`, `SessionScheduled`, `MealPlanReady` | marks tomorrow's draft stale so the plan prompt (or the end-of-day touch) rebuilds it |
| `SessionMaterialiserSaga` (Training) | `SlotsChanged`, `ProgramApplied`, nightly tick | materialises planned sessions 14 days ahead |
| `SuggestionSaga` (Knowledge) | `SessionScheduled` (+ `aiSuggestions`) | generates a suggestion when the member has relevant sources |
| `UserLifecycleSaga` (all) | `UserRegistered`, `UserDeleted` | bootstraps / removes per-context documents |

## Webhook subscriptions (n8n) shipped by default

`training.SessionScheduled`, `knowledge.LinkIngested`, `rhythm.PlanTomorrowPrompted`
(all disabled until the owner enables them in admin → Automation). The relay
signs deliveries with `AUTOMATION_WEBHOOK_SECRET`.

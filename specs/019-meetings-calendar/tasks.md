# Tasks: Meetings & Calendar (P5)

**Input**: `spec.md`, `plan.md`; blueprint data-model §2.10, contracts.

**Task ids** are phase-local. The blueprint's own `tasks.md` runs a separate `T###`
series for its whole-platform outline; a number that appears in both files means two
different things, and neither is renumbered against the other.

**Tests**: mandatory for every recurrence case, override versus series edit, alert
window reconciliation, a time-zone change, agenda ordering, DST stability. Every date
in a fixture is computed from the current clock — the next 31st, the next daylight-saving
transition after `Date.now()` — never written as a literal date, which would pass until
the day the clock reached it.

## Phase 1 — Domain and expansion

- [ ] T501 `contexts/meetings/domain/`: `meeting.aggregate.ts` (schedule, edit with `force`, skipOccurrence, moveOccurrence, complete, cancel, tombstone, restore, purge past the `reminders.tombstoneDays` horizon), `calendar-event.aggregate.ts` (same lifecycle, including purge), ports
- [ ] T502 `domain/recurrence-expander.ts` — wall-time expansion in the member's zone (or `lockTimezone`), exdates, overrides keyed by `originalStart`, orphan overrides included; a repeating `calendar_events.recurrence` goes through this same expander, so a personal event skips and moves exactly as a meeting does; specs (dates derived from `Date.now()`, never literal): monthly on the 31st both ways, weekly first occurrence today, the next DST week keeps 18:00, move onto a skipped date clears the skip, series edit warns about an orphaned override, a repeating personal event expands identically
- [ ] T503 [P] `infrastructure/`: mongo adapters, schemas, mappers, in-memory adapters

## Phase 2 — Slices

- [ ] T510 [P] `create-meeting/ update-meeting/ complete-meeting/ cancel-meeting/ delete-meeting/ restore-meeting/ purge-meeting/` with events; a create that names no length takes the member's `defaults.meetingDurationMin` preference, and one that names neither a link nor an address is refused; spec: purge refuses a row that is not a tombstone
- [ ] T511 [P] `skip-occurrence/ move-occurrence/` — path parameters carry `originalStart`; both raise their events. There is deliberately no cancel-occurrence or complete-occurrence command: an outcome belongs to the meeting, a date is skipped or moved (FR-013)
- [ ] T512 [P] `create-event/ update-event/ delete-event/ purge-event/` for personal events, repeat included
- [ ] T513 [P] Queries `meeting(id)`, `meetings(includeCompleted)` with `nextOccurrence`, and `MeetingOccurrencesQuery(userId, from, to)` — the port Notifications' saga calls (T520); spec: it expands exactly what the agenda expands
- [ ] T514 [P] `MeetingSyncAdapter` and `CalendarEventSyncAdapter` registered with P2's sync registry (`SyncableEntity`): `pull` returns full rows with tombstones, `apply` covers `create|update|delete|restore|purge`, `purgeHorizonDays` reads `reminders.tombstoneDays`; specs: a stale push is rejected with `entity: "meetings"` and the server row, a purge of a live row is rejected `not_deleted`, a delete leaves `status` untouched

## Phase 3 — Alerts

- [ ] T520 Extend Notifications' `AlertPlanningSaga` (P2, worker) with a meetings branch — `MeetingScheduled|MeetingChanged|OccurrenceSkipped|OccurrenceMoved|MeetingCompleted|MeetingCancelled|MeetingDeleted`, reading occurrences through Meetings' `MeetingOccurrencesQuery` (T513) for the next `meetings.alertWindowDays` and reconciling the desired alert set; one alert per reminder offset plus a preparation alert when `prepMinutes > 0`; nothing outside Notifications touches `alerts`; specs: skip removes, move relocates, cancel and complete both clear, reconciliation run twice changes nothing
- [ ] T521 [P] Registry key `meetings.alertWindowDays` (default 14) with schema and description
- [ ] T522 Same saga consumes `profile.ProfileUpdated` (P1) and re-plans every meeting of that member when `changed[]` names the time zone; specs: a member moved from Cairo to Berlin has every future occurrence's instant and every alert shifted, a meeting with `lockTimezone` is untouched, an update that changed only the display name plans nothing (FR-014)
- [ ] T523 [P] `POST /internal/notifications/reconcile-meeting-alerts` — service-only (`internal:tick`), runs T520's reconciliation for every member so the rolling window advances on a quiet day, stamps `ops_heartbeats['notifications.meeting-alerts']`; one new nightly workflow `workflows/meeting_alerts_reconcile.json` calls it, with `error_handler.json` as its error workflow; spec: a user JWT is refused

## Phase 4 — The calendar

- [ ] T530 `features/agenda/` — merge expanded meetings (+ preparation blocks), timed tasks through Planning's `TimedTasksInRangeQuery(userId, from, to)` (the range sibling of P2's single-day `TasksDueQuery`), training sessions through `SessionsInRangeQuery(userId, from, to)` declared in `meetings.module.ts` and bound here to a null-safe stub that P6 rebinds, and personal events; ordered by instant, grouped by day, each item carrying its kind; specs: a day with all four kinds orders correctly, the stubbed sessions port contributes nothing rather than throwing
- [ ] T531 [P] `features/month-overview/` — per-day counts and busy markers for a month; a day is busy when it holds at least one item of any kind (FR-009)
- [ ] T532 [P] Rhythm draft builder gains meetings (P3's `TasksDueQuery` sibling: `MeetingsOnQuery`), so the evening proposal names tomorrow's meetings **and** the morning briefing names today's; spec: both touches list a meeting with its time (FR-012)

## Phase 5 — Mobile

- [ ] T540 Drift 5 → 6: `meetings`, `calendar_events` with the sync mixin, `schemaVersion` bump with its guarded `MigrationStrategy` branch, ladder test extended; both tables wired into the phone's sync entity list, `purge` included, and rejections branched on `entity` before any table is touched
- [ ] T541 `features/meetings` — editor (name, description, start, length defaulting to the member's `defaults.meetingDurationMin` preference, location switch link/address with at least one required, preparation notes and minutes, reminder offsets, repeat picker in plain words with an end condition, a "keep this on <place>'s clock" toggle for `lockTimezone`), a confirm dialog before a series edit discards a moved occurrence, occurrence actions (skip, move), meeting actions (complete, cancel), delete with undo; spec: complete and cancel are offered on the meeting and never on one date of a series (FR-013)
- [ ] T542 [P] `features/calendar` — `table_calendar` month with busy markers, a week view of seven days with their items in time order, day agenda merging every kind, all read from drift and expanded by T545, tap-through to the item (FR-009)
- [ ] T543 [P] Home's today card reads the local agenda — drift rows expanded by T545, never the GraphQL query, which serves only the extension and the web calendar (FR-010); notification tap opens the meeting with its link or map
- [ ] T544 [P] Cubit specs: the expansion shown matches the server's for a fixture series; benchmark — a fixture month holding 200 occurrences (a weekly series and a daily one, both anchored on `DateTime.now()`) renders in under 300 ms measured in profile mode (SC-003)
- [ ] T545 `core/recurrence/expander.dart` — the phone's own expander over `rrule`: wall-time expansion in the member's zone or `lockTimezone`, exdates, overrides keyed by `originalStart`, orphan overrides included, personal events too; specs: the same fixture table as T502, case for case, so a divergence from the server fails here

## Phase 6 — Extension and chat

- [ ] T550 [P] Extension: next seven days of meetings in the side panel with a join button; quick-add meeting; Dexie tables and sync entities extended
- [ ] T551 [P] P4's `intent-executor` gains `set_meeting` (title, when, length, link or address), replacing the "not yet" reply; fixture sentences added to the intent corpus

## Phase 7 — Polish

- [ ] T560 [P] `migrate-mongo` indexes; Arabic strings for the repeat picker (plural and dual forms); RTL screenshots
- [ ] T561 [P] `purge-on-deleted` handler for `meetings` and `calendar_events` on `identity.UserDeleted`; spec
- [ ] T562 Record gate evidence; open `020-training`

## Dependencies

T501 → T502 → T503 → T510–T514. T520 needs T513's `MeetingOccurrencesQuery` and P2's
`AlertPlanningSaga`; T522 additionally needs P1's `profile.ProfileUpdated{changed[]}`;
T523 needs T520. T514 needs P2's sync registry. T530 needs T502 plus Planning's
`TimedTasksInRangeQuery`; Training's `SessionsInRangeQuery` stays null-safe until P6.
Mobile T540 → T545 → T541/T542/T543 → T544.

## Verification gate

1. `pnpm --filter @botvy/backend test` — the full recurrence table, alert
   reconciliation, the time-zone re-plan, the sync adapters' rejections, agenda merge.
2. `cd apps/mobile && flutter test && flutter analyze` — including the phone
   expander against T502's fixture table and the 200-occurrence month benchmark.
3. Manual: create a weekly meeting for six weeks with a 30-minute reminder; skip week
   three; move week five by an hour → phone and extension both show five occurrences
   with one moved; reminders arrive for exactly those; monthly on the 31st lands on
   28/29 February; a series spanning a clock change keeps its local time; with the
   phone in flight mode the calendar and the home card still show the day.
4. The evening proposal names tomorrow's meetings and the morning briefing names
   today's.
5. Change the profile's time zone → the member's future occurrences and their
   reminders move within the minute, and a meeting marked as fixed to a place does not.
6. `/health` reports `notifications.meeting-alerts` fresh after the nightly workflow
   has run once.

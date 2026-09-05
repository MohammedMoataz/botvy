# Tasks: Meetings & Calendar (P5)

**Input**: `spec.md`, `plan.md`; blueprint data-model §2.10, contracts.

**Tests**: mandatory for every recurrence case, override versus series edit, alert
window reconciliation, agenda ordering, DST stability.

## Phase 1 — Domain and expansion

- [ ] T501 `contexts/meetings/domain/`: `meeting.aggregate.ts` (schedule, edit with `force`, skipOccurrence, moveOccurrence, complete, cancel, tombstone, restore), `calendar-event.aggregate.ts`, ports
- [ ] T502 `domain/recurrence-expander.ts` — wall-time expansion in the member's zone (or `lockTimezone`), exdates, overrides keyed by `originalStart`, orphan overrides included; specs: monthly on the 31st both ways, weekly first occurrence today, DST week keeps 18:00, move onto a skipped date clears the skip, series edit warns about an orphaned override
- [ ] T503 [P] `infrastructure/`: mongo adapters, schemas, mappers, in-memory adapters

## Phase 2 — Slices

- [ ] T510 [P] `create-meeting/ update-meeting/ complete-meeting/ cancel-meeting/ delete-meeting/ restore-meeting/` with events
- [ ] T511 [P] `skip-occurrence/ move-occurrence/` — path parameters carry `originalStart`; both raise their events
- [ ] T512 [P] `create-event/ update-event/ delete-event/` for personal events
- [ ] T513 [P] Queries `meeting(id)`, `meetings(includeCompleted)` with `nextOccurrence`

## Phase 3 — Alerts

- [ ] T520 `MeetingAlertSaga` in the worker — reconcile the desired alert set for the next `meetings.alertWindowDays` on every meeting event and on a nightly tick; one alert per reminder offset plus a preparation alert when `prepMinutes > 0`; specs: skip removes, move relocates, cancel clears, reconciliation is idempotent
- [ ] T521 [P] Registry key `meetings.alertWindowDays` (default 14) with schema and description; nightly tick added to `rhythm_tick.json` or its own workflow entry

## Phase 4 — The calendar

- [ ] T530 `features/agenda/` — merge expanded meetings (+ preparation blocks), timed tasks (Planning read port), sessions (Training port, null-safe), personal events; ordered by instant, grouped by day, each item carrying its kind; spec: a day with all four kinds orders correctly
- [ ] T531 [P] `features/month-overview/` — per-day counts and busy markers for a month
- [ ] T532 [P] Rhythm draft builder gains meetings (P3's `TasksDueQuery` sibling: `MeetingsOnQuery`), so the evening proposal names tomorrow's meetings

## Phase 5 — Mobile

- [ ] T540 Drift 5 → 6: `meetings`, `calendar_events` with the sync mixin, guarded branch, ladder test extended; sync adapters registered
- [ ] T541 `features/meetings` — editor (name, description, start, length, location switch link/address, preparation notes and minutes, reminder offsets, repeat picker in plain words with an end condition), occurrence actions (skip, move, complete, cancel), delete with undo
- [ ] T542 [P] `features/calendar` — `table_calendar` month with busy markers, day agenda merging every kind, offline from drift, tap-through to the item
- [ ] T543 [P] Home's today card switches to the agenda query; notification tap opens the meeting with its link or map
- [ ] T544 [P] Cubit specs: expansion shown matches the server for a fixture series

## Phase 6 — Extension and chat

- [ ] T550 [P] Extension: next seven days of meetings in the side panel with a join button; quick-add meeting; Dexie tables and sync entities extended
- [ ] T551 [P] P4's `intent-executor` gains `set_meeting` (title, when, length, link or address), replacing the "not yet" reply; fixture sentences added to the intent corpus

## Phase 7 — Polish

- [ ] T560 [P] `migrate-mongo` indexes; Arabic strings for the repeat picker (plural and dual forms); RTL screenshots
- [ ] T561 Record gate evidence; open `020-training`

## Dependencies

T501 → T502 → T503 → T510–T513. T520 needs T502 and P2's alert pipeline. T530 needs
T502 plus Planning's read port; Training's port stays null-safe until P6.
Mobile T540 → T541/T542.

## Verification gate

1. `pnpm --filter @botvy/backend test` — the full recurrence table, alert
   reconciliation, agenda merge.
2. `cd apps/mobile && flutter test && flutter analyze`.
3. Manual: create a weekly meeting for six weeks with a 30-minute reminder; skip week
   three; move week five by an hour → phone and extension both show five occurrences
   with one moved; reminders arrive for exactly those; monthly on the 31st lands on
   28/29 February; a series spanning a clock change keeps its local time.
4. The evening proposal names tomorrow's meetings.

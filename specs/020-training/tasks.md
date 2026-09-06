# Tasks: Training (P6)

**Input**: `spec.md`, `plan.md`; blueprint data-model §2.6, contracts.

**Task ids** are local to this phase. The blueprint's `tasks.md` runs its own `T###`
series for P6 (T601–T603 there) and the numbers do not correspond; read the text, not
the id, when comparing the two.

**Tests**: mandatory for the cut-off rule, materialiser idempotency, slot changes, two
sports in one week, program filling beyond the materialisation horizon, program apply
guarding, skip semantics. Every fixture calendar is built relative to `Date.now()` in a
fixed test zone; none carries a written date.

## Phase 1 — Domain

- [ ] T601 `contexts/training/domain/`: `athlete-profile.aggregate.ts`, `session.aggregate.ts` (plan, log, complete, cancel, skip, applyWorkout), `program.aggregate.ts` (weeks, apply), `workout.aggregate.ts`, `set-entry.ts` (one shape, optional per-sport fields), ports for all four plus `session-read.repository.ts` and the `SessionsInRangeQuery` token this phase declares; the session and program shapes carry `suggestionId`, `source` and `sourceLinkIds` from the start so P7 needs no migration, and the program carries `appliedStartDate` so a week can be computed long after the apply
- [ ] T602 [P] `infrastructure/`: mongo adapters, schemas declaring the data model's indexes (created by the migration in T660, never at boot), mappers, in-memory adapters; the materialiser's key is the derived `_id` `uuidv5("${userId}:${slotId}:${localDate}")`, so creation is an upsert and needs no second unique index
- [ ] T603 [P] `isMissed(now, tz)` on the session aggregate — `planned` and `plannedAt + durationMin` already past in the member's zone, resolved through `shared/time`; the GraphQL read model exposes it and the phone's session model mirrors the one line; nothing ever writes it; spec: a late log needs no status correction first (FR-018)

## Phase 2 — Athlete profile and materialisation (US1)

- [ ] T610 [P] `choose-sports/` (known list of seven + custom name) and `set-slots/` (day, time, length, sport, place) raising `SportsChanged` / `SlotsChanged`; plus `bootstrap-athlete-profile/` on `identity.UserRegistered` — an empty profile written when the member registers, idempotent on `eventId`, which is what lets the read side promise a non-null `athleteProfile`; spec: a second delivery creates nothing
- [ ] T611 `SessionMaterialiserSaga` (worker) — on those events, on `ProgramApplied`, on `profile.PreferencesChanged` whose `changed[]` names the time zone or `nextPracticeCutoff`, and on the nightly tick: create `planned` sessions for the next `training.materialiseDays` in the member's zone, upserting the derived `_id` from T602 so a redelivery is a no-op; fill `title`, `focus`, `exercises`, `programId` and `weekIndex` from the active program's week template for that `(weekIndex, weekday)`; write `SessionScheduled` to the outbox in the same unit of work as each new session; recompute `plannedAt` for future `planned` sessions when the zone changed; remove only future `planned` sessions whose slot is gone; never touch logged, completed, cancelled, skipped or past sessions. Specs cover each clause plus two sports in one week, an archived program leaving already-filled sessions alone, and week four of a four-week program landing when the horizon reaches it — every fixture built relative to `Date.now()` in a fixed test zone
- [ ] T612 [P] Read the horizon from the registry key `training.materialiseDays` and the cut-off from `defaults.nextPracticeCutoff`, both registered in P0; spec: the saga honours a changed setting on its next run and no default is written in this context

## Phase 3 — Sessions (US2, US3)

- [ ] T620 [P] `create-session/ update-session/ log-session/ complete-session/ cancel-session/ skip-session/` with events, `create-session` writing `SessionScheduled` to the outbox like the saga does; spec: skip keeps the row and marks it, logging stores actual beside planned, a hand-made session carries no `slotId` and survives the next materialiser run
- [ ] T621 `features/next-practice/` — the cut-off rule with its three reasons, compared in the member's zone; spec over a 14-day fixture at 20:00 and 21:30 each day, the fixture built relative to `Date.now()` in a fixed test zone, and covering a session still to happen after the cut-off (it stays today's)
- [ ] T622 [P] Queries `sessions(from,to)`, `session(id)`, `athlete-profile`, and `SessionsInRangeQuery` for the calendar
- [ ] T623 [P] Alerts (FR-014): `SessionScheduled` produces an alert at the session time minus the member's default lead (P2 pipeline); `SessionCompleted|Cancelled|Skipped` and a session the materialiser removed with its slot clear the unsent ones

## Phase 4 — Programs and workouts (US4, US5)

- [ ] T630 [P] `create-program/ update-program/ archive-program/ delete-program/` and query `programs`, `program(id)`; spec: archiving stops the materialiser consulting the program and leaves the sessions it already filled exactly as they are (FR-008)
- [ ] T631 `apply-program/` — map week templates onto slots from a start date, stored as the program's `appliedStartDate` for the materialiser to read later; never overwrite logged sessions; return `wouldReplace` and refuse without `force` (the body and answer this phase adds to the blueprint's `{ startDate }`); write `ProgramApplied` to the outbox, which the materialiser consumes and Conversations turns into a coach message; spec covers both paths
- [ ] T632 [P] `create-workout/ update-workout/ delete-workout/ apply-workout-to-session/` and query `workouts(sport)`
- [ ] T633 Sync (FR-012): register `sessions`, `programs`, `workouts` and `athlete_profile` adapters with P2's `sync-registry` — the first three with the ordinary push, pull, tombstone and full-snapshot sweep; `athlete_profile` as a patch over the allowlist (`sports`, `slots`) with no conflict check and no sweep. Spec the rejection shape per entity: `stale` carries the server row, `gone` a tombstoned session, `invalid` a slot the profile no longer holds, and nothing here is ever `protected`

## Phase 5 — Bind the open ports (US6)

- [ ] T640 Rebind `NextSessionQuery` in `rhythm.module.ts` from the P3 stub to Training's implementation; the evening proposal and the morning briefing now name the session; spec updated to assert it
- [ ] T641 [P] Bind `SessionsInRangeQuery` in `meetings.module.ts`, replacing the null-safe placeholder P5 has held in the agenda; the agenda now includes training; spec updated
- [ ] T642 [P] `apps/mobile/lib/features/home/widgets/training_row.dart` — Today's list renders training as its own kind, not completable as a task, tapping opens the session; it watches the phone's `sessions` table for today, not the `daily_plans` snapshot, so a session completed or skipped offline changes the row at once; spec: skipping from the session screen leaves the row present and marked

## Phase 6 — Mobile

- [ ] T650 Drift 6 → 7: `sessions`, `programs`, `workouts`, `athlete_profile` with the sync mixin, `schemaVersion` bumped with its matching `MigrationStrategy` branch, any added column guarded `if (from >= N && from < M)`, ladder test extended; the phone's four sync providers registered against T633's server adapters
- [ ] T651 `features/athlete` — sports picker, weekly slot editor, next-practice card with three empty states, week view grouped by day with sport chips, a past unlogged session reading as missed
- [ ] T652 `features/athlete/session` — set logger with per-sport controls, steppers, "repeat last" from history, notes, complete/cancel/skip, exercise ordering with the SDK's `ReorderableListView` (no new package); works offline
- [ ] T653 [P] `features/athlete/programs` — list, detail, apply (with the replace warning), archive; workout library with apply-to-session
- [ ] T654 [P] Cubit specs: logging offline then syncing produces one session, not two

## Phase 7 — Polish

- [ ] T660 [P] `migrate-mongo` script creating the indexes T602's schemas declare — the only place they are created; Arabic sport names and RTL screenshots
- [ ] T661 [P] Coach prompt gains the training line — sports, the next session with its focus, the streak of completed sessions (FR-017) — through `ProfileSummaryQuery`'s sibling `TrainingSummaryQuery` in `features/training-summary/`; spec: a member with no slots yields a line saying so, not an empty one
- [ ] T662 [P] P4's `intent-executor` gains `set_slots` ("gym Monday and Wednesday at six") and `log_session` ("I trained legs today"), and a `list` intent about training answers with `chat.card { kind: 'sessions' }` — the kind the chat contract defines and nothing has produced (FR-015); fixture sentences for all three in the intent corpus, English and Arabic
- [ ] T663 [P] `purge-on-deleted` handler for `athlete_profiles`, `sessions`, `programs`, `workouts` on `identity.UserDeleted`; spec
- [ ] T664 [P] Onboarding gains a sports-and-slots step (registered into P1's step registry) so a new athlete arrives with a week already shaped (FR-016)
- [ ] T665 Record gate evidence; open `021-knowledge-ingestion`

## Dependencies

T601 → T602 → T610/T620/T630. T611 needs T610, the registry key from T612 and the
nightly tick from P5's saga schedule; it also needs `profile.PreferencesChanged` to be
raised by P1. T621 needs preferences from P1 and T603 for the missed rule. T623 needs
the events T611 and T620 raise, and P2's alert pipeline. T633 needs T630 and T632, so
all four collections exist before their adapters register. T640/T641 need T621/T622.
T662 needs T610 and T620 for the commands it dispatches, and P4's `intent-executor`.
Mobile T650 → T651 → T652, and T642 needs T650 for the local `sessions` table.

## Verification gate

1. `pnpm --filter @botvy/backend test` — cut-off across a 14-day fixture, materialiser
   clauses including two sports in one week and a fourth program week filled as the
   horizon reaches it, the time-zone change recompute, program apply guard, skip
   semantics; every fixture calendar relative to `Date.now()` in a fixed test zone.
2. `cd apps/mobile && flutter test && flutter analyze`.
3. Manual: set gym Mon/Wed/Fri 18:00 and swimming Sun 08:00 → two weeks populate; at
   20:00 on Wednesday the card shows Wednesday's session, at 21:30 it shows Friday's;
   log six exercises with the phone offline → the session appears on another device
   once; Today shows the training row and it cannot be ticked as a task; the evening
   proposal names tomorrow's sport and time; the calendar shows the session beside a
   meeting.

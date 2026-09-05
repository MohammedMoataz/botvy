# Tasks: Training (P6)

**Input**: `spec.md`, `plan.md`; blueprint data-model §2.6, contracts.

**Tests**: mandatory for the cut-off rule, materialiser idempotency and slot changes,
program apply guarding, skip semantics.

## Phase 1 — Domain

- [ ] T601 `contexts/training/domain/`: `athlete-profile.aggregate.ts`, `session.aggregate.ts` (plan, log, complete, cancel, skip, applyWorkout), `program.aggregate.ts` (weeks, apply), `workout.aggregate.ts`, `set-entry.ts` (one shape, optional per-sport fields), ports for all four plus `session-read.repository.ts`
- [ ] T602 [P] `infrastructure/`: mongo adapters with the indexes from the data model, schemas, mappers, in-memory adapters

## Phase 2 — Athlete profile and materialisation (US1)

- [ ] T610 [P] `choose-sports/` (known list + custom name) and `set-slots/` (day, time, length, sport, place) raising `SportsChanged` / `SlotsChanged`
- [ ] T611 `SessionMaterialiserSaga` (worker) — on those events, on `ProgramApplied` and on the nightly tick: create `planned` sessions for the next `training.materialiseDays`, idempotent on `(userId, slotId, date)`; remove only future `planned` sessions whose slot is gone; never touch logged, completed, cancelled, skipped or past sessions; specs cover each clause
- [ ] T612 [P] Registry key `training.materialiseDays` (default 14)

## Phase 3 — Sessions (US2, US3)

- [ ] T620 [P] `create-session/ update-session/ log-session/ complete-session/ cancel-session/ skip-session/` with events; spec: skip keeps the row and marks it, logging stores actual beside planned
- [ ] T621 `features/next-practice/` — the cut-off rule with its three reasons; spec over a 14-day fixture at 20:00 and 21:30 each day
- [ ] T622 [P] Queries `sessions(from,to)`, `session(id)`, `athlete-profile`
- [ ] T623 [P] Alerts: `SessionScheduled` produces an alert at the session time minus the member's default lead (P2 pipeline); `SessionCompleted|Cancelled|Skipped` clears unsent ones

## Phase 4 — Programs and workouts (US4, US5)

- [ ] T630 [P] `create-program/ update-program/ archive-program/ delete-program/` and query `programs`, `program(id)`
- [ ] T631 `apply-program/` — map week templates onto slots from a start date; never overwrite logged sessions; return `wouldReplace` and refuse without `force`; raises `ProgramApplied`; spec covers both paths
- [ ] T632 [P] `create-workout/ update-workout/ delete-workout/ apply-workout-to-session/` and query `workouts(sport)`

## Phase 5 — Bind the open ports (US6)

- [ ] T640 Rebind `NextSessionQuery` in `rhythm.module.ts` from the P3 stub to Training's implementation; the evening proposal and the morning briefing now name the session; spec updated to assert it
- [ ] T641 [P] Rebind `SessionsInRangeQuery` in `meetings.module.ts` from the P5 stub; the agenda now includes training; spec updated
- [ ] T642 [P] Today's list renders training as its own kind — not completable as a task, tapping opens the session

## Phase 6 — Mobile

- [ ] T650 Drift 6 → 7: `sessions`, `programs`, `workouts`, `athlete_profile` with the sync mixin, guarded branch, ladder test extended; sync adapters registered
- [ ] T651 `features/athlete` — sports picker, weekly slot editor, next-practice card with three empty states, week view grouped by day with sport chips
- [ ] T652 `features/athlete/session` — set logger with per-sport controls, steppers, "repeat last" from history, notes, complete/cancel/skip; works offline
- [ ] T653 [P] `features/athlete/programs` — list, detail, apply (with the replace warning), archive; workout library with apply-to-session
- [ ] T654 [P] Cubit specs: logging offline then syncing produces one session, not two

## Phase 7 — Polish

- [ ] T660 [P] `migrate-mongo` indexes; Arabic sport names and RTL screenshots
- [ ] T661 [P] Coach prompt gains the training line (sport, focus, streak of sessions) through `ProfileSummaryQuery`'s sibling `TrainingSummaryQuery`
- [ ] T662 Record gate evidence; open `021-knowledge-ingestion`

## Dependencies

T601 → T602 → T610/T620/T630. T611 needs T610 and the nightly tick from P5's saga
schedule. T621 needs preferences from P1. T640/T641 need T621/T622. Mobile T650 →
T651 → T652.

## Verification gate

1. `pnpm --filter @botvy/backend test` — cut-off across a 14-day fixture, materialiser
   clauses, program apply guard, skip semantics.
2. `cd apps/mobile && flutter test && flutter analyze`.
3. Manual: set gym Mon/Wed/Fri 18:00 and swimming Sun 08:00 → two weeks populate; at
   20:00 on Wednesday the card shows Wednesday's session, at 21:30 it shows Friday's;
   log six exercises with the phone offline → the session appears on another device
   once; Today shows the training row and it cannot be ticked as a task; the evening
   proposal names tomorrow's sport and time; the calendar shows the session beside a
   meeting.

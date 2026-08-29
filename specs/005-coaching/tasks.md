# Tasks: Coaching Parity

**Branch**: `005-coaching` | **Input**: `spec.md`

## Phase A — Adherence rules (pure, unit-tested)

- [x] T001 `src/coaching/adherence.ts` — timezone-aware local date, streak,
      completion ratio, rest-day test, plan-vs-reported precedence,
      recently-worked muscle groups, allergy detection, check-in window.
- [x] T002 25 vitest cases.
      Verified: `vitest run` → **68 passed (7 files)**.
      Notable behaviours pinned by tests: an *unanswered* today does not
      break a streak (only an answered miss does); an unset training
      schedule means "no rest days", not "every day is rest"; an empty
      allergy string never matches everything; and a plan may never
      overwrite a session the user reported doing.

## Phase B — Schema

- [x] T003 `CoachingProfile` (opt-in, timezone, metrics, constraints,
      training days, pending-check-in state), `CheckIn` (unique per user per
      local date), `WorkoutRecord` (unique per user per date, with a
      `source` distinguishing reported from planned).
- [ ] T004 Generate and apply the migration. **Blocked: Docker is down
      while its WSL storage is relocated**, so Postgres is unreachable.
      The schema compiles and the client generates.

## Phase C — Services and API

- [x] T005 `CoachingService` — profile read/merge-update (a partial
      extraction never clears fields it did not mention), prompt context
      (streak, ratio, rest day, muscle groups to avoid), idempotent
      check-in recording, workout recording that refuses to let a plan
      overwrite a reported session, and an allergy gate.
- [x] T006 `CoachingController` — `GET/PATCH /coaching/profile`,
      `GET /coaching/context`, scoped to the authenticated user.
- [x] T007 `ProgramGenerator` — JSON-schema program generation, isolated
      from scheduling so the rules around it are testable without a model.
      Returns null on failure, and the caller sends nothing rather than
      delivering text whose allergen content could not be checked.
- [x] T008 `NightlyService` — the nightly cycle: ask check-ins, then push
      programs, skipping rest days and **withholding** any plan containing a
      declared allergen.
- [x] T009 Internal endpoints `POST /internal/coaching/{checkin,program}`
      behind the service-token guard.
- [x] T010 8 vitest cases over the nightly cycle with the model and
      database stubbed: rest day sends a rest message and stores nothing;
      an unsafe plan is withheld and nothing is pushed or stored; a safe
      plan is delivered and recorded; generation failure sends nothing; a
      user with no devices still has state recorded.
      **Bug found by these tests**: the rest-day decision used
      `context.today` while the workout was stored under a separately
      computed date, so a run straddling local midnight could check one day
      and write another. Both now use the same date.

## Phase D — n8n workflow

- [x] T011 `workflows/nightly_coaching.json` — 21:00 check-in trigger,
      22:00 program trigger, plus a companion webhook for run-now. No
      database node, no data volume; the gateway does all selection and
      delivery.
      Deliberately one cycle, unlike the predecessor which sent tomorrow's
      program after the check-in reply *and* today's an hour later.
- [ ] T012 Import and verify a real scheduled execution. **Blocked on Docker.**

## Deferred / blocked

- All database-touching verification (T004, T012) is blocked only on Docker
  being down for its storage move — no design question is open.
- Model-dependent quality (does the generated program read well, does
  extraction populate the profile correctly) cannot be assessed while
  inference is CPU-bound; that remains gated on the GPU driver.

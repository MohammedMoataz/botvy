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
- [x] T004 Generate and apply the migration.
      Verified: migration `20260829224830_add_coaching` applied;
      `psql -d botvy -c "\dt"` lists `coaching_profiles`, `checkins`,
      `workout_records` alongside the earlier nine tables.

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
- [x] T012 Import into the running n8n.
      Verified: `Botvy Nightly Coaching` created, and after the import fix
      below its `errorWorkflow` resolves to the handler's real id.
      **Bug found here**: the workflow JSON referenced the literal id
      `BotvyErrorHandler`, but n8n assigns its own id on import, so every
      workflow's error handling was silently unwired — n8n reported it only
      in its log (`Could not find workflow "BotvyErrorHandler"`) and only
      when a failure actually needed the handler. `import.mjs` now rewrites
      the reference to the handler's real id.

## Live verification (against the running stack)

| Criterion | Result |
|---|---|
| SC-001 profile capture | `PATCH /coaching/profile` stored opt-in, timezone, allergies, training days; a follow-up `{"weightKg":77}` changed only weight — allergies and goal survived (FR-002) |
| SC-002 one check-in per date | Replying "yeah trained legs and ate clean" recorded `adhered=t`; re-opening and replying "no I skipped today" left **exactly 1 row**, flipped to `adhered=f` |
| Check-in tone | A miss answered with "one off day changes nothing long term" — recorded truthfully, answered encouragingly |
| Streak | 0 → 1 after an adhered day, back to 0 when flipped to a miss |
| SC-004 rest day | Program push on a Sunday (training days 1/3/5) returned `skippedRestDay:1`, `sent:0`, and stored **0** workout records |
| Internal endpoint auth | Service token accepted; a valid **user JWT** rejected with 401 |
| Timezone | Context reported `today` in the profile's `Africa/Cairo`, not the server's zone |

Notable: the check-in reply path returns in under a second because it
short-circuits **before** any model call — the classifier decides the common
yes/no cases itself. That is what makes this feature usable at all while
inference is CPU-bound.

## Still gated on the GPU driver

Program *generation* quality (does the plan read well, does the allergy gate
actually catch a model that ignores the constraint) needs a model call per
user and cannot be assessed at ~4 tokens/second. The deterministic rules
around it — rest days, withholding, overwrite precedence — are unit-tested
and, above, verified live.

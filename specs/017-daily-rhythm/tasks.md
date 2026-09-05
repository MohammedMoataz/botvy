# Tasks: Daily Rhythm (P3)

**Input**: `spec.md`, `plan.md`; blueprint data-model §2.5, contracts `internal.md`,
`events.md`.

**Tests**: mandatory for the per-member clock (two zones, catch-up, DST, no re-fire),
the classifier's conversation confinement and window, streak arithmetic, rollover.

## Phase 1 — Context and domain

- [ ] T301 `contexts/rhythm/domain/`: `daily-plan.aggregate.ts`, `checkin.aggregate.ts`, `rhythm-state.aggregate.ts` (claim methods), ports for all three
- [ ] T302 [P] Port v1 `adherence.ts` and `checkin-classifier.ts` with their specs unchanged into `domain/`
- [ ] T303 [P] `infrastructure/`: mongo adapters (`_id = userId:date` for plans and check-ins, `_id = userId` for state), schemas, mappers, in-memory adapters
- [ ] T304 Cross-context read ports: `tasks-due.port.ts` (bound to Planning's read repository), `next-session.port.ts` and `today-meals.port.ts` with null-returning stub implementations registered in `rhythm.module.ts` (rebound in P6 and P8)

## Phase 2 — The clock (US3)

- [ ] T310 `features/tick/` — service-only `POST /internal/rhythm/tick`: page members with preferences, compute local date and time, claim-then-send for the three touches (plan prompt, end of day, morning), each with its own claim date, stamp the heartbeat, return counts; specs: Cairo vs Berlin once each; down at 22:00 and back at 22:40 sends once that day; back the next day sends nothing for the missed day; DST forward day fires once; a preference change after the claim does not re-fire
- [ ] T311 [P] `features/prompt-now/` — service-only unconditional prompt for an operator pressing Run (`{ userId?, kind }`)
- [ ] T312 [P] `workflows/rhythm_tick.json` — five-minute schedule + webhook, 600 s timeout, error workflow referenced; imported by `bootstrap.mjs`

## Phase 3 — The evening: plan prompt and end-of-day summary (US1)

- [ ] T320 `features/tick` draft builder: tasks due tomorrow (top five by priority then time) + tasks still open today with their `deferCount` + `NextSessionQuery(tomorrow)` + `TodayMealsQuery(tomorrow)`; writes `daily_plans[tomorrow]` as `draft`; raises `PlanTomorrowPrompted`; spec: an empty day produces a plan that says so, not an empty list
- [ ] T321 [P] Prompt delivery: write the proposal into the coaching conversation (Conversations command from P1's bootstrap) and raise the event that Notifications turns into an alert; spec: both happen exactly once per claim
- [ ] T322 [P] `features/confirm-plan/` and `features/skip-plan/` — store the chosen ids, set status, raise `PlanConfirmed`/`PlanSkipped`
- [ ] T323 Planning saga on `EndOfDaySummarySent` → `rollover` for tasks moved from today, incrementing `deferCount`; spec asserts the count the next proposal shows
- [ ] T324 `features/tick` end-of-day branch — claim, auto-confirm an unanswered draft (`autoConfirmed: true`), send the summary (top-priority tasks, training yes/no) into the coach chat and as an alert, set `awaitingCheckin` when `checkinEnabled`, raise `EndOfDaySummarySent`; specs: an unanswered draft becomes the plan; a confirmed one is untouched; an empty day says so

## Phase 4 — The morning briefing (US2)

- [ ] T330 `features/tick` morning branch: read the confirmed plan or build one from what is due today, mark `briefedAt`, write into the coaching conversation, raise `MorningBriefingSent`; spec: a task completed overnight is not listed

## Phase 5 — Check-in and streak (US4)

- [ ] T340 `features/record-checkin/` — mood, adhered, note; updates the streak; raises `CheckinRecorded`; spec: streak increments, a "no" resets it and the best is kept
- [ ] T341 [P] `features/capture-checkin-reply/` — command called by the chat gateway in P4: only when the conversation is the coaching one **and** `awaitingCheckin` is set **and** `now − awaitingSince < rhythm.checkinWindowHours`; `unclear` returns "not a check-in" so the caller falls through; specs cover each guard
- [ ] T342 [P] `features/streak/`, `features/today-plan/`, `features/tomorrow-draft/`, `features/plans/`, `features/checkins/` queries
- [ ] T343 [P] Honour `checkinEnabled`: no question asked, no `awaitingCheckin` set

## Phase 6 — Mobile (US5)

- [ ] T350 Drift 3 → 4: `daily_plans`, `checkins`, `rhythm_state` tables (pull-only plus the two push operations), guarded branch, ladder test extended
- [ ] T351 `features/home` — greeting, today's plan card (tasks with checkboxes, a completion ring done/total, training slot, meal line), streak with the week's adherence dots, "plan tomorrow" card when a draft awaits; reads drift only
- [ ] T352 [P] `features/rhythm` — confirm sheet (task list with add/remove and carried-over badges) and check-in sheet (mood slider, followed toggle, note); notification actions route here
- [ ] T353 [P] Sync adapters for the three tables registered with the facade; cubit specs against the in-memory database

## Phase 7 — Polish

- [ ] T360 [P] `migrate-mongo` indexes; Arabic strings; RTL screenshots
- [ ] T361 [P] Admin: rhythm heartbeat on the Overview; "Run rhythm tick" from the Automation page
- [ ] T362 [P] `purge-on-deleted` handler for `daily_plans`, `checkins`, `rhythm_states` on `identity.UserDeleted`; spec
- [ ] T363 Record gate evidence; open `018-coach-chat`

## Dependencies

T301 → T302/T303/T304 → T310 → T320/T330. T321 needs the coaching conversation from
P1 and the alert pipeline from P2. T323 needs Planning's `rollover` slice (P2 T206).
T341 is called by P4 but specced here.

## Verification gate

1. `pnpm --filter @botvy/backend test` — the six clock specs, the classifier guards,
   streak and rollover.
2. `cd apps/mobile && flutter test && flutter analyze`.
3. Manual: set the plan-prompt time two minutes ahead → the question and draft
   arrive as a notification and in the coach chat → ignore → set the end-of-day
   time two minutes ahead → the summary arrives and the plan is set → set the
   morning time two minutes ahead → the briefing lists exactly those tasks; repeat with a
   second account in another time zone and confirm neither sees the other's timing.
4. Stop the backend over a member's end-of-day time, restart 40 minutes later → the
   summary arrives once that evening.
5. `/health` shows `rhythm.tick` fresh; stopping n8n for 16 minutes turns it stale
   and `/health` degraded.

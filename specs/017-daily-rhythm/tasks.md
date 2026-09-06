# Tasks: Daily Rhythm (P3)

**Input**: `spec.md`, `plan.md`; blueprint data-model §2.5 and §2.9, contracts
`internal.md`, `events.md`.

**Task ids are phase-local.** The blueprint's own `tasks.md` runs a separate `T###`
series in which `T301`–`T305` mean something else entirely; nothing below corresponds
to it by number, only by the phase it belongs to.

**Tests**: mandatory for the per-member clock (two zones, catch-up, DST, no re-fire,
late registration, a time-zone change), the classifier's conversation confinement and
window, streak arithmetic, rollover.

## Phase 1 — Context and domain

- [ ] T301 `contexts/rhythm/domain/`: `daily-plan.aggregate.ts` (`propose`, `confirm(taskIds, training)`, `skip`, `markPrompted`, `markSummarised`, `markBriefed`), `checkin.aggregate.ts`, `rhythm-state.aggregate.ts` (`claimPlanPrompt`, `claimEndOfDay`, `claimMorning` — one per touch, one claim date each), ports for all three
- [ ] T302 [P] Port v1 `adherence.ts` and `checkin-classifier.ts` with their specs unchanged into `domain/`
- [ ] T303 [P] `infrastructure/`: mongo adapters (`_id = userId:date` for plans and check-ins, `_id = userId` for state), schemas, mappers, in-memory adapters
- [ ] T304 Cross-context read queries: `TasksDueQuery` and `TasksOpenBeforeQuery` dispatched on the QueryBus to Planning's handlers (declared in P2); `next-session.port.ts` and `today-meals.port.ts` with null-returning stub implementations registered in `rhythm.module.ts` (rebound in P6 and P8); spec: the handlers are bound in-memory and Rhythm imports no Planning repository — the `no-restricted-imports` rule covers the rest
- [ ] T305 `contexts/conversations/` skeleton — `conversations` and `messages` collections, `counters` (`_id = "<userId>:messages"`, `findOneAndUpdate $inc` issues the per-user `seq`), the aggregates and their ports, mongo plus in-memory adapters, `features/bootstrap-on-registered/` (`identity.UserRegistered` → pinned `coach` and `planner`, unique partial index on `{ userId, kind }`) and `features/append-message/` (issue `seq`, insert immutable, push `chat.message` to that member's sockets); specs: a replayed `UserRegistered` creates nothing twice, two appends take consecutive `seq` values. Nothing else of P4's chat lands here
- [ ] T307 [P] `contexts/rhythm/features/meal-line-changed/` — `nutrition.MealPlanReady{date,line}` and `MealPlanWithheld{date,reason}` update that date's `daily_plans.mealLine`, idempotent on `eventId`, creating nothing when no plan exists for the date. This is not the stale-draft saga this phase declined: the draft is rebuilt from live data at the end-of-day touch, but a member who regenerates their meals at nine in the morning has already been sent a briefing, and the plan the Home card reads must follow. Nutrition owns the meal half and announces it; Rhythm composes the sentence. Spec: a regenerate after the briefing changes the stored line and the Home card, and a withheld line replaces it with its reason rather than leaving the old one standing
- [ ] T306 [P] `contexts/rhythm/features/bootstrap-on-registered/` — `identity.UserRegistered` → the member's `rhythm_states` row with all three claim dates null and a zero streak, idempotent on `eventId`; spec: the tick finds a row for a member who has never had a touch

## Phase 2 — The clock (US3)

- [ ] T310 `features/tick/` — service-only `POST /internal/rhythm/tick`: page members with preferences, compute local date and time, claim-then-send for the three touches (plan prompt, end of day, morning), each with its own claim date, stamp `ops_heartbeats['rhythm.tick']`, answer with exactly `{ users, planPrompts, endOfDay, morning, checkins, ms }` (`contracts/internal.md`); specs: Cairo vs Berlin once each; down at 22:00 and back at 22:40 sends once that day; back the next day sends nothing for the missed day; DST forward day fires once; a preference change after the claim does not re-fire; a member who registers at 23:00 local gets no back-dated touch and their first is the next evening; a member who changes time zone after a touch was sent gets no second copy of it that day. A `profile.PreferencesChanged` handler (P1 raises it with `changed[]`) re-evaluates that member's claims on the next pass when a rhythm time or the time zone is in the list, and never clears a claim. Fixtures are built relative to `Date.now()`, never a pinned date
- [ ] T311 [P] `features/prompt-now/` — service-only unconditional prompt for an operator pressing Run (`{ userId?, kind }`)
- [ ] T312 [P] `workflows/rhythm_tick.json` — five-minute schedule + webhook, 600 s timeout, error workflow referenced; imported by `bootstrap.mjs`
- [ ] T313 [P] Timing spec for the paged tick (SC-001, plan Performance Goals): 500 seeded members, nobody due, under 10 seconds; everybody due with stubbed delivery, under 60 seconds; fails the suite rather than reporting a number nobody reads

## Phase 3 — The evening: plan prompt and end-of-day summary (US1)

- [ ] T320 `features/tick` draft builder: tasks due tomorrow, the best `settings.rhythm.draftTopN` of them by priority then time, + tasks still open today with their `deferCount` + `NextSessionQuery(tomorrow)` + `TodayMealsQuery(tomorrow)`; writes `daily_plans[tomorrow]` as `draft` with `promptedAt`; raises `PlanTomorrowPrompted`; specs: an empty day produces a plan that says so, not an empty list; changing `rhythm.draftTopN` changes how many the draft names
- [ ] T321 [P] Prompt delivery: dispatch the append-message command from T305 to write the proposal into the member's `coach` conversation, and raise the event that Notifications turns into an alert, flagged as member-chosen so P2's quiet-hours shift leaves it where the member put it; specs: both happen exactly once per claim; quiet hours covering the touch's time do not move it
- [ ] T322 [P] `features/confirm-plan/` and `features/skip-plan/` — store the chosen ids and the `training` flag from the body (`{ taskIds, training?: boolean }`, `rest-commands.md`) into the stored plan, set status, raise `PlanConfirmed`/`PlanSkipped`; spec: `training: false` clears the slot the draft proposed
- [ ] T323 Planning saga on `EndOfDaySummarySent` → `rollover` for tasks moved from today, incrementing `deferCount`; spec asserts the count the next proposal shows
- [ ] T324 `features/tick` end-of-day branch — claim; rebuild an unanswered (or missing) draft from live data and auto-confirm it (`autoConfirmed: true`) so a task scheduled after the prompt is in the plan that is set; send the summary (top priorities, training yes/no) into the `coach` conversation and as a member-chosen alert; `markSummarised`; set `awaitingCheckin` when the member's `checkinEnabled` preference is on and ask the question, and when it is off send the summary alone with no `awaitingCheckin`; raise `EndOfDaySummarySent`; specs: an unanswered draft becomes the plan; a confirmed one is untouched; a plan the member *skipped* stays skipped and the summary still names tomorrow's training; an empty day says so; a task scheduled at 21:30 is in the 22:00 plan; check-ins off means no question and no flag

## Phase 4 — The morning briefing (US2)

- [ ] T330 `features/tick` morning branch: read the confirmed plan or build one from what is due today, mark `briefedAt`, dispatch the append-message command into the `coach` conversation, plan a member-chosen alert, raise `MorningBriefingSent`; specs: a task completed overnight is not listed; a member whose quiet hours cover their own morning time still gets the briefing at that time

## Phase 5 — Check-in and streak (US4)

- [ ] T340 `features/record-checkin/` — mood, adhered, note; updates the streak; raises `CheckinRecorded`; spec: streak increments, a "no" resets it and the best is kept
- [ ] T341 [P] `features/capture-checkin-reply/` — command called by the chat gateway in P4: only when the conversation is the member's `coach` one **and** `awaitingCheckin` is set **and** `now − awaitingSince < settings.rhythm.checkinWindowHours`; `unclear` returns "not a check-in" so the caller falls through; specs cover each guard
- [ ] T342 [P] `features/streak/`, `features/today-plan/`, `features/tomorrow-draft/`, `features/plans/`, `features/checkins/` queries

## Phase 6 — Mobile (US5)

- [ ] T350 Drift 3 → 4: `daily_plans`, `checkins`, `rhythm_state` tables (pull-only plus the two push operations), guarded branch, ladder test extended
- [ ] T351 `features/home` — greeting, today's plan card (tasks with checkboxes, a completion ring done/total, training slot, meal line), streak with the week's adherence dots, "plan tomorrow" card when a draft awaits; reads drift only
- [ ] T352 [P] `features/rhythm` — confirm sheet (task list with add/remove and carried-over badges) and check-in sheet (mood slider, followed toggle, note); notification actions route here
- [ ] T353 [P] Sync adapters for the three tables registered with the facade; cubit specs against the in-memory database
- [ ] T354 [P] Home render timing test (SC-005): a seeded drift database with a full day's plan, the offline build of the home screen measured under 300 ms; a widget test with a stopwatch, not a manual stare

## Phase 7 — Polish

- [ ] T360 [P] `migrate-mongo` indexes; Arabic strings; RTL screenshots
- [ ] T361 [P] Admin: rhythm heartbeat on the Overview; "Run rhythm tick" from the Automation page
- [ ] T362 [P] `purge-on-deleted` handlers for `daily_plans`, `checkins`, `rhythm_states` and for `conversations`, `messages`, `counters` on `identity.UserDeleted`; spec
- [ ] T363 Record gate evidence

## Dependencies

T301 → T302/T303/T304/T305/T306/T307 → T310 → T320 → T324 → T330. T307 stays inert
until P8 raises the meal events, so it lands here with the rest of the context and is
specced against a hand-raised event. T321 needs the append
command from T305 and the alert pipeline from P2; T306 and T305 must both land before
T310, because the tick reads a state row and writes into a conversation that these two
create. T324 is built before the six clock specs in T310 are run, since "down at 22:00,
back at 22:40" exercises the end-of-day branch. T313 runs after T330, when all three
touches exist to be timed. T323 needs Planning's `rollover` slice (P2 T206) and T304
needs Planning's `TasksDueQuery`/`TasksOpenBeforeQuery` handlers from the same phase.
T341 is called by P4 but specced here.

## Verification gate

1. `pnpm --filter @botvy/backend test` — every clock spec in T310, the pinned chats on
   registration, the classifier guards, streak, rollover and the paged-tick timing.
2. `cd apps/mobile && flutter test && flutter analyze`, including the home render timing.
3. Manual: register a fresh account and confirm the coach conversation is already
   there → set the plan-prompt time two minutes ahead → the question and draft
   arrive as a notification and in the coach conversation → ignore → set the end-of-day
   time two minutes ahead → the summary arrives, the plan is set, answering the
   check-in moves the streak → set the morning time two minutes ahead → the briefing
   lists exactly those tasks; repeat with a second account in another time zone and
   confirm neither sees the other's timing.
4. Stop the backend over a member's end-of-day time, restart 40 minutes later → the
   summary arrives once that evening.
5. `/health` shows `rhythm.tick` fresh; stopping n8n for 16 minutes turns it stale
   and `/health` degraded.

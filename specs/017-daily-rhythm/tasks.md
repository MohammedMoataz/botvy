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

- [X] T301 `contexts/rhythm/domain/`: `daily-plan.aggregate.ts` (`propose`, `confirm(taskIds, training)`, `skip`, `markPrompted`, `markSummarised`, `markBriefed`), `checkin.aggregate.ts`, `rhythm-state.aggregate.ts` (`claimPlanPrompt`, `claimEndOfDay`, `claimMorning` — one per touch, one claim date each), ports for all three
- [X] T302 [P] Port v1 `adherence.ts` and `checkin-classifier.ts` with their specs unchanged into `domain/` Ported with two corrections, both because `adhered` is nullable here and was not in v1: `currentStreak` starts at today only when today carries a real verdict (a mood with no verdict would otherwise end a nine-day streak), and `bestStreak`/`weekAdherence` were added because the week has three states per day and a `boolean[]` cannot say "unanswered". The rest-day, muscle-group and allergen helpers were deliberately left behind: they are P6's and P8's, and v1 only had them in one file because v1 had one coaching service.
- [X] T303 [P] `infrastructure/`: mongo adapters (`_id = userId:date` for plans and check-ins, `_id = userId` for state), schemas, mappers, in-memory adapters
- [X] T304 Cross-context read queries: `TasksDueQuery` and `TasksOpenBeforeQuery` dispatched on the QueryBus to Planning's handlers (declared in P2); `next-session.port.ts` and `today-meals.port.ts` with null-returning stub implementations registered in `rhythm.module.ts` (rebound in P6 and P8); spec: the handlers are bound in-memory and Rhythm imports no Planning repository — the `no-restricted-imports` rule covers the rest
- [X] T305 `contexts/conversations/` skeleton — `conversations` and `messages` collections, `counters` (`_id = "<userId>:messages"`, `findOneAndUpdate $inc` issues the per-user `seq`), the aggregates and their ports, mongo plus in-memory adapters, `features/bootstrap-on-registered/` (`identity.UserRegistered` → pinned `coach` and `planner`, unique partial index on `{ userId, kind }`) and `features/append-message/` (issue `seq`, insert immutable, push `chat.message` to that member's sockets); specs: a replayed `UserRegistered` creates nothing twice, two appends take consecutive `seq` values. Nothing else of P4's chat lands here
- [X] T307 [P] `contexts/rhythm/features/meal-line-changed/` — `nutrition.MealPlanReady{date,line}` and `MealPlanWithheld{date,reason}` update that date's `daily_plans.mealLine`, idempotent on `eventId`, creating nothing when no plan exists for the date. This is not the stale-draft saga this phase declined: the draft is rebuilt from live data at the end-of-day touch, but a member who regenerates their meals at nine in the morning has already been sent a briefing, and the plan the Home card reads must follow. Nutrition owns the meal half and announces it; Rhythm composes the sentence. Spec: a regenerate after the briefing changes the stored line and the Home card, and a withheld line replaces it with its reason rather than leaving the old one standing
- [X] T306 [P] `contexts/rhythm/features/bootstrap-on-registered/` — `identity.UserRegistered` → the member's `rhythm_states` row with all three claim dates null and a zero streak, idempotent on `eventId`; spec: the tick finds a row for a member who has never had a touch

## Phase 2 — The clock (US3)

- [X] T310 `features/tick/` — service-only `POST /internal/rhythm/tick`: page members with preferences, compute local date and time, claim-then-send for the three touches (plan prompt, end of day, morning), each with its own claim date, stamp `ops_heartbeats['rhythm.tick']`, answer with exactly `{ users, planPrompts, endOfDay, morning, checkins, ms }` (`contracts/internal.md`); specs: Cairo vs Berlin once each; down at 22:00 and back at 22:40 sends once that day; back the next day sends nothing for the missed day; DST forward day fires once; a preference change after the claim does not re-fire; a member who registers at 23:00 local gets no back-dated touch and their first is the next evening; a member who changes time zone after a touch was sent gets no second copy of it that day. A `profile.PreferencesChanged` handler (P1 raises it with `changed[]`) re-evaluates that member's claims on the next pass when a rhythm time or the time zone is in the list, and never clears a claim. Fixtures are built relative to `Date.now()`, never a pinned date The six clock specs live in `rhythm-clock.spec.ts` (15 tests), separate from the write side because they are all assertions about *nothing happening* and read better together. `RhythmState.isDue` was added for the time-zone case: `claim !== today` accepts a date going **backwards**, so a member flying west got a second summary three hours after their first. `claim` is guarded on it too — the forced prompt claims unconditionally and would otherwise rewind the date.
- [X] T311 [P] `features/prompt-now/` — service-only unconditional prompt for an operator pressing Run (`{ userId?, kind }`)
- [X] T312 [P] `workflows/rhythm_tick.json` — five-minute schedule + webhook, 600 s timeout, error workflow referenced; imported by `bootstrap.mjs`
- [X] T313 [P] Timing spec for the paged tick (SC-001, plan Performance Goals): 500 seeded members, nobody due, under 10 seconds; everybody due with stubbed delivery, under 60 seconds; fails the suite rather than reporting a number nobody reads

## Phase 3 — The evening: plan prompt and end-of-day summary (US1)

- [X] T320 `features/tick` draft builder: tasks due tomorrow, the best `settings.rhythm.draftTopN` of them by priority then time, + tasks still open today with their `deferCount` + `NextSessionQuery(tomorrow)` + `TodayMealsQuery(tomorrow)`; writes `daily_plans[tomorrow]` as `draft` with `promptedAt`; raises `PlanTomorrowPrompted`; specs: an empty day produces a plan that says so, not an empty list; changing `rhythm.draftTopN` changes how many the draft names
- [X] T321 [P] Prompt delivery: dispatch the append-message command from T305 to write the proposal into the member's `coach` conversation, and raise the event that Notifications turns into an alert, flagged as member-chosen so P2's quiet-hours shift leaves it where the member put it; specs: both happen exactly once per claim; quiet hours covering the touch's time do not move it
- [X] T322 [P] `features/confirm-plan/` and `features/skip-plan/` — store the chosen ids and the `training` flag from the body (`{ taskIds, training?: boolean }`, `rest-commands.md`) into the stored plan, set status, raise `PlanConfirmed`/`PlanSkipped`; spec: `training: false` clears the slot the draft proposed
- [X] T323 Planning saga on `EndOfDaySummarySent` → `rollover` for tasks moved from today, incrementing `deferCount`; spec asserts the count the next proposal shows Built as `rollover-on-end-of-day.saga.ts`, filtering the event's `taskIds` to those still open and due **before** the plan's date began in the member's zone — the whole plan includes things nobody has failed to do yet, and deferring one of those would inflate the "carried over ×N" the next evening prints.
- [X] T324 `features/tick` end-of-day branch — claim; rebuild an unanswered (or missing) draft from live data and auto-confirm it (`autoConfirmed: true`) so a task scheduled after the prompt is in the plan that is set; send the summary (top priorities, training yes/no) into the `coach` conversation and as a member-chosen alert; `markSummarised`; set `awaitingCheckin` when the member's `checkinEnabled` preference is on and ask the question, and when it is off send the summary alone with no `awaitingCheckin`; raise `EndOfDaySummarySent`; specs: an unanswered draft becomes the plan; a confirmed one is untouched; a plan the member *skipped* stays skipped and the summary still names tomorrow's training; an empty day says so; a task scheduled at 21:30 is in the 22:00 plan; check-ins off means no question and no flag

## Phase 4 — The morning briefing (US2)

- [X] T330 `features/tick` morning branch: read the confirmed plan or build one from what is due today, mark `briefedAt`, dispatch the append-message command into the `coach` conversation, plan a member-chosen alert, raise `MorningBriefingSent`; specs: a task completed overnight is not listed; a member whose quiet hours cover their own morning time still gets the briefing at that time The confirmed branch asks Planning "which of these are still open" rather than rebuilding from the draft builder. It did the latter first, and `DraftBuilder` applies `rhythm.draftTopN` and omits carry-overs — so a member who confirmed eight tasks was read four of them, with their own edit silently replaced by the algorithm's preference.

## Phase 5 — Check-in and streak (US4)

- [X] T340 `features/record-checkin/` — mood, adhered, note; updates the streak; raises `CheckinRecorded`; spec: streak increments, a "no" resets it and the best is kept The streak is **derived from the check-in rows**, not folded one day at a time. The fold was correct for a repeated answer and wrong for a corrected one: a member who answered "no" and then corrected it to "yes" lost the run, because the false verdict zeroed the counter and nothing in the store could rebuild it. Patching one row is exactly what this slice exists to allow, so that is an ordinary case.
- [X] T341 [P] `features/capture-checkin-reply/` — command called by the chat gateway in P4: only when the conversation is the member's `coach` one **and** `awaitingCheckin` is set **and** `now − awaitingSince < settings.rhythm.checkinWindowHours`; `unclear` returns "not a check-in" so the caller falls through; specs cover each guard
- [X] T342 [P] `features/streak/`, `features/today-plan/`, `features/tomorrow-draft/`, `features/plans/`, `features/checkins/` queries Plus `rhythm.resolver.ts`, which is not optional polish: P2 shipped query handlers with specs and no resolvers, so the reads existed and were unreachable over the transport principle X designates for them. `PlanTask.status` and `PlanTraining.status` are in the SDL and **omitted** from the code-first types — the plan stores a snapshot and has no live status to report, and a field that lies is worse than one that is absent. `PlanTask.deferCount` is in the code and not the SDL, because the confirm sheet's "carried over ×3" badge needs it.

## Phase 6 — Mobile (US5)

- [X] T350 Drift 3 → 4: `daily_plans`, `checkins`, `rhythm_state` tables (pull-only plus the two push operations), guarded branch, ladder test extended A defect in the *existing* ladder was found and fixed while doing this: drift calls `onUpgrade` **once** with the pair it has, so `(from: 1, to: 3)` skipped a branch guarded `from >= 2 && from < 3` and a v1 install upgrading to v3 came out with no `tasks`, `labels`, `reminders` or `alerts_local` at all. The ladder test had only ever opened a v1 file against a v2 schema, where the two guard shapes agree. `createTable` guards are `from < N` now; the band shape stays where `CLAUDE.md` puts it, on `addColumn`.
- [X] T351 `features/home` — greeting, today's plan card (tasks with checkboxes, a completion ring done/total, training slot, meal line), streak with the week's adherence dots, "plan tomorrow" card when a draft awaits; reads drift only
- [X] T352 [P] `features/rhythm` — confirm sheet (task list with add/remove and carried-over badges) and check-in sheet (mood slider, followed toggle, note); notification actions route here
- [X] T353 [P] Sync adapters for the three tables registered with the facade; cubit specs against the in-memory database All three are **pull-only**, and `contracts/sync.md` was corrected to say so. It first gave `daily_plans` and `checkins` a push of named commands, which would have needed a third protocol beside the row and patch ones; what a third protocol buys is atomicity across entities in one round trip, and neither needs it. The two writes are REST commands, which is also the path a notification action has to use. `rhythm_state` refuses a push loudly (`invalid`, never `stale`): the claim dates are the server's once-a-day guarantee, and a phone that could write them could suppress its own member's evening.
- [X] T354 [P] Home render timing test (SC-005): a seeded drift database with a full day's plan, the offline build of the home screen measured under 300 ms; a widget test with a stopwatch, not a manual stare Measured 9–46 ms against a 300 ms budget, asserted absolutely.

## Phase 7 — Polish

- [~] T360 [P] `migrate-mongo` indexes **done** (`20260911000000-rhythm-conversations-indexes.cjs`); Arabic strings **done** (42 keys, both locales, parity test green). **RTL screenshots outstanding: they need a device, which is `docs/for-you/inputs-016-to-025.md` I3** — the same item P2 left open.
- [~] T361 [P] The rhythm heartbeat on the Overview needed **no code**: the page already renders `health.jobs` generically, so `rhythm.tick` appeared the moment it started stamping. "Run rhythm tick" is **deferred to P10**, which is the phase that builds the Automation page — there is no such page yet. Everything it will need is in place: `workflows/rhythm_tick.json` carries the `botvy-rhythm` webhook, and `POST /internal/rhythm/prompt` is the unconditional endpoint behind it.
- [X] T362 [P] `purge-on-deleted` handlers for `daily_plans`, `checkins`, `rhythm_states` and for `conversations`, `messages`, `counters` on `identity.UserDeleted`; spec
- [X] T363 Record gate evidence

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

## Gate evidence — 10 September 2026

Run against the live stack after a **clean** image rebuild, with the compiled
code confirmed present in the container (`dist/contexts/rhythm/features` holds
all fourteen slices, `dist/contexts/conversations` is there).

| Gate | Result | Note |
|---|---|---|
| `node infra/verify.mjs` (P0) | **5/5** | including "no stale jobs — 3 jobs fresh", which now counts `rhythm.tick` |
| `node infra/verify-p1.mjs` | **13/13** | Identity and Profile, unaffected |
| `node infra/verify-p2.mjs` | **14/14** | tasks, labels, reminders, alerts |
| `node infra/verify-p3.mjs` | **17/17** | new this phase |
| `pnpm --filter @botvy/backend test` | **745 pass** | 51 files |
| `cd apps/mobile && flutter test` | **190 pass** | including the ladder and the render budget |
| `flutter analyze` | clean | |
| `packages/sdk` tests | **78 pass** | |
| `npx wxt build` (extension) | clean | 632 kB |
| `pnpm lint` | 0 warnings, 0 errors | 363 files, 102 rules — **not** `npx oxlint`, see below |
| `npm run build:clean` (backend) | clean | not incremental |
| `node infra/verify-esm.mjs` | **3/3** | both compiled roles load under plain `node` |
| `pnpm gen:contracts` | regenerated | 8 new event schemas, 5 REST paths, 60 lines of SDL |

### What running it actually found

Six defects, and the first is the one that matters most.

1. **`MessageSchema` had no `updatedAt`, so every touch's coach message failed
   to save.** `MongoRepositoryBase` writes that column on every save and
   Mongoose's `strict: true` rejects an upsert naming an undeclared path
   outright. So the plan was set, the event was raised, the alert was planned —
   and the sentence FR-005 exists for went nowhere, swallowed by the tick's
   per-member `catch` into a log line. **740 unit tests passed throughout**,
   because the in-memory adapter has no schema to be strict about.

   This is the *second* time this exact defect has shipped: `AlertSchema` had it
   in P2 and the whole notification pipeline was dead for a phase. So the fix is
   not the one line — `shared/persistence/mongo/schemas.spec.ts` now asserts
   that every collection written through the base declares `updatedAt`, that
   every exemption names a collection that exists, that member-owned
   collections carry `userId`, and that no schema builds its own indexes. It was
   probed by removing the column and watching it name `MessageSchema (messages)`.

2. **Three of P2's alert payloads were incomplete, and all three were the same
   defect.** `PlanAlertsSaga.onTaskScheduled` reads `title` and `allDay` off the
   event with `title ?? 'Task due'` and `timed: allDay === false`. Neither event
   carried a title, so **every task notification in the product said "Task
   due"** instead of naming the task. `TaskRescheduled` carried no `allDay`, so
   editing a task silently **dropped the member's lead times**. And `defer`
   raised nothing Notifications listens to at all, so a task swiped to tomorrow
   kept tonight's alarm — which this phase's nightly rollover would have done to
   every unfinished task every night. Fixed with one `alertFacts()` method
   called from all four raise sites, three regressions, and the contract updated.

3. **`RhythmState.claim` could rewind a claim date.** Guarded on equality rather
   than on `isDue`, so a forced prompt for a member whose local date had gone
   *backwards* — flying west — rewound the claim and re-opened the later day's
   touch.

4. **The morning briefing dropped tasks the member had confirmed.** It refreshed
   a confirmed plan against `DraftBuilder`, which applies `draftTopN` and omits
   carry-overs; a member who confirmed eight tasks was read four.

5. **The streak could not survive a corrected answer.** A "no" corrected to a
   "yes" on the same day lost the whole run. The fold became a derivation.

6. **`currentStreak`, ported from v1, read a null verdict as an answer.** v1's
   rows could not be null; these can, because the two halves of a check-in
   arrive separately. A member who moved their mood slider and said nothing else
   would have watched a nine-day streak drop to zero.

Plus one process defect worth recording: **`npx oxlint` is not this project's
lint.** oxlint discovers `.oxlintrc.json` and this repo's config is
`oxlint.json`, so the bare command silently ran 99 built-in rules over 476 files
— `legacy/` included, since it also lost the ignore list — instead of the 102
rules the config defines, and the three `no-restricted-imports` overrides that
enforce constitution IX were among the three it was missing. P2's gate evidence
recorded the bare command and has been corrected. `pnpm lint` is the gate. The
cross-context rule was then probed in both directions for the two new contexts,
which is the rule `CLAUDE.md` asks for: a lint rule nobody has seen fire is a
comment.

### The gate's own three wrong assertions

Recorded because a gate that is wrong about the thing it gates teaches whoever
runs it to ignore a red line:

- It read `/health`'s `jobs` as a map when it is an array, and would have
  reported a missing heartbeat for a job stamping perfectly well.
- It asserted `endOfDay >= 1` from the tick it called, which is zero when n8n's
  own five-minute cron reaches the tick first. It asserts the *outcome* now —
  `summarisedAt` being set — and reports the counter as detail.
- It looked for the touch's alert in `pendingAlerts`, where a correct one can
  never appear: that list is `notifyAt >= now`, and a rhythm alert is planned
  for the moment of the touch. It asks the sweep instead — and the absence of a
  *future-dated* rhythm alarm became the proof that quiet hours did not shift
  it, since a shifted one would sit an hour ahead and be exactly what
  `pendingAlerts` hands the phone.

That last one is worth keeping in mind beyond the gate: **the rhythm is the one
alert kind the phone cannot pre-schedule**, because its moment is now. It
depends on the server sweep, where a task or a reminder does not.

### Still outstanding

- **RTL screenshots** (T360) — needs a physical device, `I3`.
- **"Run rhythm tick" in the admin portal** (T361) — deferred to P10, which
  builds the Automation page. The webhook and the endpoint behind it are done.
- **The manual gate steps** in this file's verification list: the two-account
  two-time-zone walkthrough and the stop-the-backend-over-22:00 catch-up. Both
  are covered by `rhythm-clock.spec.ts` against the clock rule, and both would
  still be worth a human's eyes on a handset — the same `I3`.
- **`messages` on `/sync`** — `contracts/sync.md` types `lastSeq` and a
  `messages` array, and neither is wired. That is P4's: this phase's touches
  reach a connected client over the socket, and the transcript arrives with the
  chat the member can talk back to.

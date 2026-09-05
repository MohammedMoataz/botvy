# Implementation Plan: Daily Rhythm (P3)

**Branch**: `017-daily-rhythm` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/017-daily-rhythm/spec.md`; blueprint data-model §2.5, contracts
`rest-commands.md` (Daily Rhythm), `internal.md` (tick), `events.md` (rhythm rows);
research R-15, P-02, P-04; phases P1 and P2 for preferences, tasks and alerts.

## Summary

One context (Daily Rhythm) with a per-member clock: a five-minute tick from n8n
decides, for each member, whether *their* local plan-prompt, end-of-day or morning
time has arrived, claims that touch's date before sending, builds the draft from Planning (and later Training and
Nutrition through their query ports), writes it into the coaching conversation,
schedules an alert, and records the check-in and streak. Plus the Home screen that
reads it all from the phone's own copy.

## Technical Context

**Language/Version**: TypeScript 5.x / Node 24; Dart 3.5 / Flutter

**Primary Dependencies**: no new backend packages (uses `shared/time`, `rrule` from
P2); mobile — `fl_chart` for the week adherence strip (or hand-drawn; decide at
implementation, prefer hand-drawn to avoid the dependency)

**Storage**: MongoDB `daily_plans`, `checkins`, `rhythm_states`; phone drift
`daily_plans`, `checkins`, `rhythm_state` (schemaVersion 3 → 4, pull-only plus two
push operations)

**Testing**: vitest — two time zones each fire each touch once; downtime catch-up same
day and not the next; an unanswered draft is set at the end of day; DST forward day fires once; a preference change after firing does not
re-fire; check-in classification confined to the coaching conversation and its window;
streak arithmetic (ported `adherence.ts` specs); rollover increments `deferCount`

**Performance Goals**: a tick over 500 members completes in under 10 seconds when
nobody is due; under 60 seconds when everyone is

**Constraints**: claim-then-send; never fire retroactively across days; the coaching
conversation must exist (created in P1) before a prompt can be written into it

**Scale/Scope**: ~30 backend files, ~12 mobile files

## Constitution Check (v2.1.1)

| Principle | Status | How |
|---|---|---|
| I. Store per context | PASS | Rhythm owns its three collections; tasks come from Planning's query port, never from its collection |
| II. n8n infrastructure only | PASS | `rhythm_tick.json` is a five-minute pulse plus an unconditional webhook for an operator; the gateway decides whose time it is |
| III. Local-first LLM | PASS | Only the meal line uses the model, and only from P8; its failure is tolerated |
| IV. Forward-only migrations | PASS | One `migrate-mongo` script; drift 3 → 4 guarded, ladder test extended |
| V. Single public surface | PASS | Tick is service-only behind the edge |
| VI. Multi-user, principals | PASS | The tick is a service principal; every member decision is per `userId` |
| VII. Test-then-verify | PASS | Every rule above has a spec; fixtures relative to `Date.now()` |
| VIII. YAGNI | PASS | No weekly review, no time-boxing; one evening touch |
| IX. Contexts, slices, ports | PASS | Cross-context reads through `TasksDueQuery`, `NextSessionQuery` (stub until P6), `TodayMealsQuery` (stub until P8) |
| X. Commands / queries / streams | PASS | Confirm/skip/check-in are REST commands; plans and streak are GraphQL; the prompt reaches connected clients as a socket message |
| XI. Times belong to the user | PASS | The whole feature is this principle; `shared/time` is the only clock authority |
| XII. Configuration | PASS | `rhythm.checkinWindowHours` and the `defaults.*` seeds are registry keys; each member's times are preferences |

## Design

### Context layout

```text
contexts/rhythm/
├── domain/
│   ├── daily-plan.aggregate.ts     # propose(draft), confirm(taskIds), skip, markBriefed
│   ├── checkin.aggregate.ts        # record(mood, adhered, note)
│   ├── rhythm-state.aggregate.ts   # claimEvening(date), claimMorning(date), awaitCheckin, resolveCheckin, streak
│   ├── adherence.ts                # ported: currentStreak, completionRatio, checkinStillOpen
│   ├── checkin-classifier.ts       # ported EN/AR keyword classifier, negation wins
│   └── ports: daily-plan.repository.ts · checkin.repository.ts · rhythm-state.repository.ts
├── infrastructure/ mongo-*.repository.ts · schemas · mappers · in-memory-*.ts
└── features/
    ├── tick/                       # service-only; the per-member clock
    ├── prompt-now/                 # service-only, unconditional (operator "Run")
    ├── confirm-plan/ skip-plan/ record-checkin/
    ├── today-plan/ tomorrow-draft/ plans/ checkins/ streak/     (queries)
    └── capture-checkin-reply/      # called by Conversations in P4; here it is a command with a spec
```

### The tick

```text
for each member with preferences (paged, projection: userId, timezone, times, flags):
  today  = localDate(now, tz);  hhmm = localHhMm(now, tz)

  if hhmm >= planTomorrowTime and state.lastPlanPromptDate != today:        # default 21:00
      claim(today)                      # write first — once a day, catch-up safe
      draft = build(tomorrow)           # tasks due tomorrow (top 5 by priority, then time) + unfinished today
                                        # + NextSessionQuery(tomorrow) + TodayMealsQuery(tomorrow)
      save daily_plans[tomorrow] status=draft
      write the question + draft into the coaching conversation
      plan an alert (Notifications event) and emit PlanTomorrowPrompted

  if hhmm >= endOfDayTime and state.lastEndOfDayDate != today:              # default 22:00
      claim(today)
      plan = daily_plans[tomorrow]; if plan.status == draft → confirm(autoConfirmed=true)   # "set it by 10pm by default"
      write the summary (top-priority tasks, training yes/no) into the coaching conversation
      plan an alert; if checkinEnabled → state.awaitCheckin(now) and append the question
      emit EndOfDaySummarySent          # Planning's rollover saga reacts to this

  if hhmm >= morningBriefingTime and state.lastMorningBriefingDate != today: # default 08:00
      claim(today); send today's plan; emit MorningBriefingSent
stamp ops_heartbeats['rhythm.tick']
```

A member whose local date is already the next day when they register gets no
back-dated touch: each claim is keyed on the local date, and the first eligible
touch is the next evening. A preference changed after a claim cannot re-fire that
touch because the claim is per date, not per time.

### Draft building and cross-context reads

`TasksDueQuery(userId, date)` and `TasksOpenBeforeQuery(userId, date)` come from
Planning's read port. `NextSessionQuery(userId, date)` and
`TodayMealsQuery(userId, date)` are declared here as ports with **null-returning
stubs** registered until P6 and P8 bind the real implementations — the plan renders
correctly without them (spec Assumptions), and the binding change is a one-line module
edit in those phases.

### Confirmation and rollover

`confirm-plan` stores the chosen task ids, sets `status: confirmed`, raises
`PlanConfirmed`. A Planning saga on `EndOfDaySummarySent` runs `rollover` for tasks that
were open today and are in the confirmed set for tomorrow, moving their `dueAt` and
incrementing `deferCount` (the count the next proposal displays).

### Check-in

The end-of-day summary sets `awaitingCheckin` with `awaitingSince`. In P4 the chat gateway
routes a reply in the coaching conversation to `capture-checkin-reply`, which runs the
ported keyword classifier; `unclear` falls through to a normal chat turn rather than
guessing. Until P4 lands, the phone posts the check-in explicitly from a card
(`POST /api/v1/rhythm/checkins`), which is also the permanent path for the
notification action.

### Mobile

`features/home` — greeting with the member's name, today's plan card (tasks with
checkboxes, a completion ring showing done of total, training slot, meal line), streak with the week's adherence dots, and a
"plan tomorrow" card when a draft is awaiting confirmation. `features/rhythm` —
the confirm sheet (task list with add/remove, carried-over badges) and the check-in
sheet (mood slider 0–100, followed yes/no, note). Notification taps route to the right
sheet. Everything reads drift; the two commands go through the sync push and the REST
command as usual.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Null-returning port stubs for Training and Nutrition | The rhythm must ship before those phases and read correctly without them | Waiting for P6/P8 would delay the feature that makes the product a coach; branching on "does that context exist" inside the tick is worse |
| The prompt is written into a conversation as well as pushed | v1's lesson: a member who opened the app was expected to answer a question that was nowhere on screen | Notification only (the answer lands in a transcript with no question above it) |

## Verification gate

```powershell
pnpm --filter @botvy/backend test    # two zones once each, catch-up, DST, no re-fire after a preference change,
                                     # classifier confined to the coaching conversation, streak, rollover
cd apps/mobile; flutter test; flutter analyze
# manual: set the plan-prompt time two minutes out → question + draft as notification and in the coach chat →
#         ignore → set the end-of-day time two minutes out → summary arrives and the plan is set →
#         set the morning time two minutes out → briefing lists exactly those tasks
curl -s http://localhost/health | jq '.jobs["rhythm.tick"]'
```

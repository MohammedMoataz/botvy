# Implementation Plan: Daily Rhythm (P3)

**Branch**: `017-daily-rhythm` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/017-daily-rhythm/spec.md`; blueprint data-model §2.5 and §2.9,
contracts `rest-commands.md` (Daily Rhythm), `internal.md` (tick), `events.md` (rhythm
rows); research R-15, P-02, P-04; phases P1 and P2 for preferences, tasks and alerts.

## Summary

One context (Daily Rhythm) with a per-member clock: a five-minute tick from n8n
decides, for each member, whether *their* local plan-prompt, end-of-day or morning
time has arrived, claims that touch's date before sending, builds the draft from Planning (and later Training and
Nutrition through their query ports), writes it into the coach conversation,
schedules an alert, and records the check-in and streak. Plus the Home screen that
reads it all from the phone's own copy.

The touches need somewhere to be written, so this phase also lays the Conversations
skeleton the blueprint puts here (P3 T302): the `conversations` and `messages`
collections, the per-user `seq` counter, the two pinned chats created when a member
registers, and one append-message command with its live push. That is the whole of it —
no assistant turn, no free chats, no quick questions. P4 grows it into a conversation
the member can talk back to.

## Technical Context

**Language/Version**: TypeScript 5.x / Node 24; Dart 3.5 / Flutter

**Primary Dependencies**: no new backend packages (uses `shared/time`, `rrule` from
P2); mobile — `fl_chart` for the week adherence strip (or hand-drawn; decide at
implementation, prefer hand-drawn to avoid the dependency)

**Storage**: MongoDB `daily_plans`, `checkins`, `rhythm_states` (Rhythm) and
`conversations`, `messages`, `counters` (Conversations); phone drift `daily_plans`,
`checkins`, `rhythm_state` (schemaVersion 3 → 4, pull-only plus two push operations)

**Testing**: vitest — two time zones each fire each touch once; downtime catch-up same
day and not the next; an unanswered draft is set at the end of day; DST forward day fires once; a preference change after firing does not
re-fire; check-in classification confined to the coach conversation and its window;
streak arithmetic (ported `adherence.ts` specs); rollover increments `deferCount`;
a member registering at 23:00 gets no back-dated touch; a member who changes time zone
mid-day gets no second copy of a touch already sent

**Performance Goals**: a tick over 500 members completes in under 10 seconds when
nobody is due; under 60 seconds when everyone is

**Constraints**: claim-then-send; never fire retroactively across days; the coach
conversation must exist before a prompt can be written into it, which is why this
phase creates it on `identity.UserRegistered` rather than assuming an earlier one did

**Scale/Scope**: ~40 backend files, ~12 mobile files

## Constitution Check (v2.1.1)

| Principle | Status | How |
|---|---|---|
| I. Store per context | PASS | Rhythm owns `daily_plans`, `checkins`, `rhythm_states`; the Conversations skeleton owns `conversations`, `messages`, `counters` and Rhythm reaches it only by dispatching its append command; tasks come from Planning's query handlers, never from its collection |
| II. n8n infrastructure only | PASS | `rhythm_tick.json` is a five-minute pulse plus an unconditional webhook for an operator; the gateway decides whose time it is |
| III. Local-first LLM | PASS | Only the meal line uses the model, and only from P8; its failure is tolerated |
| IV. Forward-only migrations | PASS | One `migrate-mongo` script; drift 3 → 4 guarded, ladder test extended |
| V. Single public surface | PASS | Tick is service-only behind the edge |
| VI. Multi-user, principals | PASS | The tick is a service principal; every member decision is per `userId` |
| VII. Test-then-verify | PASS | Every rule above has a spec; fixtures relative to `Date.now()` |
| VIII. YAGNI | PASS | No weekly review, no time-boxing; three touches and no fourth; the Conversations skeleton is only what the touches need to be written down |
| IX. Contexts, slices, ports | PASS | Cross-context reads are QueryBus dispatches to another context's handlers — `TasksDueQuery` and `TasksOpenBeforeQuery` to Planning's (declared in P2), `NextSessionQuery` (stub until P6) and `TodayMealsQuery` (stub until P8); writing a touch into the conversation is a CommandBus dispatch, not a repository call |
| X. Commands / queries / streams | PASS | Confirm/skip/check-in are REST commands; plans and streak are GraphQL; the prompt reaches connected clients as a socket message |
| XI. Times belong to the user | PASS | The whole feature is this principle; `shared/time` is the only clock authority |
| XII. Configuration | PASS | `rhythm.checkinWindowHours`, `rhythm.draftTopN` and the `defaults.*` seeds (`checkinEnabled`, `planTomorrowTime`, `endOfDayTime`, `morningBriefingTime`) are registry keys from P0; each member's times and check-in flag are preferences; nothing here carries a literal |

## Design

### Context layout

```text
contexts/rhythm/
├── domain/
│   ├── daily-plan.aggregate.ts     # propose(draft), confirm(taskIds, training), skip,
│   │                               #   markPrompted, markSummarised, markBriefed
│   ├── checkin.aggregate.ts        # record(mood, adhered, note)
│   ├── rhythm-state.aggregate.ts   # claimPlanPrompt(date), claimEndOfDay(date), claimMorning(date),
│   │                               #   awaitCheckin, resolveCheckin, streak
│   ├── adherence.ts                # ported: currentStreak, completionRatio, checkinStillOpen
│   ├── checkin-classifier.ts       # ported EN/AR keyword classifier, negation wins
│   └── ports: daily-plan.repository.ts · checkin.repository.ts · rhythm-state.repository.ts
├── infrastructure/ mongo-*.repository.ts · schemas · mappers · in-memory-*.ts
└── features/
    ├── tick/                       # service-only; the per-member clock
    ├── prompt-now/                 # service-only, unconditional (operator "Run")
    ├── bootstrap-on-registered/    # identity.UserRegistered → the rhythm_states row
    ├── confirm-plan/ skip-plan/ record-checkin/
    ├── today-plan/ tomorrow-draft/ plans/ checkins/ streak/     (queries)
    └── capture-checkin-reply/      # called by Conversations in P4; here it is a command with a spec

contexts/conversations/            # the skeleton only — P4 fills it out
├── domain/
│   ├── conversation.aggregate.ts   # create(kind, title, pinned)
│   ├── message.aggregate.ts        # immutable; role, content, seq
│   └── ports: conversation.repository.ts · message.repository.ts · seq.port.ts
├── infrastructure/ mongo-*.repository.ts · mongo-seq.adapter.ts (`counters` $inc) · in-memory-*.ts
└── features/
    ├── bootstrap-on-registered/    # identity.UserRegistered → pinned `coach` + `planner`
    └── append-message/             # command: issue seq, insert, push `chat.message`
```

Three claim dates, three claim methods, one per touch: the plan prompt, the end-of-day
touch and the morning briefing. There is no combined "evening" claim — the two evening
touches are claimed separately or a gateway that came back between them would send only
one of them, or both twice.

### The conversation the touches land in

Nothing before this phase creates a conversation, so this phase does. On
`identity.UserRegistered` the Conversations skeleton writes the two pinned chats the
data model describes — `coach` and `planner`, `pinned: true`, the unique partial index
on `{ userId, kind }` making a replayed event a no-op — and Rhythm writes the member's
`rhythm_states` row from the same event, so the tick never reads a row nobody created.
Both handlers are idempotent on `eventId`; the relay delivers at least once.

`append-message` is the whole write side: `findOneAndUpdate $inc` on
`counters["<userId>:messages"]` issues the `seq`, the message is inserted immutable with
`role: 'assistant'`, and a `chat.message` frame goes to that member's sockets. The three
touches dispatch it on the CommandBus; they do not open a message repository. P4 adds
the user's own turn, the model's reply, free chats, clearing and quick questions on top
of exactly these collections — it extends this skeleton, it does not create one.

### The tick

```text
for each member with preferences (paged, projection: userId, timezone, times, flags):
  today  = localDate(now, tz);  hhmm = localHhMm(now, tz)

  if hhmm >= planTomorrowTime and state.lastPlanPromptDate != today:        # settings.defaults.planTomorrowTime
      claimPlanPrompt(today)            # write first — once a day, catch-up safe
      draft = build(tomorrow)           # tasks due tomorrow, best `rhythm.draftTopN` by priority then time,
                                        #   + unfinished today + NextSessionQuery + TodayMealsQuery
      save daily_plans[tomorrow] status=draft, promptedAt=now
      write the question + draft into the coach conversation
      plan an alert (Notifications event, member-chosen) and emit PlanTomorrowPrompted

  if hhmm >= endOfDayTime and state.lastEndOfDayDate != today:              # settings.defaults.endOfDayTime
      claimEndOfDay(today)
      plan = daily_plans[tomorrow]
      if plan is missing or plan.status == draft:
          rebuild it from live data, then confirm(autoConfirmed=true)       # "set it by 10pm by default"
      # a confirmed or skipped plan is left exactly as the member left it
      write the summary (top priorities, training yes/no) into the coach conversation; markSummarised(now)
      plan an alert (member-chosen); if checkinEnabled → state.awaitCheckin(now) and append the question
      emit EndOfDaySummarySent          # Planning's rollover saga reacts to this

  if hhmm >= morningBriefingTime and state.lastMorningBriefingDate != today: # settings.defaults.morningBriefingTime
      claimMorning(today); send today's plan; markBriefed(now); emit MorningBriefingSent
stamp ops_heartbeats['rhythm.tick']
return { users, planPrompts, endOfDay, morning, checkins, ms }   # contracts/internal.md
```

A member whose local date is already the next day when they register gets no
back-dated touch: each claim is keyed on the local date, and the first eligible
touch is the next evening. A preference changed after a claim cannot re-fire that
touch because the claim is per date, not per time. `profile.PreferencesChanged`
(from P1, carrying `changed[]`) makes the tick re-read that member on its next pass
when a rhythm time or the time zone is in the list; it never clears a claim, so a
member who moves three time zones east after their summary was sent does not get a
second one, and one who moves west simply waits for their new local time tomorrow.

The three alerts these touches plan are marked as chosen by the member, not
system-generated, which is what keeps P2's quiet-hours shift off them (`016` T221
shifts system-generated alerts only). A member whose quiet hours cover their own
08:00 briefing asked for that briefing at 08:00; holding it back would be Botvy
overruling them.

**What keeps tomorrow's draft current.** The blueprint's `TomorrowDraftSaga` marks the
draft stale from `TaskScheduled`, `SessionScheduled` and `MealPlanReady`. This phase
does not build the saga: the end-of-day branch rebuilds an unanswered draft from live
data before it auto-confirms, which reaches the same place — a task scheduled at 21:30
is in the plan that is set at 22:00 — with one code path instead of three subscriptions
and a stale flag. The cost is that the prompt a member reads at 21:00 can be an hour out
of date by the time it is set; the summary they receive at 22:00 names the current
contents, so what they are told is always true. If the saga is wanted later it is
additive, and nothing here has to change.

### Draft building and cross-context reads

`TasksDueQuery(userId, date)` and `TasksOpenBeforeQuery(userId, date)` are dispatched
on the QueryBus to Planning's own handlers, which P2 declares; Rhythm holds only the
query classes and the shape it expects back, and never sees a Planning repository or
collection. `NextSessionQuery(userId, date)` and
`TodayMealsQuery(userId, date)` are declared here as ports with **null-returning
stubs** registered until P6 and P8 bind the real implementations — the plan renders
correctly without them (spec Assumptions), and the binding change is a one-line module
edit in those phases.

### Confirmation and rollover

`confirm-plan` stores the chosen task ids and the `training` flag the member sent with
them (`rest-commands.md`: `{ taskIds, training?: boolean }` — a member who says there is
no training tomorrow has the slot cleared rather than argued with), sets
`status: confirmed`, raises `PlanConfirmed`. A Planning saga on `EndOfDaySummarySent` runs `rollover` for tasks that
were open today and are in the confirmed set for tomorrow, moving their `dueAt` and
incrementing `deferCount` (the count the next proposal displays).

### Check-in

The end-of-day summary sets `awaitingCheckin` with `awaitingSince`, and the window that
follows is `settings.rhythm.checkinWindowHours` (twelve by default). In P4 the chat gateway
routes a reply in the coach conversation to `capture-checkin-reply`, which runs the
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
| A second context (Conversations) opened in this phase | The touches have nowhere to be written otherwise, and the blueprint puts the skeleton here (P3 T302) | Deferring to P4 makes P3 depend on P4; a Rhythm-owned message store would have to be migrated into Conversations a phase later |
| The end-of-day branch rebuilds the draft instead of a stale-marking saga | One code path against three event subscriptions and a flag, for the same outcome at the moment it matters | The saga is the blueprint's design, but nothing reads the stale flag except the rebuild it triggers |

## Verification gate

```powershell
pnpm --filter @botvy/backend test    # two zones once each, catch-up, DST, no re-fire after a preference change,
                                     # late-night registration, a mid-day time-zone change, the pinned chats on
                                     # registration, classifier confined to the coach conversation, streak, rollover,
                                     # a paged tick over 500 members inside the performance goals
cd apps/mobile; flutter test; flutter analyze
# manual: set the plan-prompt time two minutes out → question + draft as notification and in the coach conversation →
#         ignore → set the end-of-day time two minutes out → summary arrives, the plan is set and the streak moves →
#         set the morning time two minutes out → briefing lists exactly those tasks
curl -s http://localhost/health | jq '.jobs["rhythm.tick"]'
```

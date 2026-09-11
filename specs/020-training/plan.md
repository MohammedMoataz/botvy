# Implementation Plan: Training (P6)

**Branch**: `020-training` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/020-training/spec.md`; blueprint data-model §2.6, contracts
`rest-commands.md` (Training), `graphql.schema.graphql` (`nextPractice`, `sessions`,
`program`), `events.md`; research P-03.

## Summary

The Training context: an athlete profile of sports and weekly slots, a saga that
materialises planned sessions two weeks ahead, sessions with planned-versus-actual
sets, programs that fill those sessions, and a personal workout library. It also binds
the two ports the rhythm and the calendar have been holding open with stubs since P3
and P5.

## Technical Context

**Primary Dependencies**: none new, on either side; exercise ordering uses the Flutter
SDK's `ReorderableListView`, and there is no charting yet

**Storage**: MongoDB `athlete_profiles`, `sessions`, `programs`, `workouts`; phone
drift `sessions`, `programs`, `workouts`, `athlete_profile` (schemaVersion 6 → 7)

**Testing**: vitest — cut-off before and after on a 14-day fixture, materialisation
from slots and after a slot change, two sports in one week, program apply with and
without `force`, skip retains the record, rest day stores nothing; flutter — set
logging round trip offline. Every calendar in these fixtures is built relative to
`Date.now()` in a fixed test zone (`Africa/Cairo`); no fixture carries a written date,
which is what makes the suite still green next year.

**Performance Goals**: `nextPractice` < 20 ms; materialising two weeks for a member
< 100 ms

**Constraints**: sport lives on the session, not in separate schemas; a rest day is an
absence; the cut-off is a preference

**Scale/Scope**: ~40 backend files, ~18 mobile files

## Constitution Check (v2.1.1)

| Principle | Status | How |
|---|---|---|
| I. Store per context | PASS | Training owns its four collections; the rhythm and the calendar read it through its query ports |
| II. n8n | PASS | **Corrected while building:** there was no existing nightly tick for it to run on — `rhythm_tick` and `notifications_sweep` are five-minute passes and `meeting_alerts_reconcile` is Notifications'. So this phase adds `POST /internal/training/materialise`, service-only, and one nightly workflow calling it, stamping `ops_heartbeats['training.materialise']`. Still one credential, no data node, no volume |
| III. Local-first LLM | PASS | No inference here; suggestions arrive in P7 |
| IV. Forward-only migrations | PASS | One `migrate-mongo` script; drift 6 → 7 guarded |
| V. Single public surface | PASS | Behind Caddy |
| VI. Multi-user, principals | PASS | Scoped per member |
| VII. Test-then-verify | PASS | The cut-off rule and the materialiser are specced against a fixture calendar built relative to the current clock |
| VIII. YAGNI | PASS | No progression, no wearables, no sharing; media referenced but not fetched; no new package on either side |
| IX. Contexts, slices, ports | PASS | **With one correction:** the § below said both tokens live in Training's `domain/ports`, and that would be backwards. A port belongs to the context that *needs* the answer — `NextSessionPort` is in Rhythm's `domain/`, `TrainingSessionsPort` in Meetings' — and each is bound in its own `infrastructure/` to Training's published query handler. P3 and P5 already built it that way; only the plan's sentence was wrong |
| X. Commands / queries / streams | PASS | Writes REST, reads GraphQL, everything synced |
| XI. Times belong to the user | PASS | Slots are wall-clock times in the member's zone; the cut-off is compared in their zone; a zone or cut-off change re-materialises through `profile.PreferencesChanged` |
| XII. Configuration | PASS | **`training.materialiseDays` was not registered by P0.** The claim was checked — 42 keys in the registry, no `training.*` — so this phase registers it (default 14). `defaults.nextPracticeCutoff` does exist, seeded into `user_preferences` as FR-007 requires. Neither is hard-coded here, which was the point of the row |

## Design

### Context layout

```text
contexts/training/
├── domain/
│   ├── athlete-profile.aggregate.ts   # sports, slots
│   ├── session.aggregate.ts           # plan, log(sets), complete, cancel, skip, applyWorkout
│   ├── program.aggregate.ts           # weeks → session templates; apply(startDate)
│   ├── workout.aggregate.ts
│   ├── set-entry.ts                   # planned vs actual, per-sport shape
│   └── ports: athlete-profile.repository.ts · session.repository.ts · program.repository.ts · workout.repository.ts · session-read.repository.ts
├── infrastructure/ mongo-*.repository.ts · schemas · mappers · in-memory-*.ts · sync-adapters.ts
└── features/
    ├── choose-sports/ set-slots/ create-session/ update-session/ log-session/ complete-session/ cancel-session/ skip-session/
    ├── create-program/ update-program/ apply-program/ archive-program/ delete-program/
    ├── create-workout/ update-workout/ delete-workout/ apply-workout-to-session/
    ├── bootstrap-athlete-profile/        # on identity.UserRegistered
    └── next-practice/ sessions/ session/ programs/ program/ workouts/ athlete-profile/ training-summary/    (queries)
```

`training-summary/` is the sibling of Profile's `ProfileSummaryQuery` that the coach
prompt reads: sports, the next session and the streak of completed ones, nothing more.
`athlete-profile` answers a document rather than `null` because the profile is created
when the member registers, which is what lets the read side promise one.

### Set shapes

One `SetEntry` type with optional fields (`targetReps`, `targetWeightKg`,
`targetDurationSec`, `targetDistanceM`, and their `actual` counterparts, plus `done`).
The editor shows the pair that suits the session's sport — reps and weight for gym and
calisthenics, distance and duration for swimming, running and cycling, duration only
for a game — but the stored shape is one, so a member who trains in several sports
gets one history and the coach one vocabulary.

### Materialiser saga

**Corrected while building, and this one would have been a live defect.** This said
the saga listens to `profile.PreferencesChanged` "whose `changed[]` names the time
zone". It cannot: `timezone` lives on the **profile**, not in `PREFERENCE_FIELDS`, so a
member who moves raises `profile.ProfileUpdated` — which is why `plan-alerts.saga.ts`
subscribes to that event for its own re-plan, and Rhythm's
`preferences-changed.handler.ts` says as much in a comment. Implemented as written, the
zone recompute below would never once have run, and a member who flew would have kept a
fortnight of sessions on the clock of the city they left. So the saga takes **both**
event names and branches on the field named: `timezone` from `ProfileUpdated` triggers
the recompute, `nextPracticeCutoff` from `PreferencesChanged` triggers an ordinary
pass. If `timezone` ever moves onto preferences, nothing about the saga changes.

On `SportsChanged`, `SlotsChanged`, `ProgramApplied`, `profile.ProfileUpdated` or
`profile.PreferencesChanged` whose `changed[]` names the time zone or
`nextPracticeCutoff`, and the nightly pass:
for each member, expand the slots over the next `training.materialiseDays` in the
member's own zone through `shared/time`, create the `planned` sessions that do not yet
exist, and **tombstone** future `planned` sessions whose slot no longer exists — never
touching sessions that have been logged, completed, cancelled or skipped, and never
touching the past.

Tombstone rather than delete, and it matters: sessions sync, the pull is a delta by
cursor, and the client's delete sweep runs only against a full snapshot — so a hard
`remove` would leave the row on every device for ever, with an alarm it will still
fire. A deletion reaches a client as a tombstone or not at all. `tombstone()` also
raises `SessionDeleted`, which is what drops the alerts, where `remove` announces
nothing; and it keeps the status, so the Deleted view can show the member what
happened — they did not delete these, their *slot* went.

**And the corollary the derived id forces:** a re-added slot computes the same `_id`, so
the pass finds the tombstoned row rather than nothing. It therefore **restores** it and
re-announces, instead of quietly declining to create a session that "already exists" —
without that, a member who edited their week and put a slot back would silently lose a
fortnight. On a zone change it also recomputes `plannedAt` for every future
`planned` session from the slot's wall-clock time, because the instant that was 18:00
in Cairo is not 18:00 in Berlin and nobody re-reads the slot at alert time.

**Idempotency.** The identifier is derived, not looked up: `_id = uuidv5(
"${userId}:${slotId}:${localDate}", trainingNamespace)`, where `localDate` is the
session's date in the member's zone. Creation is an upsert on that `_id`, so a second
tick, a retried event and a redelivery all collapse into the same row without a query
and without a second index — the primary key is the uniqueness. Sessions the member
creates by hand keep their client-minted UUIDv7 and carry no `slotId`.

**Filling from the active program.** A newly created session is not born empty. The
program remembers the date it was applied from — `appliedStartDate`, written by
`apply-program` and left alone by archiving — because week arithmetic on a horizon that
outruns the apply is impossible without it and the blueprint's shape does not name it;
the field is additive, so nothing migrates. If the member has an `active` program with
an `appliedStartDate`, the saga computes
`weekIndex = floor(daysBetween(appliedStartDate, localDate) / 7)` and, when that week exists
in the program, copies the template for that weekday — `title`, `focus`, `exercises`
with their target sets, `programId` and `weekIndex` — onto the new session. This is
what makes a program longer than `training.materialiseDays` land in full: week four is
filled on the day the horizon reaches it, not at apply time (FR-008). A program
`archived` is no longer consulted; sessions it already filled keep their content
untouched, because the member can see them and may already have edited them, and
applying another program is the path that replaces content — with its warning.

**Announcing.** Every newly created `planned` session — from the saga, from
`create-session`, and from a suggestion accepted later — writes
`training.SessionScheduled { sessionId, plannedAt, sport, focus? }` to the outbox in
the same unit of work that writes the session. It is the only announcement: the alert
pipeline, the rhythm's tomorrow draft and P7's suggestion saga all hang off it, so a
session that appears without one is a session nobody is reminded about.

### Next practice

```text
now, tz, cutoff = preferences.nextPracticeCutoff
if localHhMm(now, tz) < cutoff:  today's session (any status) if one exists
else:                            the first `planned` session strictly after the end of today
none → { session: null, reason: 'none-scheduled' }
```

`reason` is returned so the client can word the empty state correctly rather than
guessing (`today`, `after-cutoff`, `none-scheduled`).

**Missed** is not a fifth status; it is `status === 'planned'` and
`plannedAt + durationMin < now` in the member's zone, answered by the session itself
(`isMissed(now, tz)`, resolved through `shared/time`) and exposed on the read model, so
the card, the week view and Today all ask the same question; the server never writes
it. Storing it would mean a sweep that
rewrites rows the member never touched, and the row would then have to be un-missed
when they log it late (FR-018).

### Program apply

`apply-program { startDate, force? }` maps week templates onto the member's slots from
`startDate` forward. Sessions that already carry logged content are never overwritten;
sessions with planned content are reported in a `wouldReplace` list and the command is
refused without `force` (FR-008 warning). Applying raises `ProgramApplied` to the
outbox, which the materialiser consumes and Conversations turns into a coach message.

The blueprint's `rest-commands.md` gives apply the body `{ startDate }`; this phase
extends it to `{ startDate, force? }` and gives it the answer
`{ applied: boolean, wouldReplace: [{ sessionId, plannedAt, title }] }`, because a
warning the member must see before content is replaced cannot be delivered by a
command that only ever succeeds. The extension is additive — an old caller sending
`{ startDate }` gets the refusal with the list, which is the safe half.

### Binding the open ports

`rhythm.module.ts` rebinds `NextSessionPort` from its P3 stub to an adapter over
Training's published query, and `meetings.module.ts` swaps the null-safe placeholder P5
has been holding in the agenda for one over `SessionsInRangeQueryHandler` — a one-line
change in each module, which is the point of having agreed the shape before the
implementation existed.

**The last sentence of this section was wrong and is worth correcting rather than
deleting**, because the mistake is an easy one to make again. It said both tokens live
in Training's `domain/ports`. They do not, and they must not: a port belongs to the
context that *needs* the answer, so `NextSessionPort` is declared in Rhythm's `domain/`
and `TrainingSessionsPort` in Meetings', each bound in its own `infrastructure/` — the
one layer constitution IX lets know another context exists. Putting the token in
Training would invert the dependency: Rhythm would import Training's domain to describe
its own need, and the stub P3 shipped could not have existed at all, because there
would have been nothing to declare it against. P3 and P5 both built it the right way
round; only this sentence was upside down.

What Training publishes is therefore *query handlers*, not tokens: `NextPracticeQuery`
and `SessionsInRangeQuery`. The consuming modules bind their own port to one of those,
and never to the collection.

### Sync

Four adapters register with the `sync-registry` P2 built. `sessions`, `programs` and
`workouts` behave like every other synced row: client-minted ids, the `baseUpdatedAt`
conflict rule, tombstones, and the delete sweep only against a full snapshot.
`athlete_profile` is the exception the blueprint's coverage table already names — one
document per member, pushed as a patch over an allowlist (`sports`, `slots`) with no
conflict check, because the client and the server write disjoint fields, and with no
sweep, because there is nothing to delete. Rejections carry their `entity` so the phone
branches before touching a table: `stale` with the server row and `gone` for a
tombstoned session, `invalid` for a slot the profile no longer holds, and never
`protected` — nothing in Training is protected.

### Where the indexes live

**Corrected while building.** This section said "the mongo schemas declare the indexes
so a reader of the context sees them", and a literal reading of that contradicts both
constitution IV and the check that enforces it: `shared/persistence/mongo/schemas.spec.ts`
asserts that **no schema declares an index**, because an index created by Mongoose's
`autoIndex` is an index created differently on every deploy, at a moment nobody chose,
against whatever the code said that day.

So the arrangement is the one every other context already uses, and it does give a
reader of the context what the sentence was reaching for: the `migrate-mongo` script is
the only thing that creates an index, and each one carries a comment naming the read it
serves. One declaration, one forward migration, and the schemas describe shape only.

### The seam P7 will use

`sessions.suggestionId` and `programs.source` / `sourceLinkIds` are in the schema from
the first task, written by nothing in this phase. When P7 accepts a suggestion it
raises `knowledge.SuggestionAccepted { suggestionId, sessionId? }` and a Training
handler fills or creates the session — that handler is built in P7, beside the event
that feeds it, rather than here where it would be a consumer with no producer. The
point of carrying the fields now is that P7 needs no migration when it arrives.

### Mobile

`features/athlete`: sports picker (known list + own name), weekly slot editor, the
next-practice card with its three empty states, the week view grouped by day with
sport chips, session detail with the set logger (per-sport controls, quick +/- steppers,
"repeat last" from history), programs list with apply and archive, workout library.

Today's list gains a training row — `features/home/widgets/training_row.dart` — as its
own kind: not a task, not completable there, tapping opens the session. It watches the
phone's own `sessions` table for today rather than the `training` line in the night's
`daily_plans` snapshot, so completing or skipping a session offline changes the row at
once instead of waiting for tomorrow's plan; the snapshot line stays what it always
was, the evening's summary of what the day was going to hold.

### Decisions taken while closing the analysis

Six questions the analysis raised had no settled answer, and each was decided the way
the constitution and the blueprint lean: archiving a program leaves the sessions it
already filled alone (deleting content the member can see is worse than leaving it, and
applying another program is the path that replaces it, with its warning); the
materialiser's key is a derived `_id` rather than a new field and a partial index (the
primary key is already unique, and Mongo's missing-equals-null rule makes partial
uniqueness the fiddlier of the two); "missed" is derived at render rather than swept
into the row (nothing may rewrite a row the member did not touch); the Today row reads
the phone's sessions rather than the plan snapshot (offline-first); the handler for
`knowledge.SuggestionAccepted` is built in P7, where its producer is; and the program
gains `appliedStartDate`, an additive field the blueprint's shape does not carry,
because filling week four later needs a date the apply left behind.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Sessions materialised ahead rather than derived from slots on read | The phone must schedule alerts and work offline against real rows; the rhythm needs a session id to name | Deriving on read means no id, no alerts, no offline logging |
| One set shape with optional fields | A multi-sport athlete gets one history and the coach one vocabulary | A schema per sport multiplies the model, the editor and every query by the number of sports |

## Verification gate

```powershell
pnpm --filter @botvy/backend test    # cut-off both sides over 14 days, materialiser idempotency, slot change,
                                     # two sports in one week, program fill beyond the horizon, time-zone change,
                                     # apply with and without force, skip retains, rest day stores nothing
                                     # (every fixture calendar built from Date.now() in a fixed test zone)
cd apps/mobile; flutter test; flutter analyze
# manual: set gym Mon/Wed/Fri 18:00 and swimming Sun 08:00 → the week populates; at 20:00 Wednesday the card
#         shows Wednesday, at 21:30 it shows Friday; log six exercises offline → appears elsewhere once;
#         Today shows the 18:00 training row; the evening proposal names tomorrow's session
```

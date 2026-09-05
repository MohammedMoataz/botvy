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

**Primary Dependencies**: none new on the backend; mobile — `reorderable_list` for
exercise ordering (or hand-rolled), no charting yet

**Storage**: MongoDB `athlete_profiles`, `sessions`, `programs`, `workouts`; phone
drift `sessions`, `programs`, `workouts`, `athlete_profile` (schemaVersion 6 → 7)

**Testing**: vitest — cut-off before and after on a 14-day fixture, materialisation
from slots and after a slot change, program apply with and without `force`, skip
retains the record, rest day stores nothing; flutter — set logging round trip offline

**Performance Goals**: `nextPractice` < 20 ms; materialising two weeks for a member
< 100 ms

**Constraints**: sport lives on the session, not in separate schemas; a rest day is an
absence; the cut-off is a preference

**Scale/Scope**: ~40 backend files, ~18 mobile files

## Constitution Check (v2.1.1)

| Principle | Status | How |
|---|---|---|
| I. Store per context | PASS | Training owns its four collections; the rhythm and the calendar read it through its query ports |
| II. n8n | PASS | The materialiser runs on the existing nightly tick |
| III. Local-first LLM | PASS | No inference here; suggestions arrive in P7 |
| IV. Forward-only migrations | PASS | One `migrate-mongo` script; drift 6 → 7 guarded |
| V. Single public surface | PASS | Behind Caddy |
| VI. Multi-user, principals | PASS | Scoped per member |
| VII. Test-then-verify | PASS | The cut-off rule and the materialiser are specced against a fixture calendar |
| VIII. YAGNI | PASS | No progression, no wearables, no sharing; media referenced but not fetched |
| IX. Contexts, slices, ports | PASS | `NextSessionQuery` and `SessionsInRangeQuery` are the ports P3 and P5 already declared; this phase binds the real implementations |
| X. Commands / queries / streams | PASS | Writes REST, reads GraphQL, everything synced |
| XI. Times belong to the user | PASS | Slots are wall-clock times in the member's zone; the cut-off is compared in their zone |
| XII. Configuration | PASS | `training.materialiseDays` (default 14) and `defaults.nextPracticeCutoff` are registry keys |

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
├── infrastructure/ mongo-*.repository.ts · schemas · mappers · in-memory-*.ts
└── features/
    ├── choose-sports/ set-slots/ create-session/ update-session/ log-session/ complete-session/ cancel-session/ skip-session/
    ├── create-program/ update-program/ apply-program/ archive-program/ delete-program/
    ├── create-workout/ update-workout/ delete-workout/ apply-workout-to-session/
    └── next-practice/ sessions/ session/ programs/ program/ workouts/ athlete-profile/    (queries)
```

### Set shapes

One `SetEntry` type with optional fields (`targetReps`, `targetWeightKg`,
`targetDurationSec`, `targetDistanceM`, and their `actual` counterparts, plus `done`).
The editor shows the pair that suits the session's sport — reps and weight for gym and
calisthenics, distance and duration for swimming, running and cycling, duration only
for a game — but the stored shape is one, so a member who trains in several sports
gets one history and the coach one vocabulary.

### Materialiser saga

On `SportsChanged`, `SlotsChanged`, `ProgramApplied` and the nightly tick: for each
member, expand slots over the next `training.materialiseDays`, create `planned`
sessions that do not yet exist (idempotent on `(userId, slotId, date)`), and remove
future `planned` sessions whose slot no longer exists — never touching sessions that
have been logged, completed, cancelled or skipped, and never touching the past.

### Next practice

```text
now, tz, cutoff = preferences.nextPracticeCutoff
if localHhMm(now, tz) < cutoff:  today's session (any status) if one exists
else:                            the first `planned` session strictly after the end of today
none → { session: null, reason: 'none-scheduled' }
```

`reason` is returned so the client can word the empty state correctly rather than
guessing (`today`, `after-cutoff`, `none-scheduled`).

### Program apply

`apply-program { startDate, force? }` maps week templates onto the member's slots from
`startDate` forward. Sessions that already carry logged content are never overwritten;
sessions with planned content are reported in a `wouldReplace` list and the command is
refused without `force` (FR-008 warning). Applying raises `ProgramApplied`, which the
materialiser consumes.

### Binding the open ports

`rhythm.module.ts` and `meetings.module.ts` rebind `NextSessionQuery` and
`SessionsInRangeQuery` from their P3/P5 stubs to Training's implementations — a
one-line change in each, which is the point of having declared them as ports.

### Mobile

`features/athlete`: sports picker (known list + own name), weekly slot editor, the
next-practice card with its three empty states, the week view grouped by day with
sport chips, session detail with the set logger (per-sport controls, quick +/- steppers,
"repeat last" from history), programs list with apply and archive, workout library.
Today's list gains a training row rendered as its own kind (not a task, not
completable there — tapping opens the session).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Sessions materialised ahead rather than derived from slots on read | The phone must schedule alerts and work offline against real rows; the rhythm needs a session id to name | Deriving on read means no id, no alerts, no offline logging |
| One set shape with optional fields | A multi-sport athlete gets one history and the coach one vocabulary | A schema per sport multiplies the model, the editor and every query by the number of sports |

## Verification gate

```powershell
pnpm --filter @botvy/backend test    # cut-off both sides over 14 days, materialiser idempotency and slot change,
                                     # program apply with and without force, skip retains, rest day stores nothing
cd apps/mobile; flutter test; flutter analyze
# manual: set gym Mon/Wed/Fri 18:00 and swimming Sun 08:00 → the week populates; at 20:00 Wednesday the card
#         shows Wednesday, at 21:30 it shows Friday; log six exercises offline → appears elsewhere once;
#         Today shows the 18:00 training row; the evening proposal names tomorrow's session
```

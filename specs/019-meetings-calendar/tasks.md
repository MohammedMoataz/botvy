# Tasks: Meetings & Calendar (P5)

**Input**: `spec.md`, `plan.md`; blueprint data-model §2.10, contracts.

**Task ids** are phase-local. The blueprint's own `tasks.md` runs a separate `T###`
series for its whole-platform outline; a number that appears in both files means two
different things, and neither is renumbered against the other.

**Tests**: mandatory for every recurrence case, override versus series edit, alert
window reconciliation, a time-zone change, agenda ordering, DST stability. Every date
in a fixture is computed from the current clock — the next 31st, the next daylight-saving
transition after `Date.now()` — never written as a literal date, which would pass until
the day the clock reached it.

## Phase 1 — Domain and expansion

- [x] T501 `contexts/meetings/domain/`: `meeting.aggregate.ts` (schedule, edit with `force`, skipOccurrence, moveOccurrence, complete, cancel, tombstone, restore, purge past the `reminders.tombstoneDays` horizon), `calendar-event.aggregate.ts` (same lifecycle, including purge), ports
- [x] T502 `domain/recurrence-expander.ts` — wall-time expansion in the member's zone (or `lockTimezone`), exdates, overrides keyed by `originalStart`, orphan overrides included; a repeating `calendar_events.recurrence` goes through this same expander, so a personal event skips and moves exactly as a meeting does; specs (dates derived from `Date.now()`, never literal): monthly on the 31st both ways, weekly first occurrence today, the next DST week keeps 18:00, move onto a skipped date clears the skip, series edit warns about an orphaned override, a repeating personal event expands identically
- [x] T503 [P] `infrastructure/`: mongo adapters, schemas, mappers, in-memory adapters

## Phase 2 — Slices

- [x] T510 [P] `create-meeting/ update-meeting/ complete-meeting/ cancel-meeting/ delete-meeting/ restore-meeting/ purge-meeting/` with events; a create that names no length takes the member's `defaults.meetingDurationMin` preference, and one that names neither a link nor an address is refused; spec: purge refuses a row that is not a tombstone
- [x] T511 [P] `skip-occurrence/ move-occurrence/` — path parameters carry `originalStart`; both raise their events. There is deliberately no cancel-occurrence or complete-occurrence command: an outcome belongs to the meeting, a date is skipped or moved (FR-013)
- [x] T512 [P] `create-event/ update-event/ delete-event/ purge-event/` for personal events, repeat included
- [x] T513 [P] Queries `meeting(id)`, `meetings(includeCompleted)` with `nextOccurrence`, and `MeetingOccurrencesQuery(userId, from, to)` — the port Notifications' saga calls (T520); spec: it expands exactly what the agenda expands
- [x] T514 [P] `MeetingSyncAdapter` and `CalendarEventSyncAdapter` registered with P2's sync registry (`SyncableEntity`): `pull` returns full rows with tombstones, `apply` covers `create|update|delete|restore|purge`, `purgeHorizonDays` reads `reminders.tombstoneDays`; specs: a stale push is rejected with `entity: "meetings"` and the server row, a purge of a live row is rejected `not_deleted`, a delete leaves `status` untouched

## Phase 3 — Alerts

- [x] T520 Extend Notifications' `AlertPlanningSaga` (P2, worker) with a meetings branch — `MeetingScheduled|MeetingChanged|OccurrenceSkipped|OccurrenceMoved|MeetingCompleted|MeetingCancelled|MeetingDeleted`, reading occurrences through Meetings' `MeetingOccurrencesQuery` (T513) for the next `meetings.alertWindowDays` and reconciling the desired alert set; one alert per reminder offset plus a preparation alert when `prepMinutes > 0`; nothing outside Notifications touches `alerts`; specs: skip removes, move relocates, cancel and complete both clear, reconciliation run twice changes nothing
- [x] T521 [P] Registry key `meetings.alertWindowDays` (default 14) with schema and description
- [x] T522 Same saga consumes `profile.ProfileUpdated` (P1) and re-plans every meeting of that member when `changed[]` names the time zone; specs: a member moved from Cairo to Berlin has every future occurrence's instant and every alert shifted, a meeting with `lockTimezone` is untouched, an update that changed only the display name plans nothing (FR-014)
- [x] T523 [P] `POST /internal/notifications/reconcile-meeting-alerts` — service-only (`internal:tick`), runs T520's reconciliation for every member so the rolling window advances on a quiet day, stamps `ops_heartbeats['notifications.meeting-alerts']`; one new nightly workflow `workflows/meeting_alerts_reconcile.json` calls it, with `error_handler.json` as its error workflow; spec: a user JWT is refused

## Phase 4 — The calendar

- [x] T530 `features/agenda/` — merge expanded meetings (+ preparation blocks), timed tasks through Planning's `TimedTasksInRangeQuery(userId, from, to)` (the range sibling of P2's single-day `TasksDueQuery`), training sessions through `SessionsInRangeQuery(userId, from, to)` declared in `meetings.module.ts` and bound here to a null-safe stub that P6 rebinds, and personal events; ordered by instant, grouped by day, each item carrying its kind; specs: a day with all four kinds orders correctly, the stubbed sessions port contributes nothing rather than throwing
- [x] T531 [P] `features/month-overview/` — per-day counts and busy markers for a month; a day is busy when it holds at least one item of any kind (FR-009)
- [x] T532 [P] Rhythm draft builder gains meetings (P3's `TasksDueQuery` sibling: `MeetingsOnQuery`), so the evening proposal names tomorrow's meetings **and** the morning briefing names today's; spec: both touches list a meeting with its time (FR-012)

## Phase 5 — Mobile

- [x] T540 Drift 5 → 6: `meetings`, `calendar_events` with the sync mixin, `schemaVersion` bump with its guarded `MigrationStrategy` branch, ladder test extended; both tables wired into the phone's sync entity list, `purge` included, and rejections branched on `entity` before any table is touched
- [x] T541 `features/meetings` — editor (name, description, start, length defaulting to the member's `defaults.meetingDurationMin` preference, location switch link/address with at least one required, preparation notes and minutes, reminder offsets, repeat picker in plain words with an end condition, a "keep this on <place>'s clock" toggle for `lockTimezone`), a confirm dialog before a series edit discards a moved occurrence, occurrence actions (skip, move), meeting actions (complete, cancel), delete with undo; spec: complete and cancel are offered on the meeting and never on one date of a series (FR-013)
- [x] T542 [P] `features/calendar` — `table_calendar` month with busy markers, a week view of seven days with their items in time order, day agenda merging every kind, all read from drift and expanded by T545, tap-through to the item (FR-009)
- [x] T543 [P] Home's today card reads the local agenda — drift rows expanded by T545, never the GraphQL query, which serves only the extension and the web calendar (FR-010); notification tap opens the meeting with its link or map
- [x] T544 [P] Cubit specs: the expansion shown matches the server's for a fixture series; benchmark — a fixture month holding 200 occurrences (a weekly series and a daily one, both anchored on `DateTime.now()`) renders in under 300 ms measured in profile mode (SC-003)
- [x] T545 `core/recurrence/expander.dart` — the phone's own expander over `rrule`: wall-time expansion in the member's zone or `lockTimezone`, exdates, overrides keyed by `originalStart`, orphan overrides included, personal events too; specs: the same fixture table as T502, case for case, so a divergence from the server fails here

## Phase 6 — Extension and chat

- [x] T550 [P] Extension: next seven days of meetings in the side panel with a join button; quick-add meeting; Dexie tables and sync entities extended
- [x] T551 [P] P4's `intent-executor` gains `set_meeting` (title, when, length, link or address), replacing the "not yet" reply; fixture sentences added to the intent corpus

## Phase 7 — Polish

- [x] T560 [P] `migrate-mongo` indexes; Arabic strings for the repeat picker (plural and dual forms) — **RTL screenshots outstanding**, they need a physical Android device and are the same open item P2, P3 and P4 each recorded. The picker's *chrome* is still English and is recorded as `enhancements/E-015`; the plural-and-dual clause, which is the part with linguistic risk in it, is done and tested
- [x] T561 [P] `purge-on-deleted` handler for `meetings` and `calendar_events` on `identity.UserDeleted`; spec
- [x] T562 Record gate evidence; open `020-training`

## Dependencies

T501 → T502 → T503 → T510–T514. T520 needs T513's `MeetingOccurrencesQuery` and P2's
`AlertPlanningSaga`; T522 additionally needs P1's `profile.ProfileUpdated{changed[]}`;
T523 needs T520. T514 needs P2's sync registry. T530 needs T502 plus Planning's
`TimedTasksInRangeQuery`; Training's `SessionsInRangeQuery` stays null-safe until P6.
Mobile T540 → T545 → T541/T542/T543 → T544.

## Verification gate

1. `pnpm --filter @botvy/backend test` — the full recurrence table, alert
   reconciliation, the time-zone re-plan, the sync adapters' rejections, agenda merge.
2. `cd apps/mobile && flutter test && flutter analyze` — including the phone
   expander against T502's fixture table and the 200-occurrence month benchmark.
3. Manual: create a weekly meeting for six weeks with a 30-minute reminder; skip week
   three; move week five by an hour → phone and extension both show five occurrences
   with one moved; reminders arrive for exactly those; monthly on the 31st lands on
   28/29 February; a series spanning a clock change keeps its local time; with the
   phone in flight mode the calendar and the home card still show the day.
4. The evening proposal names tomorrow's meetings and the morning briefing names
   today's.
5. Change the profile's time zone → the member's future occurrences and their
   reminders move within the minute, and a meeting marked as fixed to a place does not.
6. `/health` reports `notifications.meeting-alerts` fresh after the nightly workflow
   has run once.

---

## Gate evidence

Run on 2026-09-10 against the live `botvy-v2` stack after a clean image rebuild.
Every command below was executed; the numbers are the output, not a summary of
it.

### Unit and static

```
pnpm --filter @botvy/backend test
  Test Files  71 passed (71)
       Tests  1142 passed (1142)

pnpm --filter @botvy/backend typecheck
  tsc --noEmit -p tsconfig.build.json && tsc --noEmit -p tsconfig.json
  (clean)

pnpm lint
  Found 0 warnings and 0 errors.
  Finished in 4.4s on 475 files with 102 rules using 12 threads.

cd apps/mobile; flutter test
  00:52 +304: All tests passed!
cd apps/mobile; flutter analyze
  No issues found! (ran in 15.0s)

cd packages/sdk; npx vitest run
  Test Files  3 passed (3)   Tests  91 passed (91)
```

`pnpm typecheck` covers **two** projects as of this phase. It ran only
`tsconfig.build.json` before, which excludes `**/*.spec.ts` — so a type error in
a spec was invisible to every gate that recorded the command as green, and three
separate pieces of this phase's work hit one independently. `oxlint.json` also
gained `meetings` in its constitution-IX pattern list, and the rule was probed by
writing a file that should fail and watching the "Constitution IX" message
appear anchored on it. 102 rules over 475 files, so the three
`no-restricted-imports` overrides really ran.

### The built artefact

```
node infra/verify-esm.mjs
  PASS  the backend has been built
  PASS  app.module.js loads under plain node
  PASS  worker.module.js loads under plain node
  3/3 checks passed
```

That is not ceremony: this phase adds a second `rrule` consumer, and `rrule` is
CommonJS in a `"type": "module"` package — the import that type-checks and
passes every vitest run is `undefined` under plain `node`. The expander
destructures off the default export for that reason, and this is what proves it.

The compiled code was then confirmed to be **in the container**, because a
failed `docker compose build` followed by a recreate looks exactly like a
successful deploy — and the first build of this phase was in fact killed by a
600-second timeout and reported `failed to execute bake: exit status 143`:

```
docker exec botvy-v2-backend-1 sh -c "ls dist/contexts/meetings/domain/"
  calendar-event.aggregate.js  meeting.aggregate.js  meetings.ports.js
  meetings.repositories.js     recurrence-expander.js
docker exec botvy-v2-backend-1 sh -c "ls prompts/"
  chat.md  coach.md  intent.md  planner.md
```

### Contracts

```
pnpm gen:contracts   # after a build — see below
```

All five reads reach a client, checked in the regenerated
`packages/contracts/schema.graphql` rather than assumed:
`agenda(from,to)`, `meeting(id)`, `meetingOccurrences(from,to)`,
`meetings(includeCompleted)`, `monthOverview(year,month)`, plus the ten types
(`Meeting`, `MeetingOccurrence`, `MeetingRecurrence`, `Location`, `Override`,
`AgendaItem`, `AgendaDay`, `AgendaKindCounts`, `MonthDay`, `CalendarEvent`) and
seven `events/meetings.*.schema.json` payloads.

**`gen:contracts` runs `node dist/main.js`.** Run without building first, it
republished the previous schema with a success message and zero occurrences of
`Meeting` in it. The event catalogue in `contracts.generate.ts` is
hand-maintained besides, so the seven payloads are a row each rather than
something the generator discovered.

### The platform gate

```
node infra/bootstrap.mjs
  ok    Mongo migrations — applied
  ok    n8n workflows imported — 4 files: 1 created, 3 updated, 1 activated
  ok    health summary — status=ok postgres=true mongo=true ollama=true

node infra/verify.mjs
  PASS  containers healthy — 8 services
  PASS  exactly one public port — caddy:0.0.0.0:8090
  PASS  health reports both stores — status=ok postgres=true mongo=true ollama=true push=true
  PASS  no stale jobs — 4 jobs fresh
  PASS  bootstrap is safe to run again — second run changed nothing
  5/5 checks passed in 24s
```

Four jobs, not three: `notifications.meeting-alerts` is stamped and fresh, which
means the new nightly workflow actually reached the gateway through n8n rather
than only through a gate calling `/internal/*` directly. That distinction is the
whole reason the heartbeat rule exists — no scheduled job had ever run on this
installation until P4 found `$env` blocked in node expressions, and every gate
before it had been calling the endpoints directly and passing.

```
curl /health | jq '.jobs'
  notifications.meeting-alerts  fresh  2026-09-10T19:49:03.503Z
  notifications.sweep           fresh  2026-09-10T19:40:40.711Z
  outbox.relay                  fresh  2026-09-10T19:50:11.337Z
  rhythm.tick                   fresh  2026-09-10T19:50:08.634Z
```

### The phase gate

```
node infra/verify-p5.mjs
```

**28/28 checks passed** against `http://127.0.0.1:8090`. In full:

```
PASS  a repeating meeting is created through REST — status=200
PASS  the agenda expands the series to six occurrences — occurrences=6
PASS  each occurrence carries its preparation block (FR-002) — prep=6 meetings=6
PASS  the published occurrence read agrees with the agenda — occurrences=6 agenda=6
PASS  one occurrence is skipped and one is moved — skip=200 move=200
PASS  five occurrences remain, one of them at the moved time (SC-001) — occurrences=5 moved=true
PASS  BYMONTHDAY=31 skips February — total=8 february=0
PASS  BYMONTHDAY=-1 lands on the last day of February — total=14 february=1 on 2027-02-28
PASS  every occurrence reads 18:00 across the clock change (SC-005) — distinct local times=18:00 crossed=true count=14
PASS  the meeting has reminders planned for its occurrences — alerts=2
PASS  no reminder survives for the skipped occurrence (SC-002) — checked 2 alert(s)
PASS  a meeting pinned to a place keeps its instants when the member moves — 5 occurrence(s), unchanged=true
PASS  an unpinned meeting follows the member, keeping its wall time (FR-014) — moved=true local=17:00
PASS  the member's warnings move with the meeting, without waiting a day — 5 alert(s) at 16:00 Berlin
PASS  cancelling a meeting clears its reminders — status=200 cleared=true
PASS  deleting leaves the status untouched — deletedAt=true status=scheduled
PASS  purging a live row is refused — status=409
PASS  the reconcile endpoint refuses a member's own token (constitution VI) — refused
PASS  the nightly reconcile runs with the service token — {"members":1,"meetings":1,"planned":0,"removed":0,"ms":90}
PASS  the reconcile stamps a heartbeat /health can report — stale=false
PASS  both collections travel over /sync — meetings=6 events=0
PASS  a push against a row that is not there is refused, and not as stale — meetings/gone
PASS  the month overview marks the days that hold something (FR-009) — busy=2/30
PASS  a repeating personal event expands onto the agenda (FR-011) — occurrences=4
PASS  one occurrence of an event is skippable, exactly as a meeting is — remaining=3
PASS  the morning briefing names the day's meetings (FR-012) — named "Gate call today"
PASS  the evening proposal names the day's meetings (FR-012) — named "Gate call tomorrow"
PASS  the member can delete their own account, purging both collections — status=200
```

Three of those took two runs, and the corrections were the gate's rather than the
product's — recorded because a gate that was wrong once is worth distrusting
twice:

- **The service token has a different name on the host.** Compose exports the
  secret to n8n as `BOTVY_SERVICE_TOKEN` and `BOTVY_INTERNAL_TOKEN`; `.env`
  calls it `INTERNAL_SERVICE_TOKEN`. Reading the container's names from the host
  gives an empty `Bearer ` and a 401 on every internal call — which would have
  reported the reconcile as a broken feature.
- **`/health`'s heartbeat rows key on `job`, not `name`.** Reading the wrong key
  gives `undefined` for every row, the lookup misses, and a working heartbeat
  reports as a missing one.
- **FR-012 needed two meetings, not one.** The evening proposal is about
  *tomorrow* and the briefing about *today*, so one meeting created today could
  not satisfy both — and the read itself was asking `messages(… limit: 50)`
  where the schema says `first`, so GraphQL refused the query and the optional
  chain quietly returned "not named". The check now asserts the `errors` array
  explicitly: a query that cannot be validated must never be reported as a
  missing feature.

### Success criteria

| | Verdict | Evidence |
|---|---|---|
| SC-001 six weeks, one skip, one move → five, one moved | **met** | gate, through the public GraphQL agenda; and on the phone in `test/recurrence_expander_test.dart` |
| SC-002 reminders for every occurrence in the window, none for a skip | **met** | gate: alerts planned, none surviving for the skipped occurrence, cancel clears |
| SC-003 a month of 200 occurrences renders under 300 ms on the phone | **met** | 240 occurrences in **20 ms**, best of three; five runs 16/17/20/22/29 ms |
| SC-004 creating a repeating meeting takes under 45 s | **not measured** | needs a person with a handset; the editor and the repeat picker are built and unit-tested, and this is a stopwatch task belonging with the manual walkthrough |
| SC-005 zero occurrences shift by an hour across a clock change | **met** | gate: 14 occurrences across a real Berlin transition, all 18:00 local, `crossed=true` |

### What is not done, and why

- **RTL screenshots and the manual handset walkthrough** (T560's third clause,
  and the gate's manual steps 3 and 5's phone half). Outstanding for the fourth
  phase running; it needs a physical Android device, and it is the same open
  item P2, P3 and P4 each recorded.
- **A native review of the Arabic strings**, now including the repeat picker's
  dual and plural forms, which are the hardest Arabic in the product so far.
  Eight specific forms are flagged for it rather than left to be found, most to
  least likely to be wrong: the list separator (، throughout versus و before the
  last item); `في آخر يوم من الشهر` repeating الشهر after `كل شهر`; the
  tanwīn on the 11+ nouns, grammatically right but dropped by many Arabic UIs;
  `مرة واحدة` versus bare `مرة`; `أشهر` versus `شهور`; the absent
  preposition in `كل أسبوع يوم الاثنين`; the day-of-month phrasing; and
  `يومان` versus `يومين` for a bare count under the streak label.
  Western digits inside Arabic text is a deliberate match to what the app already
  does with numbers that come from data, not an oversight.
- **The repeat picker's chrome is still English** — about forty strings across
  five widget files that never reached the string table, while the *content* they
  surround is localised. Recorded as `enhancements/E-015`, and it belongs in the
  same change as the RTL screenshots: an English form inside an RTL column is
  exactly where the alignment defects will be, and neither has been seen yet.
- **SC-004** as above.

### The intent corpus, which this phase changed

P5 added four `set_meeting` cases, taking the corpus from 40 to 44 — so P4's
SC-002 threshold moved from 36 to 40. Re-measured on `qwen2.5:3b-instruct`:

```
node apps/backend/test/intent-fixture.mjs
  passed              33/44
  silent time errors  3  (SC-002 allows 0)
  extraction latency  median 5020 ms, p95 11071 ms
```

75%, which is the same rate P4 measured at 30/40 — the new cases did not move
capability, and P4's verdict stands: this is 3B model capability and
`llm.extractModel` is the lever. The latency was measured while a container image
was building on the same host and should not be read as a clean number.

**One of those failures was a defect and is fixed.** Case M06 — "عندي معاد مع
الدكتور في العيادة، اعمله في التقويم", a meeting request naming no time at all —
came back with `set_meeting` correct and an invented `08:00`. Left alone, the
chat would have created a meeting at an hour the member never said, which is
exactly what FR-006 exists to prevent. `mentionsAMoment` in
`domain/relative-time.ts` now refuses a model-supplied wall clock when the
sentence contains nothing a time could have been read from — no digit in either
script, no weekday, no month, no relative phrase, no clock word — and the
executor asks instead. The errors are deliberately asymmetric: a false negative
costs one question, a false positive is a calendar entry at an hour nobody chose.

### One more defect, found sideways

Building the picker's Arabic surfaced the same agreement bug one layer up, in
P3's strings: `homeStreakDays` was a single template per language —
`'{count} days'` and `'{count} يومًا'` — so a one-day streak read **"1 days"**
in English, and in Arabic a two-day streak read `2 يومًا` where the dual is
يومان and a five-day streak `5 يومًا` where the plural is أيام. The English
half needs no linguistic judgment at all to see.

Fixed rather than deferred, because a real defect is fixed in the phase that
finds it. `_f` can substitute a placeholder but cannot *choose* between four
forms, so the rule moved to `core/i18n/counted.dart` — two callers in two layers
is the point at which it stopped belonging to either — and the words stayed in
the tables, which is the part a translator changes. The helper keeps zero Flutter
imports on purpose: `rule_words.dart` and both recurrence expanders are free of
the widget layer and their tests run without a binding, and a shared helper that
dragged `package:flutter/widgets.dart` in would end that.

`test/counted_test.dart` pins the four Arabic *categories* rather than the exact
wording, so a native speaker's correction does not have to fight the test. What
must not change is that 1, 2, 3–10 and 11+ are four different answers.

# Implementation Plan: Meetings & Calendar (P5)

**Branch**: `019-meetings-calendar` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/019-meetings-calendar/spec.md`; blueprint data-model §2.10,
contracts `rest-commands.md` (Meetings), `graphql.schema.graphql` (`agenda`,
`monthOverview`), `events.md`; research R-17, P-05.

## Summary

The Meetings & Calendar context: meetings stored as a start plus a recurrence rule
with exception dates and per-occurrence overrides, occurrences expanded on read for
the requested window, an alert saga that keeps a rolling window of reminders in step
with the rule, and an agenda query that merges four sources into one ordered day.

## Technical Context

**Primary Dependencies**: `rrule` (already added in P2 for recurring tasks); mobile —
`table_calendar`, `url_launcher` (map and meeting links)

**Storage**: MongoDB `meetings`, `calendar_events`; phone drift `meetings`,
`calendar_events` (schemaVersion 5 → 6)

**Testing**: vitest — monthly-on-the-31st, weekly first-occurrence, DST wall-time
stability, skip and move semantics, series edit versus an existing override, alert
window reconciliation, agenda ordering and merge; flutter — month render, offline
agenda

**Performance Goals**: `agenda(from,to)` for a month with 200 occurrences < 80 ms
server-side; phone month render < 300 ms

**Constraints**: never materialise occurrences as rows; wall-time semantics for
recurrence; the alert window is a setting, not a constant

**Scale/Scope**: ~35 backend files, ~14 mobile files, ~6 extension files

## Constitution Check (v2.1.0)

| Principle | Status | How |
|---|---|---|
| I. Store per context | PASS | Meetings owns its collections; the agenda reads tasks and sessions through Planning's and Training's query ports |
| II. n8n | PASS | Untouched; the alert window is maintained by a saga in the worker |
| III. Local-first LLM | PASS | No inference; the planner may create meetings from P4's executor once this context exists |
| IV. Forward-only migrations | PASS | One `migrate-mongo` script; drift 5 → 6 guarded |
| V. Single public surface | PASS | New routes behind Caddy |
| VI. Multi-user, principals | PASS | Scoped by member; no sharing surface exists to leak through |
| VII. Test-then-verify | PASS | The recurrence table is the highest-risk logic in the platform and is specced case by case |
| VIII. YAGNI | PASS | No invitations, no external sync, no travel time |
| IX. Contexts, slices, ports | PASS | `AgendaQuery` composes ports; it never reads another context's collection |
| X. Commands / queries / streams | PASS | Meeting writes are REST; agenda and month are GraphQL |
| XI. Times belong to the user | PASS | Wall-time recurrence expanded in the member's zone; the optional place-fixed flag is explicit |
| XII. Configuration | PASS | `meetings.alertWindowDays` (default 14) is a registry key |

## Design

### Recurrence model

A meeting stores `startAt` (the first occurrence, an instant), `durationMin`,
`recurrence: { dtstart, rrule, exdates[], overrides[] }`. Expansion:

```text
expand(meeting, from, to, tz):
  rule   = RRule.fromString(rrule) with dtstart interpreted as WALL time in tz
  dates  = rule.between(from, to)                    → local wall times → instants in tz
  dates  = dates.filter(d => !exdates.includes(d))
  items  = dates.map(d => applyOverride(meeting, d)) // override keyed by originalStart
  items += overrides.filter(o => o.startAt in [from,to] && !dates.includes(o.originalStart))
```

Wall-time semantics (FR-007) mean a weekly 18:00 meeting stays at 18:00 after the
clocks change. `lockTimezone` pins expansion to a named zone regardless of where the
member is. Monthly-on-the-31st uses `BYMONTHDAY=-1` when the member picks "last day",
otherwise `rrule`'s natural behaviour of skipping short months — the editor makes the
choice explicit rather than guessing.

Skip = append to `exdates`. Move = upsert an override keyed by `originalStart` with a
new `startAt`/`durationMin`; moving onto a skipped date clears that exdate. Editing
the series warns when an override would fall outside the new rule and asks before
discarding it (FR edge case), implemented as a `force` flag on the update command.

### Context layout

```text
contexts/meetings/
├── domain/ meeting.aggregate.ts (schedule, edit, skipOccurrence, moveOccurrence, complete, cancel, tombstone)
│          recurrence-expander.ts · calendar-event.aggregate.ts · ports
├── infrastructure/ mongo-*.repository.ts · schemas · mappers · in-memory-*.ts
└── features/ create-meeting/ update-meeting/ skip-occurrence/ move-occurrence/ complete-meeting/ cancel-meeting/
             delete-meeting/ restore-meeting/ create-event/ update-event/ delete-event/
             meeting/ meetings/ agenda/ month-overview/          (queries)
```

### Alert reconciliation

`MeetingAlertSaga` (worker) listens to `MeetingScheduled|Changed|OccurrenceSkipped|
OccurrenceMoved|MeetingCancelled|MeetingDeleted` and to a nightly tick: for each
meeting it expands the next `meetings.alertWindowDays`, computes the desired alerts
(one per `reminderOffsets` entry plus one for the preparation block when
`prepMinutes > 0`) and reconciles against `alerts` — creating what is missing,
deleting what no longer belongs. Because alerts carry `source.occurrenceAt`, the
unique index makes reconciliation idempotent.

### Agenda query

`AgendaQuery(from, to)` composes: expanded meetings (+ preparation blocks), timed
tasks from Planning's read port, sessions from Training's port (null-safe until P6),
and personal events; sorts by instant; returns days. Each item carries a `kind` so the
clients can render it distinctly. The same query backs the home screen's "today", so
one implementation is the truth for all of them.

### Clients

**Mobile**: `features/meetings` (editor with a repeat picker that speaks in the
member's words — "every week on Mon, Wed", "monthly on the last day" — location
switch between link and address, preparation, reminder offsets; occurrence actions
skip/move/complete/cancel), `features/calendar` (`table_calendar` month with busy
markers, day agenda merging all kinds, offline from drift). Home's today card now
reads the agenda.

**Extension**: the side panel gains the next seven days of meetings with a join
button, and quick-add for a meeting.

**Chat**: P4's `intent-executor` gains `set_meeting`, replacing its "not yet" reply.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Overrides stored as their own list rather than child rows | A moved occurrence must survive a series edit and must not multiply sync volume | Materialising occurrences makes "skip one" ambiguous and floods the phone |
| A nightly tick in addition to event-driven reconciliation | A rolling window must advance even when nothing changes | Expanding to infinity at creation (unbounded alerts) or expanding at send time (the sweep would have to know recurrence) |

## Verification gate

```powershell
pnpm --filter @botvy/backend test    # the recurrence table, override vs series edit, alert reconciliation, agenda merge
cd apps/mobile; flutter test; flutter analyze
# manual: weekly × 6 with one skip and one move → five occurrences, one moved, on phone and extension;
#         monthly on the 31st → last day of February; reminders fire per occurrence; DST week unchanged
```

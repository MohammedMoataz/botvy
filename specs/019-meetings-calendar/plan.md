# Implementation Plan: Meetings & Calendar (P5)

**Branch**: `019-meetings-calendar` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/019-meetings-calendar/spec.md`; blueprint data-model §2.10,
contracts `rest-commands.md` (Meetings), `graphql.schema.graphql` (`agenda`,
`monthOverview`), `events.md`; research R-17, P-05.

## Summary

The Meetings & Calendar context: meetings stored as a start plus a recurrence rule
with exception dates and per-occurrence overrides, occurrences expanded on read for
the requested window, a meetings branch on Notifications' existing alert saga that
keeps a rolling window of reminders in step with the rule, and an agenda query that
merges four sources into one ordered day. The phone gets its own copy of the expander
so that day stays readable with the network off.

## Technical Context

**Primary Dependencies**: `rrule` (already added in P2 for recurring tasks); mobile —
`table_calendar`, `url_launcher` (map and meeting links), `rrule` (the Dart package of
the same name — the phone expands the rule itself so the calendar works offline)

**Storage**: MongoDB `meetings`, `calendar_events`; phone drift `meetings`,
`calendar_events` (schemaVersion 5 → 6)

**Testing**: vitest — monthly-on-the-31st, weekly first-occurrence, DST wall-time
stability, skip and move semantics, series edit versus an existing override, alert
window reconciliation, a time-zone change re-planning alerts, agenda ordering and
merge; flutter — the same recurrence table against the phone's expander, month render
with 200 occurrences, offline agenda. Every date in a fixture is derived from the
current clock (the next 31st, the next clock change after now), never written down.

**Performance Goals**: `agenda(from,to)` for a month with 200 occurrences < 80 ms
server-side; phone month render < 300 ms

**Constraints**: never materialise occurrences as rows; wall-time semantics for
recurrence; the alert window is a setting, not a constant

**Scale/Scope**: ~38 backend files, ~16 mobile files, ~6 extension files

## Constitution Check (v2.1.1)

| Principle | Status | How |
|---|---|---|
| I. Store per context | PASS | Meetings owns `meetings` and `calendar_events` and writes nothing else — in particular not `alerts`, which stay Notifications': its saga plans them from Meetings' events and one query port. The agenda reads tasks and sessions through Planning's and Training's query ports |
| II. n8n | PASS | One new workflow, `meeting_alerts_reconcile.json`, on a nightly schedule; it calls `POST /internal/notifications/reconcile-meeting-alerts` with the service token and holds no database node and no volume |
| III. Local-first LLM | PASS | No inference; the planner may create meetings from P4's executor once this context exists |
| IV. Forward-only migrations | PASS | One `migrate-mongo` script; drift 5 → 6 guarded |
| V. Single public surface | PASS | New routes behind Caddy |
| VI. Multi-user, principals | PASS | Scoped by member; no sharing surface exists to leak through |
| VII. Test-then-verify | PASS | The recurrence table is the highest-risk logic in the platform and is specced case by case, on the server and again on the phone; every fixture date is computed from the current clock, so the month-end and clock-change cases cannot rot |
| VIII. YAGNI | PASS | No invitations, no external sync, no travel time, no whole-day meetings |
| IX. Contexts, slices, ports | PASS | `AgendaQuery` composes named ports and Notifications' saga asks Meetings through `MeetingOccurrencesQuery`; no context reads another's collection |
| X. Commands / queries / streams | PASS | Meeting writes are REST; agenda and month are GraphQL; the nightly reconcile is a service-only internal endpoint |
| XI. Times belong to the user | PASS | Wall-time recurrence expanded in the member's zone; the optional place-fixed flag is explicit; `profile.ProfileUpdated` naming the time zone re-plans the member's alerts the same minute (FR-014) |
| XII. Configuration | PASS | `meetings.alertWindowDays` (default 14) is a registry key; the editor's default length is the `defaults.meetingDurationMin` preference seeded in P0 and the default warnings are `defaults.leadTimes` |

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

A personal event with a repeat stores the same `recurrence` object and goes through the
same expander (FR-011): a birthday that moves one year is an override, not a second
event. There is one recurrence implementation on the server, and the phone's is held to
its fixture table.

### Context layout

```text
contexts/meetings/
├── domain/ meeting.aggregate.ts (schedule, edit, skipOccurrence, moveOccurrence, complete, cancel, tombstone, restore, purge)
│          recurrence-expander.ts · calendar-event.aggregate.ts · ports
├── infrastructure/ mongo-*.repository.ts · schemas · mappers · in-memory-*.ts · meeting-sync.adapter.ts · calendar-event-sync.adapter.ts
└── features/ create-meeting/ update-meeting/ skip-occurrence/ move-occurrence/ complete-meeting/ cancel-meeting/
             delete-meeting/ restore-meeting/ purge-meeting/ purge-on-deleted/
             create-event/ update-event/ delete-event/ purge-event/
             meeting/ meetings/ meeting-occurrences/ agenda/ month-overview/          (queries)
```

Both collections reach the phone and the extension through P2's sync facade, so the
context registers `MeetingSyncAdapter` and `CalendarEventSyncAdapter` with the sync
registry: `pull` returns full rows including tombstones, `apply` handles
`create|update|delete|restore|purge`, rejections carry `entity: "meetings"` or
`"calendar_events"` so the client knows which table it is repairing, and
`purgeHorizonDays` reads `reminders.tombstoneDays` — the same horizon the whole
platform uses, so the full-snapshot rule stays one rule.

The blueprint's `meetings` document carries an `allDay` flag; this phase leaves it
unset and unread, because a whole-day entry is a personal event here (FR-001) and a
second way to say the same thing is one more branch in the expander for nothing.

### Alert reconciliation

`alerts` is Notifications' collection, and a context never writes another's store
(principle I), so this phase adds no saga of its own: it extends P2's
`AlertPlanningSaga`, which already reconciles alerts for tasks and reminders, with a
meetings branch. The saga (worker) gains `meetings.MeetingScheduled|MeetingChanged|
OccurrenceSkipped|OccurrenceMoved|MeetingCompleted|MeetingCancelled|MeetingDeleted` —
a completed meeting drops its alerts exactly as a cancelled one does — and asks
Meetings for the dates through one declared port, `MeetingOccurrencesQuery(userId,
from, to)`, which expands the rule with the same expander every read uses. For each
affected meeting the saga asks for the next `meetings.alertWindowDays`, computes the
desired alerts (one per `reminderOffsets` entry plus one for the preparation block when
`prepMinutes > 0`) and reconciles what it holds against that set — creating what is
missing, deleting what no longer belongs. Because alerts carry `source.occurrenceAt`,
the unique index makes reconciliation idempotent.

The saga also gains `profile.ProfileUpdated`, which carries `changed[]`. When that list
names the time zone it re-plans every meeting of that member, because an occurrence is a
wall time and all of its instants have just moved; a meeting marked `lockTimezone` is
expanded in its own zone and comes back unchanged, which is the whole point of the flag.
Without this branch a member who flies stays wrong until the nightly pass — the v1
three-hour bug again, a day long instead of permanent (FR-014).

The rolling window still has to advance on a day when nothing at all happens, so a
nightly pass re-runs the same reconciliation for every member. It is triggered the way
every unattended job here is (principle II):
`POST /internal/notifications/reconcile-meeting-alerts`, service-only, scope
`internal:tick`, stamping `ops_heartbeats['notifications.meeting-alerts']` so a pass
that stops arriving shows up in `/health` within fifteen minutes; one new nightly n8n
workflow calls it. It is its
own workflow rather than a branch of `rhythm_tick.json` because that tick fires every
five minutes and would need a claimed date to keep the pass from repeating — and the
endpoint sits under `/internal/notifications/` because that is the context that owns
both the slice and the rows it touches.

A meeting created without explicit offsets takes the member's `defaults.leadTimes`
(`'1h'`, `'0m'`) converted to minute offsets **at creation** and stored on the meeting,
so a later preference change never silently moves existing reminders.

### Agenda query

`AgendaQuery(from, to)` composes four sources and names each port it calls: expanded
meetings with their preparation blocks; timed tasks through Planning's
`TimedTasksInRangeQuery(userId, from, to)`, the range sibling of the single-day
`TasksDueQuery` P2 declares, because an agenda spans a month and asking day by day
would be thirty round trips; training sessions through `SessionsInRangeQuery(userId,
from, to)`, declared in `meetings.module.ts` here and bound to a null-safe stub that
P6 rebinds to Training's handler; and personal events, expanded by the same expander
when they repeat. It sorts by instant, groups by day and gives every item a `kind` so
the clients can render it distinctly.

`MonthOverviewQuery` counts the same items per day; a day is busy when it holds at
least one of them, of any kind (FR-009).

The extension's side panel and the web calendar read these queries. The phone does not:
its calendar and its today card are built from its own database so they work with the
network off (FR-010), which is why the phone carries a second copy of the expander.

### Clients

**Mobile**: `features/meetings` (editor with a repeat picker that speaks in the
member's words — "every week on Mon, Wed", "monthly on the last day" — location switch
between link and address, preparation, reminder offsets, a "keep this meeting on
<place>'s clock" toggle for `lockTimezone`, and the warning dialog before a series edit
discards a moved occurrence). Complete and cancel act on the meeting, so the editor
offers them there and not on a date: an occurrence of a series is skipped or moved, and
a one-off meeting is its own occurrence anyway (FR-013). `features/calendar` gives a
`table_calendar` month with busy markers, a week, and a day agenda merging every kind,
all read from drift and expanded locally. Home's today card reads that same local
agenda — a server query there would break FR-010 the first time the phone lost signal.

**Extension**: the side panel gains the next seven days of meetings with a join
button, and quick-add for a meeting.

**Chat**: P4's `intent-executor` gains `set_meeting`, replacing its "not yet" reply.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Overrides stored as their own list rather than child rows | A moved occurrence must survive a series edit and must not multiply sync volume | Materialising occurrences makes "skip one" ambiguous and floods the phone |
| A nightly tick in addition to event-driven reconciliation | A rolling window must advance even when nothing changes | Expanding to infinity at creation (unbounded alerts) or expanding at send time (the sweep would have to know recurrence) |
| A second recurrence expander, in Dart, on the phone | The offline calendar has to know where an occurrence falls with the network off (FR-010), and no server answer is available | Shipping expanded occurrences down the sync channel — which is exactly the materialisation FR-006 forbids, and floods a device with a long series. Both expanders are held to one fixture table, and a divergence fails the phone's tests |

## Verification gate

```powershell
pnpm --filter @botvy/backend test    # the recurrence table, override vs series edit, alert reconciliation, agenda merge
cd apps/mobile; flutter test; flutter analyze
# manual: weekly × 6 with one skip and one move → five occurrences, one moved, on phone and extension;
#         monthly on the 31st → last day of February; reminders fire per occurrence; DST week unchanged;
#         change the profile's time zone → the same meeting's warnings move with it, without waiting a day;
#         the evening proposal and the morning briefing both name the day's meetings
```

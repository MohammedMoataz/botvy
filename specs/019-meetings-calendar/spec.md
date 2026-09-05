# Feature Specification: Meetings, and one calendar for the day

**Feature Branch**: `019-meetings-calendar`

**Created**: 2026-09-05

**Status**: Draft (phase P5 of `specs/013-platform-v2-blueprint`)

**Input**: Blueprint P5 — "meetings with repeat rules and exceptions, online link or
address, preparation, reminder offsets; agenda and month views merging meetings,
timed tasks and training; home shows today."

## Why this feature exists

Tasks say what to do; meetings say where to be and with whom, and they repeat. A
member who keeps meetings elsewhere has to check two places, and the daily plan is
wrong by definition. This phase adds meetings with real recurrence — including the
part everyone gets wrong, changing one occurrence without damaging the series — and
the calendar that finally shows a day as it actually is: meetings, timed tasks and
training together.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Put a meeting in (Priority: P1)

A member creates a meeting with a name, a description, a start and a length, and says
where it is: an online link, or an address. They add preparation notes and how long
before they need to prepare, and one or more reminders.

**Independent Test**: create a meeting for tomorrow at 15:00, online, with reminders
a day and half an hour before → both arrive, and the notification opens the link.

**Acceptance Scenarios**:

1. **Given** an online meeting, **When** a reminder arrives, **Then** the link is one
   tap away.
2. **Given** an address instead, **When** the meeting is opened, **Then** the address
   is shown and can be opened in a map.
3. **Given** preparation of 15 minutes, **When** the day is viewed, **Then** a
   preparation block sits before the meeting.
4. **Given** no reminders chosen, **When** the meeting is saved, **Then** the member's
   default advance warnings are used.

---

### User Story 2 — Make it repeat, and bend it (Priority: P1)

A member sets a meeting to repeat daily, weekly on chosen days, or monthly, with an
end after a number of times or on a date. One occurrence can be skipped or moved
without touching the rest; the series can be edited as a whole.

**Independent Test**: a weekly meeting for six weeks → skip week three, move week
five by an hour → the calendar shows five occurrences, one at the new time, and the
rest unchanged.

**Acceptance Scenarios**:

1. **Given** a monthly meeting on the 31st, **When** February comes, **Then** it
   lands on the last day of February rather than disappearing or doubling.
2. **Given** one occurrence moved, **When** the series is later edited, **Then** the
   moved occurrence keeps its own time unless the member says otherwise.
3. **Given** a skipped occurrence, **When** reminders are due, **Then** none are sent
   for that date.
4. **Given** a repeating meeting cancelled entirely, **When** future dates arrive,
   **Then** nothing is shown or sent.

---

### User Story 3 — See the day, the week and the month (Priority: P1)

One calendar shows meetings, tasks that have a time, training sessions and personal
events together. A day view lists them in order with their preparation blocks; a
month view shows which days are busy; the home screen shows today.

**Acceptance Scenarios**:

1. **Given** a day with a meeting, two timed tasks and a training session, **When**
   the day is opened, **Then** all four appear in time order, each recognisable as
   what it is.
2. **Given** the phone is offline, **When** the calendar is opened, **Then** it shows
   from the device's own copy.
3. **Given** a month with three busy days, **When** the month is opened, **Then**
   those days are marked and tapping one opens that day.

---

### User Story 4 — Events that are not meetings (Priority: P3)

A member adds a personal event — a birthday, a holiday, a block of focus time — with
a title, a time or a whole day, a colour, and optionally a repeat.

**Acceptance Scenarios**:

1. **Given** an all-day event, **When** the day is viewed, **Then** it is shown apart
   from the timed items.

---

### User Story 5 — The rhythm knows about meetings (Priority: P2)

Tomorrow's proposal and today's briefing include the day's meetings alongside tasks
and training.

**Acceptance Scenarios**:

1. **Given** two meetings tomorrow, **When** the evening proposal arrives, **Then**
   it names them with their times.

### Edge Cases

- A weekly meeting created on a Sunday for "every Monday": the first occurrence is
  tomorrow, not eight days away.
- Daylight saving inside a repeating series: each occurrence keeps its local wall
  time, not a fixed offset.
- A member travels: a meeting that is fixed to a place keeps its local time there when
  they mark it so; otherwise it follows them.
- An occurrence moved onto a date that is already skipped: the move wins and the skip
  is cleared.
- A series edited so that an already-moved occurrence would fall outside the new rule:
  the member is warned before it is discarded.
- A meeting in the past: it can still be marked as completed or cancelled for the
  record.

## Requirements *(mandatory)*

- **FR-001** A meeting MUST hold a name, an optional description, a start, a length,
  and a location that is either an online link or an address.
- **FR-002** A meeting MUST support preparation notes and a preparation time, which
  MUST appear as its own block before the meeting.
- **FR-003** A meeting MUST support one or more advance reminders, defaulting to the
  member's own defaults.
- **FR-004** A meeting MUST support repeating daily, weekly on chosen days, or
  monthly, with an end after a count or on a date.
- **FR-005** A single occurrence MUST be skippable and movable without altering the
  series, and the series MUST remain editable as a whole.
- **FR-006** Occurrences MUST be derived from the rule rather than stored one by one,
  so a series of any length costs the same to keep.
- **FR-007** Each occurrence MUST keep its local wall time across daylight-saving
  changes; a meeting MAY be marked as fixed to a place, in which case it keeps that
  place's time when the member travels.
- **FR-008** Reminders MUST be produced for occurrences within a rolling window and
  MUST stop for skipped, moved-away, cancelled or deleted occurrences.
- **FR-009** A calendar MUST merge meetings, timed tasks, training sessions and
  personal events in day, week and month views, each recognisable.
- **FR-010** The calendar and today's list MUST be readable offline.
- **FR-011** Personal events MUST support a title, a time or a whole day, a colour and
  an optional repeat.
- **FR-012** The daily rhythm MUST include the day's meetings.
- **FR-013** A meeting MUST be completable or cancellable, and deletion MUST be
  undoable like everything else.

### Key Entities

**Meeting** (with its repeat rule, its skipped dates and its moved occurrences),
**Occurrence** (derived, not stored), **Personal event**, **Agenda item** (what the
calendar shows: a meeting, a preparation block, a timed task, a training session or an
event).

## Success Criteria *(mandatory)*

- **SC-001** A six-week weekly meeting with one skip and one move renders exactly five
  occurrences, one at the moved time, on phone and browser alike.
- **SC-002** Reminders arrive for 100% of occurrences in the rolling window and for
  none that were skipped or cancelled.
- **SC-003** A month view of 200 occurrences renders in under 300 ms on the phone.
- **SC-004** Creating a repeating meeting takes under 45 seconds.
- **SC-005** Zero occurrences shift by an hour across a daylight-saving boundary.

## Assumptions

- Meetings are personal: no invitations, no attendees, no availability sharing.
- Import and export of calendar files, and syncing with an outside calendar, are out
  of scope for this phase.
- Conferencing links are stored as given; they are not detected automatically from
  the description.
- The rolling window for producing reminders is an Owner setting, defaulting to two
  weeks.

## Out of scope

- Invitations, attendees, free/busy, scheduling links.
- Two-way sync with an external calendar; file import or export.
- Travel-time estimation between locations.

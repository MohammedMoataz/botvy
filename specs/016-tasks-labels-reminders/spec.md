# Feature Specification: What I have to do, and being told in time

**Feature Branch**: `016-tasks-labels-reminders`

**Created**: 2026-09-05

**Status**: Draft (phase P2 of `specs/013-platform-v2-blueprint`)

**Input**: Blueprint P2 — "tasks + coloured labels + Today view, reminders v2
(snooze), Notifications context (device-first + sweep), Sync v2 adapters, mobile
screens."

## Why this feature exists

This is the phase where Botvy becomes useful every day. It gives a member the list
of what they have to do, the labels to organise it, and the alarms that arrive on
time — including with no network, which is the property v1 was built around and the
one most easily lost. It also builds the two mechanisms every later phase leans on:
one place that schedules every alert (a task's due time, a meeting's reminder, the
evening prompt) and one round trip that reconciles the phone, the PC and the server.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Capture a task (Priority: P1)

A member writes a title, optionally picks a date and time, a priority from four
levels, and one label. The task appears immediately, even with no network, and is on
every other device shortly after.

**Independent Test**: create a task in airplane mode → it is listed at once → turn
the network on → it appears in the browser side panel within seconds, once.

**Acceptance Scenarios**:

1. **Given** a title only, **When** it is saved, **Then** a task exists with no date
   and the lowest priority, and it does not appear in Today.
2. **Given** a task due today at 17:00, **When** Today is opened, **Then** it is
   listed with its label colour and its priority mark.
3. **Given** the phone is offline, **When** the task is created and the member force
   quits the app, **Then** the task is still there on restart and is uploaded later.

---

### User Story 2 — Organise with labels (Priority: P1)

A member creates labels with a name and a colour, chosen from a palette or picked
freely. Tasks show their label; a label list shows how many open tasks each holds.
Renaming or recolouring a label updates every task that uses it.

**Acceptance Scenarios**:

1. **Given** a label renamed, **When** any list is opened, **Then** the new name
   shows everywhere without the member reopening each task.
2. **Given** a label deleted, **When** its tasks are viewed, **Then** they remain,
   without a label.
3. **Given** two labels with the same name, **When** the second is created,
   **Then** it is refused with a clear message.

---

### User Story 3 — Work the list (Priority: P1)

Today groups the day's tasks under a clear heading and separates them from
everything else. Upcoming shows the days ahead; Overdue shows what slipped;
Completed and Deleted keep their own views. A task can be completed, reopened,
cancelled, moved to another day, deleted with an undo, restored, or erased for good.

**Acceptance Scenarios**:

1. **Given** a completed task, **When** Today is opened, **Then** it is out of the
   active list and visible in Completed with the time it was finished.
2. **Given** a deleted task, **When** the undo offered with the message is used,
   **Then** it returns exactly as it was, including whether it had been completed.
3. **Given** a task moved from today to tomorrow, **When** it is viewed, **Then** it
   records that it was carried over, and how many times.

---

### User Story 4 — Repeat what repeats (Priority: P2)

A member marks a task as repeating: every day, every week on chosen days, every
month, or a custom rule; and chooses whether the next one is counted from the
schedule or from when they actually finished. An occurrence can be skipped without
ending the series.

**Acceptance Scenarios**:

1. **Given** a daily task counted from completion, **When** it is completed at
   20:00, **Then** the next is due tomorrow at 20:00.
2. **Given** the same task counted from the schedule, **When** it is completed late,
   **Then** the next keeps the original time.
3. **Given** a weekly task, **When** one occurrence is skipped, **Then** the series
   continues unchanged.

---

### User Story 5 — Be reminded, offline (Priority: P1)

A member sets a reminder for a moment, with one or more advance warnings. It rings on
the phone at that moment with no network, no server and no Google. It can be snoozed,
completed or cancelled from the notification. A reminder that was deleted keeps the
record of what became of it and can be restored.

**Independent Test**: set a reminder two minutes out, enable airplane mode, lock the
phone → it rings → snooze ten minutes → it rings again.

**Acceptance Scenarios**:

1. **Given** advance warnings of one hour and none, **When** the moment approaches,
   **Then** exactly one notification arrives at each.
2. **Given** the phone has been in touch with the server since the alarm was planned,
   **When** the server's fallback runs, **Then** it does not send a duplicate.
3. **Given** a phone that has been off for a day, **When** it comes back, **Then**
   alarms whose moment has passed are not fired retroactively, and the ones still
   ahead are scheduled.
4. **Given** a reminder created while offline, **When** it is created, **Then** its
   alarm is planned locally at once, before any sync.

---

### User Story 6 — Alerts for everything, from one place (Priority: P1)

A task with a time, a reminder, and later a meeting or a daily prompt all produce
alerts the same way, respect the member's quiet hours, and stop when their source is
completed, cancelled or deleted.

**Acceptance Scenarios**:

1. **Given** a task due at 09:00 and quiet hours until 08:00, **When** the alert is
   planned, **Then** it fires at 09:00 (outside the window) — and one planned at
   03:00 fires at 08:00 instead.
2. **Given** a task completed before its alert, **When** the moment arrives,
   **Then** nothing is sent.
3. **Given** no device has push configured, **When** the fallback runs, **Then** the
   alert is left unsent rather than marked delivered to nobody.

---

### User Story 7 — Everything agrees, everywhere (Priority: P1)

Changes made on the phone, in the browser panel or by the server converge without
duplicates or losses, offline edits included. When two devices edit the same thing,
one wins predictably and the other is shown the winning version rather than retrying
forever.

**Acceptance Scenarios**:

1. **Given** the same task edited on two devices while both are offline, **When**
   both reconnect, **Then** one edit wins, the other device shows the winner, and no
   duplicate task exists.
2. **Given** a task deleted on one device, **When** another device syncs, **Then**
   the task disappears there too.
3. **Given** a device that has been offline for longer than the deletion horizon,
   **When** it syncs, **Then** it receives a complete picture rather than a
   misleading partial one.

### Edge Cases

- A reminder set for a moment already past: refused with the reason, or planned for
  the next sensible moment if the member confirms.
- A task due at a time that does not exist locally (daylight saving spring forward):
  the alert lands at the first valid moment after it.
- Exact alarms not permitted by the phone: the member is told, and alarms degrade to
  approximate delivery rather than silently failing.
- More alarms scheduled than the phone allows: the nearest ones are kept and the rest
  are scheduled as they come into range.
- A refused change from the server: it is applied to the device, the member's edit is
  never silently discarded, and a poisoned row cannot block everything behind it.

## Requirements *(mandatory)*

### Functional Requirements

**Tasks and labels**
- **FR-001** A task MUST hold a title and MAY hold notes, a date and time (or a
  whole day), one of four priorities, one label, an estimated duration and a repeat rule.
- **FR-002** A label MUST hold a name and a colour, chosen from a palette or freely;
  names MUST be unique per member.
- **FR-003** Renaming or recolouring a label MUST be reflected wherever its tasks are shown.
- **FR-004** Views MUST include Today, Upcoming, Overdue, by label, Completed and Deleted.
- **FR-005** A task MUST be completable, reopenable, cancellable, movable to another
  day, deletable with undo, restorable, and permanently erasable once deleted.
- **FR-006** Deleting MUST NOT change what became of the task; the Deleted view MUST
  show the state it was in.
- **FR-007** Moving a task to a later day MUST record that it was carried over and
  how many times.
- **FR-008** A repeating task MUST support daily, weekly on chosen days, monthly and
  a custom rule, MUST record whether the next is counted from the schedule or from
  completion, and MUST allow skipping one occurrence.

**Reminders**
- **FR-009** A reminder MUST hold a title, a moment and one or more advance warnings,
  and MUST be snoozable, completable, cancellable, deletable with undo, restorable
  and erasable.
- **FR-010** Restoring MUST bring it back as it was; asking for it again MUST require
  a new moment.

**Alerts**
- **FR-011** Alerts MUST fire on the device with no network.
- **FR-012** The server MUST provide a fallback that delivers only to devices which
  have not been in touch since the alert was planned, MUST claim each alert before
  sending so two runs cannot both send it, and MUST leave an alert unsent when no
  device can receive it.
- **FR-013** Completing, cancelling or deleting a source MUST remove its unsent alerts.
- **FR-014** Quiet hours MUST hold back alerts the system generated; a moment the
  member chose explicitly MUST still fire.
- **FR-015** An alert whose moment has passed while the device was off MUST NOT fire
  retroactively.

**Sync**
- **FR-016** Tasks, labels and reminders MUST be created, edited and deleted offline
  and MUST converge on reconnection without duplicates.
- **FR-017** A conflicting change MUST resolve deterministically, and the losing
  device MUST be shown the winning version.
- **FR-018** Deletions MUST reach every device.
- **FR-019** A device that has been away longer than the deletion horizon MUST
  receive a complete set rather than a partial one.
- **FR-020** A change the server refuses MUST be visible to the member and retryable,
  and MUST NOT block other changes behind it.

### Key Entities

**Task**, **Label**, **Reminder**, **Alert** (a planned notification for any source),
**Sync cursor and outbox state** on each client.

## Success Criteria *(mandatory)*

- **SC-001** 100% of reminders fire in airplane mode within 60 seconds of their moment.
- **SC-002** Zero duplicate notifications across 50 alerts with a phone that synced
  after planning.
- **SC-003** A task created on the PC appears on the phone within 10 seconds in 95%
  of attempts, both online.
- **SC-004** Zero lost edits across 20 concurrent offline edit pairs; each loser is
  shown the winner.
- **SC-005** Today opens in under 300 ms on a phone holding 2,000 tasks.
- **SC-006** A member can find a deleted task and restore it in under 15 seconds.

## Assumptions

- One label per task (blueprint assumption).
- Sub-tasks are out of scope for this phase.
- Natural-language entry ("tomorrow 5pm") arrives with the chat phase; here dates are
  chosen with a picker.
- The deletion horizon is an Owner setting, shared by the server's clean-up and the
  sync's completeness rule — deliberately one value.

## Out of scope

- Sub-tasks, sections, task sharing, attachments.
- Time-boxing tasks onto the calendar (the estimate field is stored, not used yet).
- Natural-language capture (phase P4) and the daily ritual that consumes these tasks
  (phase P3).

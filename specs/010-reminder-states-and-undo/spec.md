# Feature Specification: Reminder States, and Undo

**Feature Branch**: `010-reminder-states-and-undo`

**Created**: 2026-09-01

**Status**: Implemented

**Input**: User description: "for the soft deleted reminders, we need to
distinguish between completed and canceled and dued reminders, and we can undo
the soft delete/soft achieve."

## Why this feature exists

Two things were wrong, and the first caused the second.

**Deleting a reminder overwrote its status.** `remove()` wrote
`{ deletedAt, status: 'cancelled' }` together, so the moment a reminder was
deleted it stopped being possible to tell whether it had been *completed*,
*cancelled*, or was still *waiting*. That is the exact distinction the request
asks for, and the delete was destroying it.

**There was nothing to undo with.** The device deleted its local row when the
tombstone arrived, so a deleted reminder was gone from the phone entirely. The
tombstone existed only to propagate the deletion to other devices, never to
offer the user a way back — despite the server keeping the row for 30 days.

A third gap came out of the same look: **"overdue" had no expression anywhere.**
A reminder whose moment has passed and that nobody finished is still `active`,
and the list said nothing about it.

## What was found while building it

| Assumption | What was actually true |
|---|---|
| Overdue should be a fourth status | No. A reminder becomes overdue because the clock moved, not because anyone wrote a row — storing it would need a job to do the writing, and that job would be the bug. It is derived from `status == active && remindAt < now`. |
| The local list already hides a reminder deleted offline | It did not. `watchReminders()` had no `pendingOp` filter, so deleting with no connection left the row visible until the sync landed, which looked like the delete had failed. Live since v0.2. |
| The obvious filter is `pendingOp != 'delete'` | In SQL that is NULL for a clean row, which is falsy — it would hide every reminder in the database. The same trap already documented for chats, met again in the same week. |
| A restored reminder just needs its tombstone lifted | Deleting drops its pending pings, so lifting the tombstone alone brings it back visible and **silent**. One that is still active and still ahead has to have them planned again. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - I can see what a reminder is (Priority: P1)

**Acceptance**: every reminder shows one of Upcoming, Overdue, Completed or
Cancelled. An active reminder whose time has passed reads as Overdue, in the
error colour, without anything having written to it.

### User Story 2 - Deleting does not erase what it was (Priority: P1)

**Acceptance**: deleting a completed reminder and then looking at Deleted still
says Completed. Same for Cancelled, and for one deleted while still waiting.

### User Story 3 - I can undo a delete (Priority: P1)

**Acceptance**: deleting shows an Undo action immediately. A Deleted view lists
what was removed with a Restore on every row. Restoring returns the reminder
with the status it had.

### User Story 4 - A restored reminder still rings (Priority: P1)

**Acceptance**: restoring one that is still ahead re-arms its alarms. Restoring
a completed or long-past one returns it silent.

### User Story 5 - All of it works offline (Priority: P1)

**Acceptance**: deleting with no connection removes it from the list at once and
puts it in Deleted. Restoring offline works the same way. Both reconcile on the
next sync.

## Requirements *(mandatory)*

- **FR-001** Deleting MUST NOT change the status. It is the only record of what
  the reminder was.
- **FR-002** Overdue MUST be derived, never stored.
- **FR-003** A deleted reminder MUST stay on the device until the gateway purges
  it, so there is something to restore. The purge horizon stays
  `reminders.tombstoneDays`; no second setting.
- **FR-004** Restoring MUST return the status the reminder had, and MUST re-plan
  its pings when — and only when — it can still ring.
- **FR-005** Restoring MUST work offline, which means expressing it in the sync
  push. An explicit `deleted: false` is the undo; omitting the field is an
  ordinary edit.
- **FR-006** An ordinary edit pushed for a tombstoned row MUST be reported as
  `gone`, not attempted: `update` treats a tombstone as not-found and would take
  the whole sync down with it.
- **FR-007** The active list MUST exclude both a confirmed tombstone and one
  deleted offline whose delete has not been pushed.
- **FR-008** A restore made on another device MUST bring the reminder back here.

## Assumptions

- A reminder deleted before it ever reached the gateway is erased outright
  rather than tombstoned. There is nothing on the server to restore, so keeping
  a local tombstone would offer an undo that could not work.
- The Deleted view is bounded by the server's own purge, so a user who never
  syncs keeps their deleted reminders indefinitely. That is the same trade the
  rest of the local store already makes.
- Restoring a reminder whose time has passed brings it back overdue and silent.
  Re-arming a ping for a moment in the past would fire immediately, which is
  worse than saying nothing.

## Out of scope

- A separate never-expiring archive alongside Deleted.
- Undo for anything else. Chats already have archive and delete; adding restore
  there is the same shape and can follow if it is wanted.
- Bulk restore, or emptying Deleted by hand. The sweep already bounds it.

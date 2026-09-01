# Feature Specification: A Coaching Track, and What to Do With a Deleted Reminder

**Feature Branch**: `011-coaching-track-and-reminder-actions`

**Created**: 2026-09-01

**Status**: Implemented

**Input**: User description: "the soft deleted reminders even removed/completed
we need when holding it to choose even to update it or reactivate it again, and
also for archived reminders beside the restore we need to add a new action to
delete it terminally and a button to clear all archived reminders. also, make
the coaching chat for coaching and program tracks only, so botvy can follow up
with the user via this chat and we need an option to clear that chat if it has
too much conversations."

## Why this feature exists

v0.5.0 made deleting a reminder reversible, with a single Restore that returns
it exactly as it was. Two things were missing from that: a completed or
cancelled reminder you want to *do again* needs to come back **active**, not
completed, and the undo list had no way out except waiting thirty days for the
sweep.

Separately, the coaching chat was only nominally a coaching chat. It was where
the nightly check-in and programme landed, but anything else typed there stayed
there, so the one thread meant to read as a record of someone's training filled
up with everything else — and there was no way to empty it, because it is also
the one chat that cannot be deleted.

## What was found while building it

| Assumption | What was actually true |
|---|---|
| Purging a reminder is a local delete plus an API call | The gateway still holds the tombstone, so a row deleted locally comes straight back on the next full snapshot. Purge has to travel through the outbox like every other mutation, and the row survives locally until the push lands. |
| Clearing a chat is just deleting its messages | Messages carry no tombstone and are pulled by `id > lastMessageId`, so a hard delete is invisible to a phone that already holds them. Clearing needs a watermark on the conversation, which rides the row's own cursor. |
| A new column on `conversations` is one `addColumn` | The v3 step *creates* that table, and `createTable` builds it from today's definition — already carrying the column. An unconditional `addColumn` at v5 fails with "duplicate column" for anyone upgrading from before v3. |
| A green `nest build` means it compiles | It was incremental and had not rechecked the file. A field had been added to the wrong DTO — the clean build in the container caught it, and only after two deploys had silently kept the old image. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Do that one again (Priority: P1)

**Acceptance**: holding a deleted reminder offers Restore, Reactivate, Restore
and edit, and Delete permanently. Reactivate brings a completed or cancelled
reminder back as upcoming and re-arms it; if its moment has passed it asks for
a new time first.

### User Story 2 - Empty the undo list (Priority: P1)

**Acceptance**: a deleted reminder can be erased for good without waiting for
the sweep, and one button clears the whole list. Neither touches a live
reminder, and neither can be used to skip the undo step.

### User Story 3 - The coaching chat is about coaching (Priority: P1)

**Acceptance**: something unrelated typed in the coaching chat is answered in a
new chat of its own, which the app then opens. Training, food, weight and sleep
stay, and are answered as a coach would.

### User Story 4 - Clear a chat that has grown too long (Priority: P1)

**Acceptance**: any chat can be emptied without being deleted, including the
coaching one. It empties on every device, and the chat itself remains.

## Requirements *(mandatory)*

- **FR-001** Reactivate MUST return the reminder as `active` whatever it was,
  and MUST re-arm it only when its moment is still ahead.
- **FR-002** Purge MUST be refused for a reminder that is not already a
  tombstone, so it can never skip the undo.
- **FR-003** Purge MUST travel through the sync push. A local delete alone is
  undone by the next full snapshot, which still carries the server's tombstone.
- **FR-004** A purge MUST be checked before the staleness rule: the row is a
  tombstone the user has already chosen to be rid of, and an edit made
  elsewhere does not make that choice stale.
- **FR-005** Clearing a chat MUST record a watermark on the conversation. A
  hard delete of messages is invisible to a device that already holds them.
- **FR-006** Clearing MUST be bounded by the newest message at the time, so one
  arriving mid-clear survives rather than being destroyed and dropped
  everywhere.
- **FR-007** Clearing MUST also drop local messages with no server id, or a
  message queued offline is left behind in a chat the user just emptied.
- **FR-008** Clearing MUST work on the coaching chat. It is the only way to
  empty the one chat that cannot be deleted.
- **FR-009** A message in the coaching chat whose intent is not `coaching` MUST
  be moved to a new chat **before it is stored**, and the client told which
  chat, so the track stays clean.
- **FR-010** A moved message MUST NOT carry the coaching history — that history
  is precisely what it is not about.
- **FR-011** An open check-in MUST still take precedence, whatever the intent
  classifier makes of the answer.
- **FR-012** A turn that stays in the coaching chat MUST use the coach's prompt.
- **FR-013** Nothing is ever moved out of an ordinary chat.
- **FR-014** A column added to a table that a migration *creates* MUST be added
  only for schema versions that predate the table's creation step.

## Assumptions

- "Thanks" typed in the coaching chat is not coaching, so it earns a new chat.
  A little surprising, and the price of a track that stays readable; the app
  says it moved.
- The move is applied when the turn finishes rather than mid-stream, so the
  reply is watched where it was typed and then found in its new home. Switching
  at the moment of the event would show an empty chat while tokens still
  arrived in the old one.
- Purging is inferred to have succeeded from having been pushed and not
  rejected. A hard-deleted row appears in no delta, so there is nothing else to
  observe.
- Clearing cannot be undone. The messages are gone on the server before any
  device is told.

## Out of scope

- Undo for clearing a chat, or a recycle bin for messages.
- Moving a message between chats by hand.
- A per-chat retention setting. The sweep bounds the deleted list; chats are
  cleared when the user says so.

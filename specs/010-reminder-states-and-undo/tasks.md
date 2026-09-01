# Tasks: Reminder States, and Undo

**Spec**: [spec.md](./spec.md) · **Status**: Implemented

## The bug underneath the request

- [x] **T001** `remove()` no longer writes `status: 'cancelled'` alongside the
      tombstone. That one field was destroying the distinction the whole feature
      is about, and made every restore a lie.
      *Evidence*: `reminders-service.spec.ts` — "keeps the status it had, so the
      deleted list can say which it was"; e2e step 2.

## Gateway

- [x] **T002** `restore()`: lifts the tombstone, keeps the status, and re-plans
      pings only for a reminder that is still active and still ahead. Without
      that last part it comes back visible and silent.
- [x] **T003** `listDeleted()` and `GET /reminders?deleted=true` — a list, not a
      status, because a reminder can be deleted from any of the three.
- [x] **T004** `POST /reminders/:id/restore`.
- [x] **T005** Sync: `deleted: false` is an undo. An ordinary edit for a
      tombstoned row is reported `gone` rather than attempted — `update` treats
      a tombstone as not-found and would fail the whole pass.
- [x] **T006** 13 new tests across `reminders-service.spec.ts` and
      `sync.spec.ts`.

## Mobile

- [x] **T007** drift v4: `deletedAt` on reminders. Null for every existing row
      is correct — anything still in the table was not deleted, because the old
      code erased the ones that were.
- [x] **T008** The tombstone is stored rather than erased, so the Deleted view
      has something to list.
- [x] **T009** `watchReminders()` excludes tombstones *and* an offline delete.
      The second half fixes a live bug: deleting with no connection left the row
      on screen until the sync landed.
- [x] **T010** The `pendingOp` filter is written as `isNull() | equals().not()`.
      `!=` is NULL for a clean row in SQL, which is falsy, and would hide every
      reminder — the same trap already documented for chats.
- [x] **T011** `Reminder.state()` derives Upcoming / Overdue / Completed /
      Cancelled. Overdue is the one with no stored counterpart.
- [x] **T012** `restore()` on the controller: local write, pings back if it can
      ring, `pendingOp = restore` for the push.
- [x] **T013** Active/Deleted segmented filter, state on every tile, Restore on
      every deleted row, and an Undo action on the snackbar for the tap the user
      has just regretted.
- [x] **T014** 21 new tests: `deleted_reminders_test.dart`, the state cases in
      `reminders_test.dart`, and the sync cases for tombstone-kept, restore
      pulled, and the explicit `false` on the push.

## Verification

- [x] **T015** Gateway 248 tests / 21 files; mobile 129 tests; analyzer clean.
- [x] **T016** End to end against the live stack, 7 checks: a completed reminder
      still reads Completed after deletion; the deleted list distinguishes all
      three; none of them appears in the ordinary list; restore returns the
      status *and* re-arms the alarms; restoring a completed one leaves it
      silent; undo over `/sync` with `deleted: false` is accepted.
- [x] **T017** The v0.3.0 sync suite and the v0.4.0 chat suite both re-run
      unchanged.

## Left undone, deliberately

- A never-expiring archive beside Deleted. The sweep's horizon bounds this list
  for free; a second one would need its own setting and its own screen.
- Restore for chats. Same shape, nobody has asked.
- On-device verification.

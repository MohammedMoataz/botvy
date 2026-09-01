# Tasks: A Coaching Track, and What to Do With a Deleted Reminder

**Spec**: [spec.md](./spec.md) · **Status**: Implemented

## Reminders — the other things to do with a deleted one

- [x] **T001** `reactivate()`: back as `active` whatever it was, re-armed only
      when its moment is still ahead. A ping planned for the past fires the
      instant it is written.
- [x] **T002** `purge()` and `purgeAllDeleted()`, both refused for a reminder
      that is not already a tombstone — purge is the second step of a deletion,
      never a way to skip the undo.
- [x] **T003** `POST /reminders/:id/reactivate`, `DELETE /reminders/:id/purge`,
      `DELETE /reminders/deleted/all`.
- [x] **T004** Purge rides the sync push as `purged: true`, checked *before* the
      staleness rule. A row deleted only locally is restored by the next full
      snapshot, which still carries the server's tombstone.
- [x] **T005** The device keeps the row, hidden from both lists, until the push
      lands; acceptance is inferred from having been pushed and not rejected,
      because a hard-deleted row appears in no delta.
- [x] **T006** Hold a deleted reminder for Restore / Reactivate / Restore and
      edit / Delete permanently, plus Clear all above the list. Reactivating one
      whose time has passed opens the editor first.

## The coaching chat becomes a track

- [x] **T007** A `coaching` intent, and the prompt guidance that puts training,
      food, weight, sleep and check-in answers there. One more enum value on a
      schema whose only required key is `intent`, so it costs nothing.
      *Evidence*: the intent fixture still passes 23/23 against the live model.
- [x] **T008** A message in the coaching chat whose intent is not `coaching` is
      moved to a new chat **before it is stored**, and a `moved` SSE event tells
      the client where it went. Storing first and moving after would leave it
      behind in the track.
- [x] **T009** A moved turn carries no history — the coaching history is exactly
      what it is not about.
- [x] **T010** `prompts/coaching.md`: a turn that stays gets the coach's prompt,
      not the general assistant's.
- [x] **T011** An open check-in still wins, whatever the classifier makes of
      "yes". Nothing is ever moved out of an ordinary chat.
- [x] **T012** The app switches to the new chat when the turn finishes, not when
      the event arrives — switching mid-stream would show an empty chat while
      tokens still landed in the old one.

## Clearing a chat

- [x] **T013** `clearedUpToMessageId` on the conversation. Messages carry no
      tombstone and are pulled by id, so a hard delete is invisible to a phone
      that already has them; the watermark rides the row's own cursor.
- [x] **T014** Bounded by the newest message at the time, so one arriving
      mid-clear survives instead of being destroyed and dropped everywhere.
- [x] **T015** Allowed on the coaching chat — the only way to empty the one
      chat that cannot be deleted.
- [x] **T016** The device also drops local messages with no server id, or an
      unsent one is left behind in a chat the user just emptied.
- [x] **T017** Clear on any chat, from the drawer's sheet, behind a confirm that
      says it cannot be undone.

## The migration trap this hit

- [x] **T018** The v5 column is added only `if (from >= 3 && from < 5)`. The v3
      step *creates* the conversations table, and `createTable` builds it from
      today's definition — already carrying the column — so an unconditional
      `addColumn` fails with "duplicate column" for every upgrade from before
      v3. Found by the existing v1 and v2 fixtures failing.
      *Evidence*: new `migration_v5_test.dart` takes the other branch.

## Verification

- [x] **T019** Gateway 267 tests / 21 files; mobile 144 tests; analyzer clean.
- [x] **T020** End to end against the live stack, 8 checks: off-topic in
      coaching is moved and the coaching chat left empty; training talk stays;
      clearing empties it, records a watermark and keeps the chat; a deleted
      completed reminder reactivates armed; purge erases; purge is refused for a
      live reminder; clear all empties the list without touching live ones.
- [x] **T021** The v0.3.0, v0.4.0 and v0.5.0 e2e suites all re-run unchanged.

## What went wrong on the way, worth remembering

- **Two deploys silently kept the old image.** `docker compose build` was
  failing at `nest build` while only its last line was being read, and
  `up -d --force-recreate` then cheerfully restarted the previous image. The
  e2e caught it only because the feature visibly did nothing. Check that the
  built code is *in the container* — `grep` the compiled file — not that a
  build command printed something.
- **`nest build` was incremental and had not rechecked the file.** A field added
  to the wrong DTO compiled locally and failed in the container's clean build.
  A clean `rm -rf dist` build is the one that means anything.

## Left undone, deliberately

- Undo for clearing a chat. The messages are gone on the server before any
  device hears about it.
- A per-chat retention setting.
- On-device verification.

# Tasks: Named Chats

**Spec**: [spec.md](./spec.md) · **Status**: Implemented

## Gateway — the entity

- [x] **T001** `Conversation`, copied field-for-field from `Reminder`: the
      proven two-way-sync shape. Plus `title`, `pinned`, `archived`, and the
      reserved `clientId = 'coaching'` that makes the system chat exactly one
      per user by database constraint rather than by app code.
- [x] **T002** `Message.conversationId`, **NOT NULL**, `onDelete: Cascade`, and
      `@@index([conversationId, id(sort: Desc)])` — that index is the history
      query. NOT NULL is the guard: six call sites create messages.
- [x] **T003** Migration `20260901130000_add_conversations`: nullable column,
      one thread per user who had ever spoken, `SET NOT NULL`, then the indexes
      and the cascade.
      *Evidence*: `messages WHERE conversation_id IS NULL` → 0; users with two
      coaching rows → 0.

## Gateway — behaviour

- [x] **T004** `ConversationsService`. Its own module: `NightlyService` needs it
      and `ChatModule` already imports `CoachingModule`, so putting it in
      `ChatService` would be a cycle. 15 tests.
- [x] **T005** `history()` takes a conversation. It is the only history reader,
      so this one parameter is what stops chats leaking into each other.
- [x] **T006** The check-in gate is conditional on the coaching chat.
      *Evidence*: `chat-conversation.spec.ts` — "does not record a check-in from
      another conversation", plus e2e step 4, where the exact sentence "does
      this need rest time?" leaves the check-in open.
- [x] **T007** The nightly cycle writes the question and the program into the
      coaching chat, and puts the chat id in the FCM payload. `program.text` was
      truncated to 240 characters for a push and then discarded.
- [x] **T008** `batchReply` groups by conversation and answers each one. A
      single combined reply necessarily landed in the wrong chat for all but one.
- [x] **T009** `BatchResult.accepted` — the client ids actually stored. The
      device used to mark its whole outbox synced on any success.
- [x] **T010** Resolve happens in the controller, before the Observable opens: a
      `NotFoundException` inside the stream surfaces as "The assistant is
      unavailable right now", which is a lie the client cannot act on.

## Gateway — sync

- [x] **T011** `PushedConversationDto` in the shape of `PushedReminderDto`, so
      `clientWins` resolves both with one rule.
- [x] **T012** `applyConversation`: unknown id creates, tombstoned id is `gone`,
      coaching delete is `protected` (not `stale` — that would make the phone
      retry for ever).
- [x] **T013** Conversations are pulled *after* messages, outside the
      `Promise.all`. The foreign key then guarantees no message arrives naming a
      chat the response does not carry.
      *Evidence*: an `invocationCallOrder` assertion in `sync.spec.ts`.
- [x] **T014** `moreMessages`, so the client loops without hardcoding the page
      size.
- [x] **T015** `RejectedPush.entity`. Without it the device writes a rejected
      chat through the reminder path — corruption, not a crash.
- [x] **T016** The sweep purges chat tombstones on the reminder horizon. One
      horizon on purpose: the cursor fallback reads that key.
- [x] **T017** `coaching.conversationTitle` setting, per language.

## Mobile

- [x] **T018** drift v3: `Conversations`, a nullable `conversationId`, and an
      `onUpgrade` that **deletes nothing**.
      *Evidence*: `migration_v3_test.dart` — "does NOT delete the cached
      history", which is the test that stops the obvious wrong fix.
- [x] **T019** `hasLegacyMessages()` / `deleteLegacyMessages()`: the predicate is
      the data, so there is no flag to clear. The sweep runs inside the apply
      transaction, before the first page lands, and clears the whole set — which
      is what makes the re-pull terminate.
- [x] **T020** `highestMessageId()` as a real SQL aggregate. It used to load
      every message into Dart, which the paging loop would have made quadratic.
- [x] **T021** `upsertServerMessage` writes the chat on the match-by-clientId
      path too. Missing that line would leave every message this device ever
      composed offline orphaned for ever.
- [x] **T022** The paging loop: later pages push nothing and carry `since`. A
      null `since` would make each page a full snapshot and run the delete sweep
      once per page.
- [x] **T023** A message naming an unknown chat breaks the loop rather than
      being dropped; the derived watermark stays behind and the next sync
      retries.
- [x] **T024** The coaching chat shows messages with no chat, so a history
      cached before the upgrade never leaves the screen.
- [x] **T025** Outbox chunked at 20, and only acknowledged ids cleared. Past 20
      queued, every flush used to 400, be swallowed as "offline", and stall for
      ever.
- [x] **T026** Drawer on the root Scaffold — one property, and Flutter supplies
      the hamburger, the edge swipe and back-dismissal, so no route is added.
      Rename via `showDialog`, the rest via `showModalBottomSheet`, matching
      `reminders_screen.dart`.
- [x] **T027** `ChatController` becomes a family keyed by chat id, so switching
      disposes the old SSE subscription through the existing `onDispose`.
      `ref.keepAlive()` while a reply streams.
- [x] **T028** Titles derived from the first message. Nothing is written, so
      nothing can lose a rename to the clock.
- [x] **T029** `wipe()` clears conversations; a notification tap opens the
      coaching chat.

## The bug that was already live

- [x] **T030** `classifyCheckin` tokenises non-Latin text instead of substring
      matching. `'ما'` is inside `'تمام'` — an affirmative — and negation wins,
      so an Arabic user answering "fine, done" was logged as having missed the
      day. Shipped broken since coaching.
      *Evidence*: `checkin-classifier.spec.ts` — "تمام" is adhered.

## Verification

- [x] **T031** Gateway 237 tests / 21 files; mobile 112 tests; analyzer and lint
      clean.
- [x] **T032** End to end against the live stack, 7 checks: two chats created by
      id with no round trip; history scoped per chat; **"does this need rest
      time?" in the wrong chat records nothing and leaves the check-in open**; a
      delete taking its messages and arriving as a tombstone; an unnamed message
      landing in coaching; the coaching chat refusing deletion with
      `reason: protected`.
- [x] **T033** The v0.3.0 sync end-to-end still passes unchanged — 9 checks.

## Left undone, deliberately

- `ChatController` still takes two snapshots rather than subscribing. The family
  makes switching correct; converting to a live stream has to solve the
  optimistic bubbles that are deliberately never written to SQLite, and that is
  its own change with its own risk.
- No widget tests. The repo has none, and this is not the change to stand up a
  `pumpWidget` harness in.
- On-device verification of the upgrade and of airplane-mode editing.

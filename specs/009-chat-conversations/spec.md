# Feature Specification: Named Chats

**Feature Branch**: `009-chat-conversations`

**Created**: 2026-09-01

**Status**: Implemented

**Input**: User description: "we need to have a chat management, so the user can
create chats within botvy and rename each one as he like, like the chatGPT and
claude ai. so the user can create a specific chat/session specific for one
thing and give it a name."

## Why this feature exists

Botvy had exactly one conversation per user: every message anyone had ever sent
was a single flat list ordered by `composedAt`, on the phone and in Postgres
alike. Three properties of that shape made this more than a UI change.

- **The prompt window was global.** `chat.service.ts:159` scoped history to the
  *user*, and it was the only history reader. A question in a new chat would be
  answered from the tail of an unrelated one, and the intent classifier saw the
  same window — so "cancel that one" could cancel a reminder discussed
  somewhere else entirely.
- **The nightly check-in swallowed any message.** While `awaitingCheckin` was
  true, *any* incoming message was classified as the answer, before intent
  classification and before history.
- **Messages are immutable and pull by autoincrement id.** There is no
  `updatedAt`, no `deletedAt`, and no delete path in the gateway. A server-side
  backfill of `conversation_id` can never reach a device that already holds the
  rows.

## What was found while building it

| Assumption | What was actually true |
|---|---|
| The server auto-titles a chat from the first message | That write bumps `updatedAt`. A rename seconds later carries a `baseUpdatedAt` from before it, falls through to the clock comparison, and — with the Docker clock running ~6s ahead of the host — loses. The user watches their typed name revert. Titles are now **derived on the device** and the server writes none. |
| Delete the cached messages in the drift migration and re-pull | Right idea, wrong moment: a phone that upgrades with no signal would open to an empty app. Nothing forces the delete to happen at migration time — the sweep runs later, inside the transaction that writes the replacements. |
| The check-in gate just needs a conversation condition | It needed one, but the blast radius was worse than expected: `rest`, `not` and `did` are all whole-word matches, so "does this recipe need rest time?" typed at 22:00 recorded a missed day and answered with coaching copy. |
| Arabic replies were handled | `classifyCheckin` fell back to bare substring matching for non-Latin scripts, and `'ما'` sits inside `'تمام'` — an *affirmative*. Negation wins, so a user answering "fine, done" was logged as having **missed** their day. Live since coaching shipped. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A chat per topic (Priority: P1)

**Acceptance**: the drawer lists every chat, "New chat" starts one, and the
first message names it. Renaming sticks. Pinning moves it to the top, archiving
hides it, deleting removes it and everything said in it.

### User Story 2 - Chats do not leak into each other (Priority: P1)

**Acceptance**: a question in one chat is answered from that chat's history
only. A reminder discussed in one cannot be cancelled by a follow-up in another.

### User Story 3 - The evening check-in has a home (Priority: P1)

**Acceptance**: the check-in question and the day's program appear as messages
in a fixed Coaching chat. Answering there records the day; the same words typed
in another chat are an ordinary turn and leave the check-in open.

### User Story 4 - Everything still works offline (Priority: P1)

**Acceptance**: with no connection, a chat can be created, renamed, pinned,
archived and deleted, and a message can be sent to a chat the gateway has never
heard of. All of it reconciles on the next sync.

### User Story 5 - Upgrading keeps the history (Priority: P1)

**Acceptance**: installing over v0.3.0 with no network still shows the whole
previous history, under Coaching. On reconnect it redistributes into its chats.
Anything queued unsent is still queued and still sends.

## Requirements *(mandatory)*

- **FR-001** Prompt history MUST be scoped to one conversation. The parameter
  MUST be required at the call site rather than defaulting to global.
- **FR-002** The check-in short-circuit MUST fire only in the coaching chat. A
  reply elsewhere MUST leave the check-in open rather than recording a guess.
- **FR-003** There MUST be exactly one coaching conversation per user, enforced
  by the database, and it MUST refuse to be deleted or archived. Rename and pin
  are allowed.
- **FR-004** The nightly cycle MUST write the check-in question and the program
  into that chat. The program text was previously truncated to 240 characters
  for a push and then discarded.
- **FR-005** The phone MUST mint the conversation id and the gateway MUST take
  it verbatim, so a message can name its chat before any sync has run.
- **FR-006** An id the server has never seen MUST be created, not rejected. An
  id belonging to another account MUST be reported as not-found, never adopted.
- **FR-007** `Message.conversationId` MUST be NOT NULL, so a missed write is a
  compile error rather than a row no device can file.
- **FR-008** A conversation MUST be soft-deleted with a tombstone, purged by the
  sweep on the **same** horizon as reminders. A second horizon MUST NOT exist:
  the cursor fallback reads that one key.
- **FR-009** Deleting a conversation MUST delete its messages, and a device
  receiving the tombstone MUST cascade locally. Message tombstones MUST NOT be
  introduced — mutability would invalidate the id cursor.
- **FR-010** Every rejection MUST name its table, and the device MUST branch on
  it. Writing a rejected conversation through the reminder path corrupts
  silently.
- **FR-011** Titles MUST NOT be written by the server. An empty title means
  unnamed, and the client renders the first user message.
- **FR-012** The drift migration MUST NOT delete cached messages. A synced row
  with no conversation is the signal that the cache predates chats; it is swept
  inside the transaction that writes its replacement.
- **FR-013** The coaching chat MUST also display messages with no conversation,
  so nothing disappears from the screen during the upgrade.
- **FR-014** `/sync` MUST report whether more messages remain, and the client
  MUST loop. Later pages MUST push nothing and MUST carry `since`.
- **FR-015** A message naming an unknown conversation MUST NOT be applied, and
  the watermark MUST NOT advance past it. The server's `lastMessageId` MUST NOT
  be persisted — the derived watermark is what makes this self-healing.
- **FR-016** `conversationId` MUST be optional on `/chat` and `/chat/batch`, so
  a device on the previous release keeps working; its messages go to coaching.
- **FR-017** The offline outbox MUST be sent in chunks the batch endpoint
  accepts, and only the client ids the server names MUST be cleared.
- **FR-018** `wipe()` MUST clear conversations. A chat's title is written from
  the previous account's own words.

## Assumptions

- A batch spanning several chats costs one model call per chat rather than one
  per batch. Quota is checked once before any of them, so a multi-chat flush can
  overshoot the daily limit by a turn or two — the same soft gate that already
  lets a single long turn overshoot.
- A chat deleted while a flush for it is in flight leaves one stray message on
  the server. The next full snapshot does not list the chat, so the device
  removes any trace. Not worth a lock.
- The message id cursor's commit-ordering ceiling (recorded in spec 008) is
  unchanged in likelihood. Its damage is now more visible — a skipped message
  can be the only one in a short chat — which is why the unknown-conversation
  break and the paging loop exist.

## Out of scope

- Per-conversation sync cursors, and chat paging.
- Message tombstones, and moving a message between chats.
- A `/conversations` REST controller. Every action is a field value, and an
  online-only mutation path is dead code in an offline-first app.
- LLM-generated titles.
- Unread counts, folders, cross-chat search, per-chat model settings, branching,
  export, swipe-to-archive.
- `drift_schemas/` codegen. Three migrations do not justify build-runner schema
  dumps; the hand-written fixtures are the guard.

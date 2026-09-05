# Feature Specification: A coach who knows me, a planner who does things

**Feature Branch**: `018-coach-chat`

**Created**: 2026-09-05

**Status**: Draft (phase P4 of `specs/013-platform-v2-blueprint`)

**Input**: Blueprint P4 — "streaming chat, pinned Coach + Planner chats, quick
questions, intent → task/reminder/meeting/profile commands, coach context, offline
batch."

## Why this feature exists

Everything before this phase is a well-organised list. This is where Botvy answers.
Two conversations exist from the day a member joins: a **Coach** who knows their body,
their training, their streak and today's plan, and a **Planner** who turns sentences
into tasks and reminders without a form. Both run on the member's own machine, so
what is said stays there.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Ask the coach (Priority: P1)

A member opens the Coach chat, taps a suggested question or writes their own, and
watches the answer arrive as it is written. The answer uses what Botvy knows: weight,
height, goal, allergies, training days, streak, today's plan.

**Independent Test**: record a weight → ask for a daily protein target → the answer
uses that weight, not a generic figure.

**Acceptance Scenarios**:

1. **Given** a member with a declared allergy, **When** they ask for meal ideas,
   **Then** no suggestion contains that food — ever, in any wording.
2. **Given** a long answer being written, **When** the member taps stop, **Then**
   writing halts within a second and what arrived is kept.
3. **Given** a member on a nine-day streak, **When** they ask how they are doing,
   **Then** the answer reflects the streak rather than inventing one.
4. **Given** no body facts recorded, **When** the member asks something that would
   use them, **Then** the coach asks for the missing fact instead of guessing or
   saying "unknown".
5. **Given** the member writes \"I weigh 80 kg\" or \"I'm allergic to peanuts\",
   **When** the coach replies, **Then** it confirms in one line and the fact is on
   the profile, without a form.

---

### User Story 2 — Tell the planner what to do (Priority: P1)

A member writes "remind me to call Dad in two hours", "add buy milk tomorrow, high
priority, label errands", or "what's on today?" — and it happens, with a short
confirmation of exactly what was created.

**Independent Test**: send each sentence → the reminder, task and list appear with the
right values in the member's time zone.

**Acceptance Scenarios**:

1. **Given** "in two hours" typed at 14:10, **When** it is understood, **Then** the
   reminder is set for 16:10 in the member's time zone, not the server's.
2. **Given** a request with no time ("remind me to call the dentist"), **When** it is
   understood, **Then** Botvy asks for the time rather than inventing one.
3. **Given** a created task, **When** the confirmation is shown, **Then** it states
   the title, date, time and priority that were actually stored.
4. **Given** "cancel my 5pm reminder", **When** exactly one matches, **Then** it is
   cancelled and confirmed; when several match, Botvy asks which.
5. **Given** a message typed while offline, **When** the network returns, **Then**
   it is sent, understood as of when it was typed, and answered in the same chat.
6. **Given** \"what's on today?\", **When** it is answered, **Then** the tasks come
   back as a tappable list — each opens or completes the task — not as a paragraph.

---

### User Story 3 — Two pinned chats, and room for others (Priority: P1)

Coach and Planner sit at the top in their own section and cannot be deleted, only
cleared. A member can start other chats for anything else. A message that clearly does
not belong in Coach or Planner is moved to a new chat of its own, and the member is
told.

**Acceptance Scenarios**:

1. **Given** the Coach chat, **When** the member tries to delete it, **Then** it is
   refused with an explanation and clearing is offered instead.
2. **Given** a cleared chat, **When** it is opened on another device, **Then** it is
   cleared there too, and nothing that was cleared comes back.
3. **Given** an unrelated question typed in Coach, **When** it is answered, **Then**
   it appears in a new chat with a fitting title, and Coach is not polluted.

---

### User Story 4 — Suggested questions that fit the moment (Priority: P2)

Each chat offers a few tappable questions. They change with the member's state: after
a low mood the Coach offers gentler options; the Planner offers what is useful now.
A member can add their own.

**Acceptance Scenarios**:

1. **Given** the last check-in reported a low mood, **When** Coach is opened, **Then**
   the suggestions include a lighter-day option.
2. **Given** a member's own suggestion, **When** it is added, **Then** it appears for
   them only.

---

### User Story 5 — Answer the evening check-in in the chat (Priority: P1)

When the evening question has been asked, the member's reply in the Coach chat is
understood as the answer — and only there, and only for a while.

**Acceptance Scenarios**:

1. **Given** the question was asked an hour ago, **When** the member replies "yes,
   did everything", **Then** the day is recorded and the streak updates.
2. **Given** the same words in an unrelated chat, **When** they are sent, **Then**
   nothing is recorded.
3. **Given** a reply that is not clearly yes or no, **When** it is sent, **Then** it
   is treated as an ordinary message and the question stays open.

---

### User Story 6 — It keeps working when the model does not (Priority: P2)

If the local model is slow, busy or down, the member is told plainly, their message is
not lost, and everything that is not chat keeps working.

**Acceptance Scenarios**:

1. **Given** the model is unavailable, **When** a message is sent, **Then** the member
   sees a clear message, their text is kept, and reminders and plans are unaffected.
2. **Given** two members chatting at once, **When** both send, **Then** both get
   answers without one waiting for the other to finish entirely.
3. **Given** a member who has used their daily allowance, **When** they send another
   message, **Then** they are told what the limit is and when it resets.

### Edge Cases

- A message arrives while the member is on another device: both see it.
- A very long answer: it streams, and the connection is kept alive so nothing appears
  frozen.
- The member closes the app mid-answer: the answer is finished and stored, and is
  there when they return.
- A request that would create something in a context that does not exist yet (a
  meeting before that feature lands): Botvy says it cannot do that yet.
- A model that returns something that is not a valid instruction: it is treated as an
  ordinary conversation rather than executing something wrong.
- Words that look like an instruction inside a quoted message or a pasted article: the
  quoted text is not executed.

## Requirements *(mandatory)*

- **FR-001** Every member MUST have a Coach and a Planner conversation from
  registration; both MUST be shown apart from other chats, MUST be clearable, and MUST
  NOT be deletable.
- **FR-002** Answers MUST arrive progressively as they are written and MUST be
  stoppable by the member, keeping what arrived.
- **FR-003** The Coach's answers MUST use the member's profile, allergies, training,
  streak and today's plan; an allergy MUST be treated as a prohibition; an unrecorded
  fact MUST be asked for rather than filled in.
- **FR-004** The Planner MUST create, list, change and cancel tasks and reminders (and
  meetings once they exist) from ordinary sentences, MUST compute times in the
  member's time zone, and MUST confirm exactly what it did.
- **FR-005** Relative times MUST be resolved by the system, not by the model.
- **FR-006** A request missing something required MUST be asked about, never guessed.
- **FR-007** Messages composed offline MUST be delivered later and understood as of
  when they were typed.
- **FR-008** A message that does not belong in a pinned chat MUST be moved to its own
  chat before it is answered, and the member MUST be told.
- **FR-009** A reply MUST count as the evening check-in only inside the Coach chat and
  only within the allowed window.
- **FR-010** Suggested questions MUST be offered per chat, MUST adapt to the member's
  latest check-in, and MUST be extendable by the member.
- **FR-011** Clearing a chat MUST take effect on every device and MUST NOT be
  reversible.
- **FR-012** When the model is unavailable the member MUST be told plainly, their
  message MUST be kept, and no other feature MUST be affected.
- **FR-013** A daily allowance MUST be enforceable per member, with a clear message
  when it is reached.
- **FR-014** Text inside a quoted message or a fetched document MUST never be executed
  as an instruction.
- **FR-015** A fact the member states in the Coach chat (weight, height, goal, foods,
  allergies; later meals and training days) MUST be recorded on their profile after
  a one-line confirmation, so nothing is re-entered in a form.
- **FR-016** A list answer (today's tasks, reminders, meetings, the plan) MUST be
  delivered as a structured, tappable list in addition to any words.

### Key Entities

**Conversation** (pinned or ordinary, with a clear point), **Message** (immutable,
ordered), **Suggested question**, **Understood intent** (what the member asked for and
what was done about it), **Card** (a structured list answer the client renders).

## Success Criteria *(mandatory)*

- **SC-001** The first words of an answer appear within 5 seconds on the reference
  machine; stop takes effect within 1 second.
- **SC-002** Across a fixed set of 40 planner sentences (English and Arabic), at least
  36 produce the correct item with the correct time; none produce a wrong time
  silently.
- **SC-003** Zero coach answers contain a declared allergen across the test corpus.
- **SC-004** Zero check-ins recorded from outside the Coach chat.
- **SC-005** A message typed offline is answered within 30 seconds of reconnection.
- **SC-006** With the model stopped, every non-chat feature still passes its checks.

## Assumptions

- One reply per conversation when a batch of offline messages is flushed.
- The model is the one configured by the Owner; quality varies with it, and the
  measurable criteria above are stated for the reference machine's model.
- Suggested questions are seeded by the Owner and extended by members; no editing of
  other people's.
- Web search inside chat is not part of this phase.

## Out of scope

- Web search and image results in chat.
- Voice input and output.
- Multi-turn tool loops (the planner executes one understood instruction per message).
- Sharing a conversation with anyone.

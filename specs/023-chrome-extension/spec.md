# Feature Specification: Botvy at the desk

**Feature Branch**: `023-chrome-extension`

**Created**: 2026-09-05

**Status**: Draft (phase P9 of `specs/013-platform-v2-blueprint`)

**Input**: Blueprint P9 — "side panel tasks and meetings, quick capture, socket nudge
and sync on open, offline cache."

## Why this feature exists

The member's day is planned on the phone but spent at a computer. Reaching for a
phone to add "reply to that email" or to check when the next call is breaks the work
they were doing. This phase puts today's tasks and the next meetings beside the
browser, lets them capture what they are reading in one action, and keeps both sides
in step within seconds.

It is a companion, not a second app: everything it does exists on the phone, and
nothing lives only here.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Today, beside my work (Priority: P1)

The member opens a panel next to the page they are on and sees today's tasks and the
next meetings. They tick a task off and it is done everywhere.

**Independent Test**: complete a task in the panel → the phone shows it completed
within ten seconds.

**Acceptance Scenarios**:

1. **Given** the panel closed and reopened, **When** it opens, **Then** it shows what
   is current, not what it last remembered.
2. **Given** a task completed in the panel, **When** the member changes their mind,
   **Then** an undo restores it as it was.
3. **Given** a meeting with a link starting soon, **When** it is shown, **Then**
   joining is one click.
4. **Given** the panel open all day, **When** something changes on the phone, **Then**
   the panel reflects it without the member reloading anything.

---

### User Story 2 — Capture what I am looking at (Priority: P1)

Reading something worth acting on, the member selects text or uses the page itself and
turns it into a task, a reminder or a saved link, with the page recorded so they can
get back to it.

**Independent Test**: select a sentence on a page → right-click → add as task → the
task exists with that title and the page address kept with it.

**Acceptance Scenarios**:

1. **Given** selected text, **When** it is added as a task, **Then** the task's title
   is that text and the page address is kept with it.
2. **Given** no selection, **When** the page is added as a link, **Then** the saved
   link is the page and it begins being read.
3. **Given** a keyboard shortcut, **When** it is pressed, **Then** quick capture opens
   without touching the mouse.

---

### User Story 3 — Add something quickly (Priority: P1)

From the panel the member adds a task, a reminder or a meeting in a few keystrokes,
with the same fields the phone offers.

**Independent Test**: add a meeting in the panel with a name and a start → it is in
the panel at once and on the phone within ten seconds.

**Acceptance Scenarios**:

1. **Given** a title and a date, **When** it is saved, **Then** it appears in the
   panel at once and on the phone shortly after.
2. **Given** the network is down, **When** something is added, **Then** it is kept and
   sent when the connection returns, exactly once.

---

### User Story 4 — Signed in, and only me (Priority: P1)

The member signs in once with their email or their Google account. Their data never
leaves the browser except to their own Botvy. Signing out ends the session on their
Botvy and clears what was cached.

**Independent Test**: sign in, restart the browser → still signed in; sign out →
nothing cached remains and this browser is gone from the member's devices.

**Acceptance Scenarios**:

1. **Given** a signed-in member, **When** the browser restarts, **Then** they are
   still signed in.
2. **Given** sign-out, **When** the panel is reopened, **Then** nothing of the
   previous member's data is visible or recoverable, and the session that browser
   held is no longer accepted by Botvy.
3. **Given** an expired session, **When** the panel is used, **Then** it renews
   silently, and only asks the member to sign in again if that fails.
4. **Given** the panel was left open past the session's life, **When** Botvy says the
   session has expired, **Then** the panel renews and carries on rather than sitting
   there quietly disconnected.

---

### User Story 5 — It is honest about being out of date (Priority: P2)

The panel shows whether it is in step, catching up, or offline, and never presents
stale data as current without saying so.

**Independent Test**: cut the network → the panel says it is offline and still lists
today; add a task → it shows one unsent change until the network returns.

**Acceptance Scenarios**:

1. **Given** no connection, **When** the panel is open, **Then** it says so and still
   shows what it has, marked as such.
2. **Given** something waiting to be sent, **When** the panel is open, **Then** the
   member can see there is unsent work and force a retry.
3. **Given** the same task edited on the computer and on the phone while both were
   offline, **When** both reconnect and Botvy keeps only one of the two edits,
   **Then** the panel shows the version Botvy kept, says plainly that the edit made
   here was refused, and still holds what the member typed so they can apply it again.
4. **Given** an unsent change that Botvy keeps refusing, **When** it has been tried
   five times, **Then** the panel stops resending it, marks it as needing attention,
   and keeps it until the member retries or discards it.

### Edge Cases

- The browser suspends the extension while idle: the panel catches up when it wakes,
  and nothing queued is lost.
- The panel is opened on a computer that has been off longer than Botvy keeps deleted
  items: it takes a complete picture rather than a misleading partial one.
- A second browser profile signed in as a different member: the two never share
  cached data.
- Capture from a page in a private window: the extension is not offered there unless
  the member turns it on themselves, and when they do it behaves exactly as it does
  anywhere else — the capture is queued and nothing extra is kept.
- The member's Botvy is not reachable (home machine off): the panel says so plainly
  and keeps their capture until it returns.
- A very long selection: the first 120 characters become the title and the whole text
  is kept in the notes.
- The member changes their time zone or their language on the phone: the panel follows
  within a day, and the day it calls "today" moves with them.

## Requirements *(mandatory)*

- **FR-001** The panel MUST show today's tasks and the next seven days of meetings,
  and MUST allow completing, undoing and opening each.
- **FR-002** The panel MUST allow adding a task, a reminder and a meeting with the
  same fields the phone offers: for a task a title, notes, a date and time or a whole
  day, a priority, a label and an estimated duration; for a reminder a title, a moment
  and its advance warnings; for a meeting a name, a description, a start, a length, a
  location or a joining link, a preparation note and its advance reminders.
- **FR-003** Capture MUST be available from a right-click on a selection or a page and
  from a keyboard shortcut, producing a task, a reminder or a saved link, with the page
  address kept in the item's notes.
- **FR-004** Changes MUST appear across the phone and the panel within ten seconds
  when both are connected.
- **FR-005** The panel MUST work without a connection, keep what was added, and send
  it exactly once when the connection returns; an absence longer than the period Botvy
  keeps deleted items MUST be repaired by taking a complete picture rather than a
  partial one.
- **FR-006** The panel MUST show what is current when it opens, not a stale snapshot.
- **FR-007** The panel MUST show whether it is in step, catching up or offline, MUST
  call itself out of step once the last successful exchange with Botvy is more than
  five minutes old, and MUST let the member force a retry. A change Botvy refused, or
  one that has been tried five times without getting through, MUST be shown as needing
  attention and kept until the member retries or discards it — never resent forever
  and never dropped in silence.
- **FR-008** Sign-in MUST support email and Google, MUST survive a browser restart,
  and MUST renew silently when possible — before the panel or the background work uses
  the session, and again when Botvy says the session has expired — asking the member to
  sign in again only when renewal itself fails.
- **FR-009** Signing out MUST end the session on the member's Botvy and remove this
  browser from their devices, and MUST remove every cached item of that member's data
  from this computer.
- **FR-010** Two members using two browser profiles MUST never see each other's data.
- **FR-011** The extension MUST request only the permissions it uses, and MUST state
  why in the store listing.
- **FR-012** No member data MUST be sent anywhere except the member's own Botvy.
- **FR-013** Every date and time the panel shows or accepts MUST be the member's own,
  resolved against the time zone recorded in their profile and never the computer's, so
  the day the panel calls today is the day the phone calls today. The panel MUST read
  that time zone and the member's language when they sign in, and MUST pick up a change
  to either within a day.
- **FR-014** The panel's text MUST be available in English and Arabic, following the
  language recorded in the member's profile, and MUST lay itself out right to left when
  that language is Arabic.
- **FR-015** While the panel or its background connection is live, an alert Botvy has
  just sent MUST also be shown on the computer, so a member sitting at their desk is
  not told only on their phone.

### Key Entities

**Cached task, meeting and label** (a copy for offline use), **Pending change**
(something added or completed that has not reached Botvy yet), **Session** (the
member's sign-in on this browser).

## Success Criteria *(mandatory)*

- **SC-001** A change made on either side appears on the other within 10 seconds in
  95% of attempts.
- **SC-002** Zero duplicated items across 20 offline additions followed by
  reconnection.
- **SC-003** Capture from selection to created task takes under 5 seconds.
- **SC-004** The panel opens showing current data in under 1 second on a browser
  profile that has signed in and synced before and still holds its cache.
- **SC-005** Zero cached items remain after sign-out, and the session that browser held
  is refused by Botvy, both verified by inspection.
- **SC-006** Every permission the built extension asks for is on the reviewed list and
  has its reason written in the listing text, confirmed by loading the zipped build in
  a clean browser profile.

## Assumptions

- Chrome and Chromium-based browsers; Firefox is possible later from the same build
  but is not verified in this phase.
- The panel is the primary surface; a small popup exists only to open the panel and
  sign in.
- The extension is not a push target: it registers no push channel, and Botvy never
  sends it one. Timely updates come from the live connection and from opening the
  panel, and an alert Botvy has already sent to the member's phone is echoed on the
  computer while that connection is live (FR-015).
- The member's Botvy is reachable from their browser (same machine, home network or
  their tunnel).
- Submitting to the Chrome Web Store is optional in this phase and may happen after
  it; the listing text explaining each permission is a deliverable of this phase
  either way.
- Capture is deliberately a little wider than the blueprint's minimum — a selection may
  become a reminder as well as a task, and a page may become a task as well as a saved
  link — because all four share one path and the member's own reading is what they are
  capturing from.

## Out of scope

- Chat in the extension.
- Training, nutrition, knowledge and the daily rhythm surfaces.
- A new-tab page or any browsing-history feature.
- Firefox and Safari store listings.

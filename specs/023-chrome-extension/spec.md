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

**Acceptance Scenarios**:

1. **Given** a title and a date, **When** it is saved, **Then** it appears in the
   panel at once and on the phone shortly after.
2. **Given** the network is down, **When** something is added, **Then** it is kept and
   sent when the connection returns, exactly once.

---

### User Story 4 — Signed in, and only me (Priority: P1)

The member signs in once with their email or their Google account. Their data never
leaves the browser except to their own Botvy. Signing out clears what was cached.

**Acceptance Scenarios**:

1. **Given** a signed-in member, **When** the browser restarts, **Then** they are
   still signed in.
2. **Given** sign-out, **When** the panel is reopened, **Then** nothing of the
   previous member's data is visible or recoverable.
3. **Given** an expired session, **When** the panel is used, **Then** it renews
   silently, and only asks the member to sign in again if that fails.

---

### User Story 5 — It is honest about being out of date (Priority: P2)

The panel shows whether it is in step, catching up, or offline, and never presents
stale data as current without saying so.

**Acceptance Scenarios**:

1. **Given** no connection, **When** the panel is open, **Then** it says so and still
   shows what it has, marked as such.
2. **Given** something waiting to be sent, **When** the panel is open, **Then** the
   member can see there is unsent work and force a retry.

### Edge Cases

- The browser suspends the extension while idle: the panel catches up when it wakes,
  and nothing queued is lost.
- The panel is opened on a computer that has been off for a week: it takes a complete
  picture rather than a misleading partial one.
- A second browser profile signed in as a different member: the two never share
  cached data.
- Capture from a page in a private window: it works and stores nothing extra.
- The member's Botvy is not reachable (home machine off): the panel says so plainly
  and keeps their capture until it returns.
- A very long selection: it is trimmed to a sensible title and the whole text is kept
  in the notes.

## Requirements *(mandatory)*

- **FR-001** The panel MUST show today's tasks and the next seven days of meetings,
  and MUST allow completing, undoing and opening each.
- **FR-002** The panel MUST allow adding a task, a reminder and a meeting with the
  same fields the phone offers.
- **FR-003** Capture MUST be available from a right-click on a selection or a page and
  from a keyboard shortcut, producing a task, a reminder or a saved link, keeping the
  page address.
- **FR-004** Changes MUST appear across the phone and the panel within ten seconds
  when both are connected.
- **FR-005** The panel MUST work briefly without a connection, keep what was added,
  and send it exactly once when the connection returns.
- **FR-006** The panel MUST show what is current when it opens, not a stale snapshot.
- **FR-007** The panel MUST show whether it is in step, catching up or offline, and
  MUST let the member force a retry.
- **FR-008** Sign-in MUST support email and Google, MUST survive a browser restart,
  and MUST renew silently when possible.
- **FR-009** Signing out MUST remove every cached item of that member's data.
- **FR-010** Two members using two browser profiles MUST never see each other's data.
- **FR-011** The extension MUST request only the permissions it uses, and MUST state
  why in the store listing.
- **FR-012** No member data MUST be sent anywhere except the member's own Botvy.

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
- **SC-004** The panel opens showing current data in under 1 second on a warm profile.
- **SC-005** Zero cached items remain after sign-out, verified by inspection.
- **SC-006** The extension passes store review with no permission queried.

## Assumptions

- Chrome and Chromium-based browsers; Firefox is possible later from the same build
  but is not verified in this phase.
- The panel is the primary surface; a small popup exists only to open the panel and
  sign in.
- Push notifications are not delivered through the extension; timely updates come
  from the live connection and from opening the panel.
- The member's Botvy is reachable from their browser (same machine, home network or
  their tunnel).

## Out of scope

- Chat in the extension.
- Training, nutrition, knowledge and the daily rhythm surfaces.
- A new-tab page or any browsing-history feature.
- Firefox and Safari store listings.

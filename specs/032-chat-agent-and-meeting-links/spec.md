# Feature Specification: Meeting links with previews, and a chat that can change anything

**Feature Branch**: `032-chat-agent-and-meeting-links`

**Created**: 2026-10-08

**Status**: In progress (follows 031; not a blueprint phase)

**Input**: the Owner, 2026-10-08 — "if the user added a link address for a
physical meeting, show a link to open the location, and a preview if there is a
free way, online meeting as well" and "make the LLM have access to the data, so
it can read and write it while chatting: meetings, meals, trainings, tasks,
everything."

## Decisions taken with the Owner

| Question | Answer |
|---|---|
| How the chat gets write access | **Expand intents.** The model names an intent; code resolves ids, writes, and templates the confirmation from what was stored. No tool-calling loop. |
| Confirmation | **Edits, reschedules, cancels and deletes ask first** (a Yes/No card); creates apply at once. |
| Preview | **Open Graph card plus a map thumbnail.** |
| Where a physical meeting's link goes | **Auto-detected in the address field**; no schema change. |

## Why this feature exists

A meeting's location is `{ onlineLink, address }`. The phone's "Open in map"
sends the address to a map *search*, so an address that is itself a link — a
pasted `maps.app.goo.gl/…` — opens a search for a URL. Nothing anywhere shows
what a link is before it is opened, and nothing refuses a `javascript:` link
that the extension then renders as an `href`.

The chat can create a task, a reminder, a meeting, a meal, a metric, a profile
change and training slots, cancel a task or a reminder, and complete today's
session. It cannot edit, reschedule, complete, cancel a meeting or delete
anything, and the model is shown only today's tasks, one training line, one meal
line and the streak — it cannot answer "when is my dentist?" because it has
never been told.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A place link opens the place (Priority: P1)

A member pastes a Google Maps share link as a meeting's address. Tapping it
opens that place in their maps app; the extension renders it as a link.

**Acceptance**: an address that is link-shaped opens directly; a plain address
still opens a map search; a `javascript:` or `file:` link is refused on save
with `location_link_scheme`.

### User Story 2 — A meeting shows what its link is (Priority: P2)

The meeting's detail shows a card with the page's site name, title and image
for an online link, and a small map with a pin for a place, when the phone is
online. Offline it shows the plain link.

**Acceptance**: the preview comes from the server, through the shared SSRF
guard, cached; coordinates are read from the map URL when it carries them; a
plain-text address is geocoded only while `meetings.geocodeEnabled` is on; a
dead link is not refetched for seven days.

### User Story 3 — The coach knows what is in the member's week (Priority: P1)

"When is my dentist?", "what did I plan to eat today?", "what's my next
session?" are answered from the member's own data: overdue and coming tasks,
the next 48 h of reminders, the next 7 days of meetings and sessions, today's
meals and the week's training slots, all in the member's own time zone.

### User Story 4 — The chat changes things, and asks before it does (Priority: P1)

"Move my dentist to 5pm tomorrow", "push the report to Friday", "mark the gym
session done", "cancel Thursday's meeting", "swap tonight's dinner for koshari",
"delete the reminder about the bins". An edit, a cancel, a delete, or completing
a meeting or a session shows a card naming exactly what will change, from the
stored row, with Yes and No; nothing changes until Yes (or a typed "yes" in the
same chat). A create still happens at once, as before.

**Acceptance**: ids are resolved in code from the member's own rows; two
matches ask which; a proposal applies once, expires after 15 minutes, and asks
again if the row changed since; a "yes" typed in another chat does nothing.

## Requirements

- **FR-001** An address or online link is accepted only with an `http`/`https`
  scheme when it is link-shaped; anything else link-shaped is refused.
- **FR-002** A link-shaped address opens as a link on every surface.
- **FR-003** `linkPreview(url, address)` is a GraphQL query for a signed-in
  member; every outbound hop passes `checkTarget`/`checkResolvedTarget`; results
  and failures are cached in `link_previews`.
- **FR-004** Coordinates come from the final URL first; Nominatim is asked only
  for a plain-text address, only when `meetings.geocodeEnabled`, at most one
  request a second, with a descriptive User-Agent.
- **FR-005** The latest-message `<now>` block (031) carries the member's
  read view, capped; the system prompt and history stay byte-identical.
- **FR-006** New intents `edit`, `complete`, `delete`, and `cancel` with a
  `target`; the model never supplies an id.
- **FR-007** Edits, cancels, deletes and meeting/session completion become
  proposals confirmed by `chat.confirm` or a typed yes/no in the same
  conversation; applied once, claimed atomically.
- **FR-008** Deleting never changes a status.
- **FR-009** `add_meal` executes (it was missing from `ACTIONS`); meeting and
  session cards carry ISO times.

## Success criteria

- **SC-001** The intent fixture with the new cases scores ≥ 90 % with zero
  silent time errors on the live model, or the score is reported as it is.
- **SC-002** The read view adds at most ~3 s of prompt reading to a turn on
  the Owner's GPU (measured).
- **SC-003** All gates green: typecheck, lint, format, vitest, flutter analyze
  and test, the UI literal check, the extension tests.

## Out of scope

- A tool-calling agent loop (declined in favour of intents).
- Storing previews on the meeting row (they are fetched on demand; offline shows
  the plain link).
- Deleting a profile or an account by chat.

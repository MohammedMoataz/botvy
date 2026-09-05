# Feature Specification: Links that become a program

**Feature Branch**: `021-knowledge-ingestion`

**Created**: 2026-09-05

**Status**: Draft (phase P7 of `specs/013-platform-v2-blueprint`)

**Input**: Blueprint P7 — "links, job state machine, extraction, summaries, playlist
expansion, AI program suggestions, suggestions toggle."

## Why this feature exists

Members who train collect links: an article about a training split, a video of a
movement, a playlist someone recommended. Those links sit unread, and the knowledge in
them never reaches the week they actually train. This phase lets Botvy read them —
locally, on the member's own machine — and turn them into something usable: a summary
worth reading in a minute, and a suggestion for the next session that cites where it
came from.

Nothing here happens without the member's consent: saving a link is a choice, and
the whole suggestion mechanism can be switched off.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Save a link and watch it being read (Priority: P1)

A member pastes a link — an article, a page, a video or a whole playlist — optionally
tags it with a sport, and sees it move through clear stages: waiting, reading,
summarising, done. If it fails, it says why and offers to try again.

**Independent Test**: save an article and a three-video playlist → the article reaches
done within minutes; the playlist becomes three entries, each reaching done.

**Acceptance Scenarios**:

1. **Given** a page that cannot be fetched, **When** reading fails, **Then** the entry
   shows "failed" with the reason and a Retry action, and the failure never blocks
   other links.
2. **Given** a playlist, **When** it is saved, **Then** it becomes one entry per video,
   grouped under the playlist, each with its own state.
3. **Given** the same link saved twice, **When** the second is saved, **Then** it is
   recognised as the same and not read twice.
4. **Given** a very long article, **When** it is summarised, **Then** the summary
   arrives without the member waiting on screen.

---

### User Story 2 — Read the summary, not the article (Priority: P1)

A finished entry shows a short summary, the key points, any images or clips it found,
how long the original is, and a link back to it. The member can open the original at
any time.

**Acceptance Scenarios**:

1. **Given** a finished video, **When** it is opened, **Then** the summary is shown
   before the member decides whether to watch.
2. **Given** a summary, **When** it is read, **Then** it names its source, so nothing
   appears to be Botvy's own claim.
3. **Given** images found in an article, **When** they are shown, **Then** they are
   fetched through Botvy rather than by the member's device contacting the source.

---

### User Story 3 — A suggestion for the next session (Priority: P2)

When the member has training coming up and has saved relevant material, Botvy proposes
what the next session could contain, drawn from their own sources and named as such.
The member accepts it into the session or dismisses it.

**Independent Test**: save two upper-body articles, have an upper-body session
tomorrow → a suggestion appears citing at least one of them → accept → the session
holds those exercises.

**Acceptance Scenarios**:

1. **Given** a suggestion accepted, **When** the session is opened, **Then** it holds
   the suggested exercises, editable.
2. **Given** a suggestion dismissed, **When** the same session comes round, **Then**
   it is not proposed again.
3. **Given** no relevant material, **When** a session is scheduled, **Then** no
   suggestion is invented.
4. **Given** the member has turned suggestions off, **When** a session is scheduled,
   **Then** nothing is generated at all and nothing runs in the background.

---

### User Story 4 — The Owner can see the queue (Priority: P3)

The Owner sees what is being read across the system, what failed and why, and can
retry or clear an entry.

**Acceptance Scenarios**:

1. **Given** a link stuck failing, **When** the Owner opens the queue, **Then** it is
   listed with its reason and attempt count.

### Edge Cases

- A link behind a login or a paywall: it fails with a clear reason rather than storing
  a login page as if it were the article.
- A playlist with hundreds of videos: only the first N are taken, the member is told,
  and they can ask for more.
- A video with no transcript available: the entry finishes with what could be
  gathered, or fails plainly — never silently empty.
- The model is unavailable while summarising: the entry waits and resumes rather than
  failing permanently.
- A source that changes after being read: the stored summary is what was read, dated.
- A link that is not about training at all: it is stored and summarised; suggestions
  simply do not use it.
- Text inside a fetched page that looks like an instruction: it is never acted upon.

## Requirements *(mandatory)*

- **FR-001** A member MUST be able to save a link, optionally tagged, and to remove it.
- **FR-002** Botvy MUST recognise whether a link is an article or page, a single video
  or a playlist, and MUST expand a playlist into one entry per video, grouped.
- **FR-003** Every entry MUST show its state: waiting, reading, summarising, done or
  failed with a reason and an attempt count, and MUST be retryable.
- **FR-004** A failure MUST NOT block other entries, and repeated failure MUST stop
  after a limit rather than retrying forever.
- **FR-005** Saving the same link twice MUST NOT read it twice.
- **FR-006** A finished entry MUST hold a summary, key points, references to any media
  found, the source's title and length, and a link to the original.
- **FR-007** A summary MUST name its source.
- **FR-008** Media MUST be shown through Botvy, never by the member's device
  contacting the source directly.
- **FR-009** When suggestions are enabled and an upcoming session matches saved
  material, Botvy MUST propose session content citing the sources used.
- **FR-010** A suggestion MUST be acceptable into the session or dismissable, and a
  dismissed suggestion MUST NOT return for the same session.
- **FR-011** Turning suggestions off MUST stop all background generation for that
  member.
- **FR-012** Reading and summarising MUST happen in the background; the member MUST
  never wait on a screen for it.
- **FR-013** Content fetched from a source MUST never be executed as an instruction.
- **FR-014** The Owner MUST be able to see the whole queue, with reasons, and to retry
  or clear an entry.
- **FR-015** The limits — how many videos of a playlist, how much text is kept, how
  many attempts — MUST be Owner settings.

### Key Entities

**Link** (what the member saved, its kind, its state, its parent when it came from a
playlist), **Reading** (the extracted text or transcript and the summary),
**Suggestion** (proposed session content with the sources it came from).

## Success Criteria *(mandatory)*

- **SC-001** An article reaches done within 3 minutes on the reference machine; a
  ten-video playlist within 20 minutes.
- **SC-002** 100% of failures show a reason and a working Retry.
- **SC-003** Zero suggestions are generated for members who have turned them off, and
  no background work runs for them.
- **SC-004** At least 8 of 10 fixture articles produce a summary a reviewer judges
  faithful.
- **SC-005** Zero instructions embedded in fetched content are ever executed.
- **SC-006** A member decides whether to watch a video from its summary in under 30
  seconds.

## Assumptions

- Saving a link is a personal, low-volume act by the member; Botvy fetches on their
  behalf and stores the result only for them. The platform's terms are documented, and
  nothing is redistributed.
- Only the first videos of a large playlist are taken by default; the limit is a
  setting.
- Summaries are produced by the local model; their quality follows the model the Owner
  runs.
- Suggestions match on sport and tags, not on deep understanding of the training plan.

## Out of scope

- A reader view of the full original inside Botvy.
- Highlighting, annotation and note-taking on sources.
- Search across saved material (it is browsable and taggable, not searchable, in this
  phase).
- Sharing sources or suggestions with another member.

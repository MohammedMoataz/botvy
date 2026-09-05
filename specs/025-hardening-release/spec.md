# Feature Specification: Ready to be relied on

**Feature Branch**: `025-hardening-release`

**Created**: 2026-09-05

**Status**: Draft (phase P11 of `specs/013-platform-v2-blueprint`)

**Input**: Blueprint P11 — "backups verified, security review, docs, optional v1
import, decommission legacy, rotate the compromised key, release v2.0.0."

## Why this feature exists

Everything works. That is not the same as being able to rely on it. This phase answers
the questions a person only asks once something matters to them: if the machine dies
tomorrow, what do I get back and how? Who could reach my data if they tried? What
happens to the app my family is still using? And is anything still shipping with a
credential that was exposed months ago?

It ends with a version anyone can install from scratch, and the old system switched
off deliberately rather than left running because nobody dared stop it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Lose everything and get it back (Priority: P1)

The Owner restores from a backup onto a clean machine and finds their members, their
tasks, their history and their settings intact, following the written procedure and
nothing else.

**Independent Test**: on a second machine with only the backups and the repository,
restore and sign in as an existing member; their data is there.

**Acceptance Scenarios**:

1. **Given** last night's backups, **When** the documented restore runs on a clean
   machine, **Then** every member can sign in and sees their data.
2. **Given** the restore, **When** it finishes, **Then** the health page reads healthy
   and scheduled jobs resume without manual intervention.
3. **Given** a backup older than the deletion horizon, **When** a phone syncs against
   the restored system, **Then** it reconciles to a complete picture rather than
   silently losing or duplicating things.
4. **Given** the procedure, **When** someone who has not built the system follows it,
   **Then** it works without asking the author a question.

---

### User Story 2 — Nobody gets in who should not (Priority: P1)

The system is reviewed against the ways it could be reached: what is exposed, what
credentials exist, what is logged, and what an attacker could do with any single piece
they obtained. Findings are fixed or written down with a reason.

**Acceptance Scenarios**:

1. **Given** the review, **When** it is complete, **Then** every finding is fixed,
   or recorded with a decision and a reason.
2. **Given** the exposed credential inherited from the old system, **When** the phase
   ends, **Then** it has been replaced and the old one no longer works.
3. **Given** any log or diagnostic output, **When** it is inspected, **Then** it
   contains no password, token or member content.
4. **Given** the shipped default administrator password, **When** the release is
   published, **Then** the documentation makes changing it the first step, and the
   system keeps warning until it is.

---

### User Story 3 — The old system is switched off, on purpose (Priority: P1)

The members still on the old app are moved over, the old stack is stopped, its data is
archived, and the code is removed from the repository — after, not before, the new
system has done everything the old one did.

**Acceptance Scenarios**:

1. **Given** the old system running in parallel, **When** the parity checklist is
   complete, **Then** it is stopped and its data archived where it can still be read.
2. **Given** a member still using the old app, **When** they are moved, **Then** their
   account works in the new app and they are told what changed.
3. **Given** the removal, **When** the repository is built, **Then** nothing referred
   to the removed code.

---

### User Story 4 — Optionally, bring the old history (Priority: P3)

If the Owner wants it, the old reminders and conversations are brought across once, so
a member's history is not a wall at the changeover.

**Acceptance Scenarios**:

1. **Given** the import run, **When** a member opens their history, **Then** their old
   reminders and messages are there, in order, marked as imported.
2. **Given** the import run twice, **When** it finishes, **Then** nothing is
   duplicated.
3. **Given** the Owner declines the import, **When** the phase ends, **Then** nothing
   is imported and the old data remains only in the archive.

---

### User Story 5 — Anyone can install it (Priority: P1)

A person with the prerequisites installs Botvy from the published release and the
written setup, reaching a working system without reading the source.

**Acceptance Scenarios**:

1. **Given** a clean machine, **When** the setup is followed, **Then** a working
   system is reached and the health page reads healthy.
2. **Given** the release, **When** the app and extension are installed from the
   published artefacts, **Then** they connect to that system.

---

### User Story 6 — It has been measured (Priority: P2)

The promises made at the start are checked against the running system, and the numbers
are written down.

**Acceptance Scenarios**:

1. **Given** the platform's stated outcomes, **When** they are measured, **Then**
   each has a recorded result, and anything missed is recorded with what will be done
   about it.

### Edge Cases

- A restore onto a machine with a different name or address: the procedure covers it.
- Backups that exist but were never tested: this phase's whole point; an untested
  backup counts as no backup.
- A member who was banned in the old system: they stay banned.
- The archive of the old data: readable without the old software running.
- A finding that cannot be fixed in this phase: it is written down with its risk
  accepted explicitly, not left implicit.

## Requirements *(mandatory)*

- **FR-001** Backups of both stores MUST run on a schedule, MUST be verifiable, and
  MUST be documented.
- **FR-002** A restore onto a clean machine MUST be performed at least once, by
  following the written procedure only, and the result MUST be recorded.
- **FR-003** After a restore the system MUST reach a healthy state and scheduled work
  MUST resume without manual steps.
- **FR-004** A security review MUST cover the exposed surface, credentials, logging,
  rate limiting and the consequence of losing any single secret; every finding MUST be
  fixed or recorded with an explicit decision.
- **FR-005** The credential inherited from the old system MUST be replaced and the old
  one invalidated.
- **FR-006** Logs and diagnostics MUST NOT contain passwords, tokens or member content.
- **FR-007** The old system MUST be stopped only after a parity checklist is complete,
  its data archived readably, and its code removed from the repository.
- **FR-008** An optional one-time import of the old reminders and conversations MUST
  be available, MUST be safe to run twice, and MUST mark what it imported.
- **FR-009** Setup documentation MUST let someone who did not build the system install
  it from the published release.
- **FR-010** Every stated outcome of the platform MUST be measured and recorded, with
  a plan for anything missed.
- **FR-011** The release MUST publish the server images, the app and the extension
  together, versioned.

### Key Entities

**Backup** (of each store, with its date and how it is verified), **Finding** (of the
review, with its decision), **Parity checklist**, **Import run** (what it moved, when),
**Release**.

## Success Criteria *(mandatory)*

- **SC-001** A restore onto a clean machine succeeds following only the written
  procedure, in under 30 minutes.
- **SC-002** Zero secrets or member content appear in a sampled day of logs.
- **SC-003** 100% of review findings are fixed or recorded with an accepted decision.
- **SC-004** The old system is off, archived and removed, with the parity checklist
  complete.
- **SC-005** A person following the setup reaches a healthy system in under 30 minutes.
- **SC-006** Every stated platform outcome has a recorded measurement.

## Assumptions

- The Owner accepts that a shipped default administrator password is a deliberate
  trade for a usable fresh install, mitigated by the warning and the documented first
  step.
- Archiving the old data means a compressed dump kept outside the repository.
- The import, if run, covers reminders and conversations only; coaching history is
  represented by the new check-in record going forward.

## Out of scope

- A formal external penetration test.
- High availability, clustering or failover.
- Automated restore drills on a schedule (this phase performs one and documents it).

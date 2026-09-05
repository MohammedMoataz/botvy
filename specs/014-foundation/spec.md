# Feature Specification: Foundation — the v2 platform stands up empty

**Feature Branch**: `014-foundation`

**Created**: 2026-09-05

**Status**: Draft (spec-kit phase P0 of the v2 blueprint, `specs/013-platform-v2-blueprint`)

**Input**: Blueprint roadmap P0 — "an empty but complete skeleton of every surface, both
stores, the outbox, the edge and CI/CD — so every later phase adds slices, not plumbing."

## Why this feature exists

Every later phase of Botvy v2 adds capabilities to members. None of them can start
until the platform they land in exists: one command that brings the whole system up,
a health signal that says whether it is up, a way for a change to travel from a
command to an automation, and a build that proves each surface still compiles. v1
taught the cost of growing these later — the chat service became the place where
every new thing landed because there was nowhere else designed for it.

This feature ships **no member-facing capability**. Its users are the Owner (who runs
the system) and the Developer (who builds the next phases). v1 keeps running
untouched beside it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — The Owner brings v2 up with one command (Priority: P1)

The Owner copies the example environment file, fills in the documented values, runs
one command to start the stack and one to initialise it, and sees a single health
page that says every part is up: both data stores, the model server, push
configuration, and the freshness of every scheduled job.

**Why this priority**: nothing else can be verified without it.

**Independent Test**: on a clean machine with the prerequisites, `up` then
`bootstrap` then the health page reads `ok` within 5 minutes.

**Acceptance Scenarios**:

1. **Given** a filled environment file, **When** the Owner starts the stack, **Then**
   every container reports healthy and exactly one port is reachable from outside.
2. **Given** the stack is up, **When** the Owner opens the health page, **Then** it
   names each store, the model server, push, and each scheduled job with a fresh/stale
   state, folded into `ok` or `degraded`.
3. **Given** a required environment value is missing, **When** the stack starts,
   **Then** it refuses to start and names the missing value — it never runs half-configured.
4. **Given** the model server is not running, **When** the health page loads,
   **Then** it reads `degraded` with the model marked down, and everything else still works.

---

### User Story 2 — The Developer has a working loop on every surface (Priority: P1)

The Developer installs dependencies once and can run the API, the background worker,
the web app, the browser extension and the phone app locally against the same stack,
with hot reload where the platform supports it, and can run every test suite with
one command per surface.

**Independent Test**: `install` → start each surface → each answers on its
documented port (or loads in Chrome / the emulator) → each test command passes on a
fresh checkout.

**Acceptance Scenarios**:

1. **Given** a fresh checkout, **When** the Developer runs the API in development
   mode, **Then** the interactive API documentation and the query playground open in a
   browser.
2. **Given** the extension built in development mode, **When** it is loaded into
   Chrome, **Then** its side panel opens showing the sign-in screen.
3. **Given** the phone app on an emulator, **When** it starts, **Then** it opens to
   a sign-in screen in the device's language, right-to-left when Arabic.
4. **Given** shared types regenerated from the running API, **When** the web and
   extension are built, **Then** they compile against those types with no hand-written copies.

---

### User Story 3 — Every change is built, tested and can be released (Priority: P1)

Each pull request builds and tests every surface. Tagging a release produces
container images, a phone installer and an extension package, and — when a deploy
target is configured — updates the running host.

**Independent Test**: open a pull request touching each surface → all checks green;
push a tag → images, installer and extension package appear as artifacts.

**Acceptance Scenarios**:

1. **Given** a pull request that breaks a test in one surface, **When** the checks
   run, **Then** that surface's job fails and the others still report.
2. **Given** a release tag, **When** the release workflow finishes, **Then** the
   images are published and the host (if configured) is running the new tag.
3. **Given** no deploy target is configured, **When** a tag is pushed, **Then**
   images and artifacts are still produced and the deploy step is skipped, not failed.

---

### User Story 4 — The spine is proven end to end (Priority: P1)

A single demonstration command travels the whole path a real feature will use:
accepted at the edge, handled inside its context, recorded together with the event it
raises, relayed by the worker, reacted to inside the system, delivered to the
automation tool, and visible in the health page's job freshness.

**Independent Test**: send the demonstration command → the event appears in the
automation tool's execution list → the health page shows the relay job fresh.

**Acceptance Scenarios**:

1. **Given** the stack is up, **When** the demonstration command is sent with a
   member credential, **Then** it is acknowledged, and the automation tool records one
   delivery for it within 10 seconds.
2. **Given** the same command is sent twice with the same idempotency key, **When**
   both are processed, **Then** exactly one event is delivered.
3. **Given** the worker is stopped, **When** the command is sent, **Then** the event
   is stored and delivered as soon as the worker returns — never lost.
4. **Given** a scheduled job has not run for 15 minutes, **When** the health page
   loads, **Then** it reads `degraded` and names the job.

---

### User Story 5 — v1 keeps running while v2 grows (Priority: P2)

The v1 gateway, admin portal, phone app source and infrastructure remain in the
repository as a read-only reference and remain deployable, so the phones already
in use keep working until v2 reaches parity.

**Acceptance Scenarios**:

1. **Given** the v2 restructure, **When** the v1 stack is started from its own
   compose file, **Then** it runs exactly as before on its own ports.
2. **Given** a v1 file is needed by a v2 phase, **When** it is ported, **Then** it is
   copied, never edited in place.

### Edge Cases

- The product store is started for the first time and is not yet a replica set: it
  initialises itself; a second start does not re-initialise.
- The identity store already holds v1 tables: v2 uses the identity tables and leaves
  the rest untouched.
- Ports 80/443 already taken on the host: the edge port is configurable.
- Push credentials absent: the system runs and reports push as not configured;
  present but unreadable: start fails, because that is a declared intent to have push.
- The automation tool is down: events queue and deliver later; the health page shows
  the relay as fresh (it ran) but delivery attempts as pending.
- Windows host: the documented loop works from PowerShell; the production
  recommendation is a Linux or WSL2 engine.

## Requirements *(mandatory)*

### Functional Requirements

**Stack**
- **FR-001** One compose file MUST start every v2 process, the two stores, the
  automation tool, the edge and the backup job; exactly one container MUST publish a port.
- **FR-002** Every required environment value MUST be validated at start; a missing
  or malformed value MUST prevent start with a message naming it.
- **FR-003** A single bootstrap command MUST apply both stores' migrations, create
  the automation tool's owner and API key on first run, register the machine
  credential it uses, and import the committed workflows — idempotently.
- **FR-004** The product store MUST run as a replica set from first start without
  manual steps.
- **FR-005** A nightly backup of the product store MUST be produced to a host volume.

**Health & observability**
- **FR-006** A public health page MUST report each store, the model server, push
  configuration and every scheduled job's freshness, folded into `ok` or `degraded`.
- **FR-007** Every scheduled or event-driven job MUST record a heartbeat; a job
  silent for 15 minutes MUST read stale.
- **FR-008** Logs MUST be structured and MUST carry the acting principal, the
  context and the slice.

**Spine**
- **FR-009** The system MUST accept state changes, data reads and a live connection
  as three separate channels, each behind the same credential check, and MUST
  distinguish member, administrator and machine callers on every one of them.
- **FR-010** A command's side effects for other parts of the system MUST be
  recorded as events in the same transaction as the command's own write, and MUST be
  delivered at least once by the worker to in-process handlers and to the automation
  tool's subscriptions; consumers MUST deduplicate on the event id.
- **FR-011** Operator-tunable values MUST live in a registry with a schema, a default
  and a description, editable without restart.
- **FR-012** A demonstration command MUST exist to prove FR-009/010/011 end to end
  and MUST be removable once a real feature covers the same path.

**Surfaces**
- **FR-013** Web, extension and phone MUST each start to a sign-in screen styled from
  one shared token set, in English and Arabic (right-to-left).
- **FR-014** Web and extension MUST consume one shared client library and generated
  types; the phone MUST generate its models from the same contracts.
- **FR-015** The phone MUST open a new local database with the sync column set
  defined and a migration ladder test in place.

**Delivery**
- **FR-016** Continuous integration MUST lint, build and test every surface on every
  pull request, each as its own job.
- **FR-017** A release tag MUST produce container images, a phone installer and an
  extension package, and MUST deploy to a configured host or skip cleanly.

**Legacy**
- **FR-018** v1 sources and infrastructure MUST move to a `legacy/` directory
  unchanged and MUST remain runnable from there.

### Key Entities

- **Principal**: who is acting — member (with role) or machine (with scopes).
- **Setting**: an operator-tunable value with schema, default, description.
- **Heartbeat**: a job's last run and last success.
- **Outbox event**: a recorded fact awaiting delivery.
- **Workflow**: a committed automation definition imported into the automation tool.
- **Service client**: a machine credential with scopes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** From a clean machine with prerequisites, stack up + bootstrap + health
  `ok` in under 5 minutes.
- **SC-002** A fresh checkout reaches a running API, web, extension and phone dev
  loop in under 20 minutes following the quickstart alone.
- **SC-003** Pull-request checks complete in under 15 minutes.
- **SC-004** The demonstration command is delivered to the automation tool within
  10 seconds in 100% of 20 consecutive attempts, exactly once each.
- **SC-005** A stopped job is visible as stale on the health page within 15 minutes.
- **SC-006** v1 starts from `legacy/` with no edits after the restructure.

## Assumptions

- The identity store is the same database v1 uses, so existing accounts remain;
  v1's non-identity tables stay in place, ignored, until the hardening phase.
- The phone app is developed under a distinct application id suffix so it installs
  beside v1 during development; the release id is decided in the hardening phase.
- The deploy target is a single host reachable over SSH; its address and key are
  repository secrets and may be absent.
- The model server runs on the host, outside the compose stack, as in v1.

## Out of scope

- Any member-facing screen beyond sign-in placeholders (registration and login
  logic land in `015-identity-profile`).
- Real domain contexts beyond the shared kernel and the demonstration slice.
- Data migration of v1 reminders, chats or coaching history.

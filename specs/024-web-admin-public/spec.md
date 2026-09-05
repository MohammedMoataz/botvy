# Feature Specification: Running it, and explaining it

**Feature Branch**: `024-web-admin-public`

**Created**: 2026-09-05

**Status**: Draft (phase P10 of `specs/013-platform-v2-blueprint`)

**Input**: Blueprint P10 — "admin overview, users and roles, settings from schema,
automation, ingestion queue, usage, audit, service clients; public site."

## Why this feature exists

By this phase Botvy does a great deal, and one person is responsible for keeping it
running. They need one place that answers: is everything alive, who is using it, what
is configured, what is queued, and what did I change last week. Members also need
somewhere to send a friend who asks what this is, and somewhere to download the app.

The admin portal has existed since the foundation as a login and a health page. This
phase makes it the operator's actual console, and gives the public site its first
real content.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Is it healthy? (Priority: P1)

The Owner opens the portal and sees at a glance whether every part is up, whether any
scheduled job has gone quiet, and the shape of the last day: members active, tasks and
reminders live, messages exchanged, links queued or failed.

**Independent Test**: stop the scheduler → within fifteen minutes the overview shows
the job stale and the state degraded, naming which one.

**Acceptance Scenarios**:

1. **Given** everything running, **When** the overview loads, **Then** it reads
   healthy and names every checked part.
2. **Given** a job that has not run for fifteen minutes, **When** the overview loads,
   **Then** that job is called out by name and the state is degraded.
3. **Given** the default administrator password is unchanged, **When** the overview
   loads, **Then** a warning says so and links to changing it.

---

### User Story 2 — Who is using it (Priority: P1)

The Owner lists members, searches by name or address, sees when each last signed in
and how many devices they have, promotes or demotes an administrator, and bans or
unbans. Every one of those acts is recorded with who did it and when.

**Acceptance Scenarios**:

1. **Given** a member promoted, **When** they reload, **Then** the admin screens are
   available to them.
2. **Given** a member banned, **When** they try to use the app, **Then** they are
   refused and stop receiving notifications.
3. **Given** any of these acts, **When** the record is opened, **Then** it names the
   act, the target, the person and the moment.

---

### User Story 3 — Configure without deploying (Priority: P1)

The Owner sees every operator setting with its meaning, its default and its current
value, changes one, and it takes effect without restarting anything. A value that does
not fit its rule is refused with an explanation.

**Acceptance Scenarios**:

1. **Given** a changed default morning time, **When** a new member registers,
   **Then** they start with the new value.
2. **Given** an invalid value, **When** it is saved, **Then** it is refused, naming
   the rule, and the previous value stands.
3. **Given** a setting the system writes itself, **When** it is viewed, **Then** it is
   readable but not editable.

---

### User Story 4 — Automation, visible (Priority: P2)

The Owner sees the automation workflows, whether they are active, when each last ran,
and can activate, deactivate or run one now. They can also see which events are
forwarded to automation and turn a subscription on or off.

**Acceptance Scenarios**:

1. **Given** a workflow run by hand, **When** it finishes, **Then** the effect is
   visible where it belongs and the run is recorded.
2. **Given** a subscription switched off, **When** its event next occurs, **Then**
   nothing is forwarded.

---

### User Story 5 — What is stuck (Priority: P2)

The Owner sees links being read across all members, what failed and why, and can retry
or clear one.

**Acceptance Scenarios**:

1. **Given** a link that has failed three times, **When** the queue is opened,
   **Then** it is listed with its reason and attempt count and a retry.

---

### User Story 6 — What it is costing (Priority: P3)

The Owner sees how much the language model has been used, by day and by kind, and
which member accounts for what, so a runaway loop is visible before it becomes a
problem.

**Acceptance Scenarios**:

1. **Given** a week of use, **When** usage is opened, **Then** it shows a per-day
   breakdown by kind and a per-member total.

---

### User Story 7 — Somewhere to point people (Priority: P2)

A visitor lands on the public site, understands in a sentence what Botvy is, sees what
it does, and can download the app and the browser extension. The site is available in
English and Arabic and says plainly that everything runs on the owner's own machine.

**Acceptance Scenarios**:

1. **Given** a visitor on a phone, **When** the page loads, **Then** it reads well at
   that size and the download is obvious.
2. **Given** Arabic selected, **When** the page renders, **Then** it reads
   right-to-left throughout.

### Edge Cases

- The Owner bans themselves: refused, with an explanation.
- The last administrator is demoted: refused, so the system cannot lock everyone out.
- A setting changed while a scheduled job is mid-run: the job finishes with the old
  value and the next run uses the new one.
- Automation is unreachable: the workflows page says so rather than showing an empty
  list as if none existed.
- A member deleted while the Owner is looking at them: the page says so and returns to
  the list.
- The public site is visited while the API is down: it still loads, because it is
  static content.

## Requirements *(mandatory)*

- **FR-001** The portal MUST show the state of every checked part and every scheduled
  job, and MUST call out by name any job that has gone quiet.
- **FR-002** The portal MUST warn while the shipped default administrator password is
  unchanged.
- **FR-003** The Owner MUST be able to list and search members, see last sign-in and
  device count, change roles, and ban and unban.
- **FR-004** The system MUST refuse to remove the last administrator and MUST refuse
  self-ban.
- **FR-005** Every administrative act MUST be recorded with the act, the target, the
  person and the moment, and the record MUST be viewable.
- **FR-006** The portal MUST show every operator setting with its meaning, default and
  current value, MUST validate a change against the setting's rule, and MUST apply it
  without a restart.
- **FR-007** Settings the system writes for itself MUST be visible but not editable.
- **FR-008** The portal MUST list automation workflows with their state and last run,
  and allow activating, deactivating and running one.
- **FR-009** The portal MUST show which events are forwarded to automation and allow
  switching each on or off.
- **FR-010** The portal MUST show the reading queue across members with reasons and
  attempts, and allow retry and clear.
- **FR-011** The portal MUST show model usage by day, by kind and by member.
- **FR-012** The public site MUST explain the product, list what it does, offer the
  app and extension downloads, and state that everything runs on the owner's hardware.
- **FR-013** Both the portal and the site MUST be available in English and Arabic with
  correct right-to-left layout.
- **FR-014** The portal MUST be usable on a phone-sized screen.

### Key Entities

**Operator setting**, **Administrative record**, **Workflow**, **Event
subscription**, **Reading queue entry**, **Usage row**.

## Success Criteria *(mandatory)*

- **SC-001** A stopped job is visible on the overview within 15 minutes, named.
- **SC-002** 100% of administrative acts produce a record.
- **SC-003** A setting change takes effect on the next use without a restart, in under
  a minute.
- **SC-004** The Owner completes each of: promote, ban, change a setting, run a
  workflow, retry a failed link — in under 30 seconds each from the overview.
- **SC-005** The public site scores at least 90 for performance and accessibility in a
  standard audit.
- **SC-006** Both surfaces pass right-to-left review in Arabic.

## Assumptions

- One Owner and a handful of administrators; no fine-grained permissions.
- The public site is content only: no sign-up, no contact form, no analytics.
- Downloads point at the release artefacts produced by the build.
- Usage figures are counts of model tokens as reported by the model, not money.

## Out of scope

- Editing member data (profiles, tasks, reminders) from the portal.
- Impersonating a member.
- Email to members from the portal.
- Any third-party analytics or tracking on the public site.

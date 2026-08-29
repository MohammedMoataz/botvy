# Feature Specification: Workflow Management & Admin Portal Delivery

**Feature Branch**: `004-workflows-admin-ui`

**Created**: 2026-08-30

**Status**: Draft

**Input**: User description: "Workflow management and admin portal delivery: gateway endpoints proxying n8n REST to list, activate, deactivate and trigger workflows with computed next-run times, and the gateway serving the built admin SPA at /admin so it shares one origin and one public surface"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See and control scheduled work without opening n8n (Priority: P1)

As the administrator, I can see every botvy workflow, whether it is
active, when it next runs, and how its last run went — and I can turn one
off or trigger it immediately — without opening n8n's own editor, which
is deliberately not reachable from outside the host.

**Why this priority**: n8n's editor is bound to localhost by design
(constitution: Single Public Surface). Without this, scheduled work is
unobservable and uncontrollable from anywhere but the machine itself,
which defeats the point of a remotely-usable admin portal.

**Independent Test**: with workflows imported into n8n, `GET /workflows`
returns them with active state and a computed next-run; deactivating one
through the gateway is visible in n8n; triggering one produces an
execution.

**Acceptance Scenarios**:

1. **Given** an admin is authenticated, **When** they list workflows,
   **Then** each returns id, name, active state, next scheduled run, and
   the status and time of its most recent execution.
2. **Given** an active workflow, **When** the admin deactivates it
   through the gateway, **Then** it stops running on schedule and reports
   inactive on the next list.
3. **Given** a workflow with a companion webhook trigger, **When** the
   admin triggers it, **Then** an execution starts immediately.
4. **Given** a non-admin user, **When** they call any workflow endpoint,
   **Then** it is refused.

---

### User Story 2 - Reach the admin portal from wherever the API is (Priority: P1)

As the administrator, I open the same host that serves the API and get
the admin portal, so there is one address, one certificate, and one
publicly exposed service.

**Why this priority**: the constitution allows exactly one public
surface. A separately-hosted SPA would either need a second exposed
service or permanent cross-origin configuration; serving it from the
gateway removes both, and removes the CORS allowance that development
currently needs.

**Independent Test**: request `/admin` on the gateway and receive the
SPA; deep-link directly to a client-side route and still receive it;
confirm API routes are unaffected.

**Acceptance Scenarios**:

1. **Given** the admin SPA has been built, **When** a browser requests
   `/admin`, **Then** the application loads.
2. **Given** the SPA uses client-side routing, **When** a browser
   requests a nested route such as `/admin/users` directly, **Then** the
   application still loads rather than returning a 404.
3. **Given** the SPA is served from the gateway's own origin, **When** it
   calls the API, **Then** no cross-origin configuration is required.
4. **Given** a request for an API path, **When** it is handled, **Then**
   the static-file handling never shadows it.

---

### Edge Cases

- n8n unreachable or its API key rejected → workflow endpoints report the
  failure clearly rather than returning an empty list that looks like
  "no workflows exist".
- A workflow with no schedule trigger (the error handler) → returns no
  next-run rather than an error.
- A workflow with several schedule triggers → next-run is the earliest.
- Triggering a workflow that has no companion webhook → refused with a
  reason, since n8n's public API cannot execute a workflow directly.
- The admin SPA has not been built → the gateway still starts and serves
  the API; only `/admin` is unavailable, and it says so.
- Cron expressions are evaluated in the workflow's own timezone, not the
  server's, or the next-run shown will drift for any non-UTC deployment.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose `GET /workflows`, admin-only, returning
  each botvy workflow's id, name, active state, computed next scheduled
  run, and last execution status and time.
- **FR-002**: System MUST expose admin-only `POST /workflows/:id/activate`
  and `POST /workflows/:id/deactivate`.
- **FR-003**: System MUST expose admin-only `POST /workflows/:id/run`,
  which triggers the workflow through its companion webhook, because
  n8n's public API provides no execute-now capability.
- **FR-004**: Next-run MUST be computed from the workflow's schedule
  trigger definition, honouring its configured timezone, and MUST be
  absent (not an error) for workflows without a schedule.
- **FR-005**: All workflow endpoints MUST require the `admin` role.
- **FR-006**: The gateway MUST serve the built admin SPA at `/admin`,
  including a fallback so client-side routes deep-link correctly, without
  shadowing any API route.
- **FR-007**: Failure to reach n8n MUST surface as an explicit error
  distinguishable from "there are no workflows".

### Key Entities

- **Workflow** (read model, owned by n8n, never stored here): id, name,
  active, schedule definition, and its most recent execution's status and
  time. The gateway holds no workflow table — n8n remains the source of
  truth for workflow state, and the repo's JSON files remain the source
  of truth for workflow definitions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can list workflows and see a correct next-run for
  the 5-minute sweep and no next-run for the error handler.
- **SC-002**: Deactivating a workflow through the gateway is reflected in
  n8n itself.
- **SC-003**: Triggering the sweep through the gateway produces an
  execution and a corresponding gateway sweep call.
- **SC-004**: A non-admin receives a refusal from every workflow endpoint.
- **SC-005**: `/admin` and a nested route both load the SPA, and the
  development CORS allowance is no longer required for it.

## Assumptions

- n8n is reachable from the gateway on the compose network, and an n8n
  API key exists (created in Feature 003 and stored in the environment).
- Workflows are tagged so botvy's own can be distinguished from anything
  else in the same n8n instance.
- Execution history comes from n8n's executions API; no execution data is
  copied into the gateway's database.
- The admin SPA is built ahead of the gateway image; a missing build is
  handled gracefully rather than blocking startup.

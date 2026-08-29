<!--
Sync Impact Report
- Version change: (none) → 1.0.0
- Modified principles: n/a (initial ratification)
- Added sections: Core Principles (I-VIII), Technology & Deployment Constraints, Development Workflow, Governance
- Removed sections: none
- Templates requiring updates:
  - .specify/templates/plan-template.md ⚠ pending (verify Constitution Check section references these 8 principles when first feature plan is authored)
  - .specify/templates/spec-template.md ⚠ pending (verify no singleton/single-user assumptions slip into specs — Principle VI)
  - .specify/templates/tasks-template.md ⚠ pending (verify task categories include a verification/test task per Principle VII)
  - .specify/templates/commands/*.md — no agent-specific (CLAUDE-only) references found requiring change
  - README.md — does not yet exist; create referencing this constitution
- Follow-up TODOs: none — all placeholders resolved from project decisions already made and approved.
-->

# Botvy Constitution

## Core Principles

### I. Gateway Owns All Data
PostgreSQL is the single source of truth for all application state. The NestJS
gateway is the only process permitted to read or write it. n8n workflows,
the mobile app, and the admin portal MUST NOT connect to the database
directly — they interact exclusively through the gateway's HTTP API.
Rationale: a single writer eliminates an entire class of concurrency bugs
(the old botvy system's SQLite-community-node fragility) and keeps business
logic, validation, and auth in one reviewable place.

### II. n8n Is Workflow Infrastructure Only
Every n8n workflow is exported as JSON and committed to the repo (source of
truth lives in git, not in the running n8n instance). A workflow MUST NOT
contain a database node, MUST NOT mount a data volume, and MUST call the
gateway only through its `/internal/*` endpoints authenticated with a
service token. The n8n editor and REST API are never exposed to the public
internet — localhost or LAN access only. Rationale: n8n is a scheduler and
orchestrator, not an application; keeping it credential- and data-light
means a compromised or misconfigured workflow cannot leak or corrupt user
data, and workflows-as-code makes deploys reproducible.

### III. Local-First LLM
All model inference runs against a locally hosted Ollama server exposing an
OpenAI-compatible API. No cloud LLM provider may be called for product
functionality. Fine-tuning a model requires a written justification in a
feature spec showing prompting and retrieval-augmented approaches were
tried and insufficient — it is not a default. Rationale: the explicit
purpose of this rebuild is independence from token-metered third-party
APIs; stock open-weight models with good prompting satisfy the assistant's
needs per prior research.

### IV. Forward-Only Migrations
Prisma migrations, once committed to the repository, are never edited or
rolled back in place. A schema correction is always a new migration.
Rationale: mutating history breaks reproducibility across every
environment that already applied the old migration, including any deployed
instance running on a machine other than the one that authored it.

### V. Single Public Surface
Only the gateway (its REST/SSE API and the admin SPA it serves at `/admin`)
is reachable from the public internet, via one named Cloudflare tunnel.
PostgreSQL, n8n, and Ollama MUST remain bound to localhost or the Docker
network and are never tunneled or port-forwarded. Rationale: the old
system's quick-tunnel exposed the entire n8n editor; this system's attack
surface is deliberately one audited, authenticated entry point.

### VI. Multi-User By Default
Every data model, API endpoint, and prompt-assembly path is designed for
concurrent, independent users from the first migration — no `chat_id`-as-
identity shortcuts, no singleton-row assumptions. Authentication is
JWT-based (access + rotating refresh) with `user`/`admin` roles enforced by
guards. Rationale: this platform is explicitly multi-device/multi-user
(mobile APK distributed to many devices, admin portal overseeing them),
unlike the single-allowlist Telegram predecessor.

### VII. Test-Then-Verify (NON-NEGOTIABLE)
No phase, feature, or task is reported complete without running its stated
verification command and showing the real output. Business logic with a
branch or calculation — intent parsing, reminder time math, quota
enforcement, migration application — requires an automated test (vitest for
the gateway). A claim of "done," "fixed," or "passing" without evidence is
a constitution violation. Rationale: this system runs unattended scheduled
jobs and handles other people's reminders and data; silent regressions are
unacceptable, and this discipline is a standing project requirement.

### VIII. YAGNI
No speculative abstraction, no dependency added without a concrete present
need, no new service introduced when an existing one already satisfies the
requirement. Each phase ships the minimum that passes its verification
gate; deferred work is written down, not built early. Rationale: this is a
solo-maintained system — every unused abstraction and unnecessary moving
part is a maintenance cost paid by one person.

## Technology & Deployment Constraints

Backend: NestJS (TypeScript) with Prisma ORM against PostgreSQL 16. Mobile:
Flutter (Dart) with Riverpod, consuming a Dart client generated from the
gateway's OpenAPI schema. Admin portal: React + Vite SPA, built statically
and served by the gateway. Chat streaming: Server-Sent Events, never
WebSocket, unless a future feature demonstrates a genuine need for
bidirectional push. Push notifications: Firebase Cloud Messaging for both
platforms. The full stack MUST be transferable — buildable from the GitHub
repository and runnable via published DockerHub images plus a documented
set of prerequisites (Docker, a running Ollama instance with the required
model pulled, and either a Cloudflare tunnel token or LAN-only operation),
on this machine or any other.

## Development Workflow

Every feature follows the spec-kit cycle: `/speckit.specify` →
(`/speckit.clarify` when ambiguity exists) → `/speckit.plan` →
`/speckit.tasks` → (`/speckit.analyze` before implementation) →
`/speckit.implement`. Each feature is developed on its own numbered branch
and lands as its own commit (or commit series) merged back once its
plan-defined verification gate passes. The old botvy system
(`E:\Software\automation\botvy`) is a read-only reference for behavior and
lessons learned — it is never modified, and it keeps running unmodified in
parallel until this system reaches feature parity and is explicitly
decommissioned.

## Governance

This constitution supersedes any conflicting ad-hoc practice. Amending it
requires: (1) a written rationale for the change, (2) a version bump per
the policy below, (3) a check of `.specify/templates/plan-template.md`,
`spec-template.md`, and `tasks-template.md` for now-outdated guidance, and
(4) a commit whose message states the amendment. Versioning is semantic:
MAJOR for a backward-incompatible principle removal or redefinition, MINOR
for a new principle or materially expanded guidance, PATCH for wording or
clarification only. All feature plans and reviews MUST verify compliance
with these principles before being considered ready to implement;
unresolved complexity or deviation MUST be justified explicitly in the
feature's plan, not silently absorbed.

**Version**: 1.0.0 | **Ratified**: 2026-08-29 | **Last Amended**: 2026-08-29

<!--
Sync Impact Report
- Version change: 1.0.0 → 2.0.0 (MAJOR: principles I, IV, V, VI redefined for the
  v2 platform; four principles added; technology constraints rewritten)
- Modified principles:
  - I. Gateway Owns All Data → I. The API Owns All Data; Each Context Owns Its Store
  - IV. Forward-Only Migrations (now covers Prisma + migrate-mongo + the phone's drift ladder)
  - V. Single Public Surface (the edge is now a Caddy container in front of web + api)
  - VI. Multi-User By Default → VI. Multi-User By Default, Three Principal Kinds
- Added sections:
  - IX. Bounded Contexts and Vertical Slices
  - X. Commands, Queries and Streams Are Separate
  - XI. Times Belong to the User
  - XII. Three Kinds of Configuration
- Removed sections: none
- Templates requiring updates:
  - .specify/templates/plan-template.md ✅ Constitution Check section is generic; the
    blueprint plan (specs/013) shows the twelve-row table every phase plan must copy
  - .specify/templates/spec-template.md ✅ no change needed (no tech in specs still holds)
  - .specify/templates/tasks-template.md ✅ no change needed; phase task lists add a
    "cross-cutting checklist" (see specs/013/tasks.md) — recommended, not mandated by template
  - CLAUDE.md ✅ updated alongside this amendment
- Follow-up TODOs: none
-->

# Botvy Constitution

## Core Principles

### I. The API Owns All Data; Each Context Owns Its Store
The NestJS API (the `backend` and `worker` processes built from one codebase) is the
only process permitted to read or write application data. n8n, the phone, the
web app and the Chrome extension interact exclusively through the API. Inside
the API, each bounded context owns its store: Identity & Access owns PostgreSQL
(users, credentials, refresh tokens, devices, service clients); every other
context owns its MongoDB collections. A context MUST NOT read or write another
context's tables or collections; it asks through a query handler or reacts to an
event. There are no cross-store joins and no distributed transactions — Identity
publishes events after commit and consumers are idempotent.
Rationale: a single writer per store eliminates concurrency bugs and keeps
validation and auth in one reviewable place; store-per-context keeps the seams
that let a context become its own service later without a rewrite.

### II. n8n Is Workflow Infrastructure Only
Every n8n workflow is exported as JSON and committed to the repo (git is the
source of truth, not the running instance). A workflow MUST NOT contain a
database node, MUST NOT mount a data volume, and MUST call the API only through
`/internal/*` endpoints authenticated with a service-client token. n8n receives
domain events only as signed webhooks from the API's outbox relay. The n8n editor
and REST API are never exposed to the public internet.
Rationale: n8n is a scheduler and an automation subscriber, not an application;
credential- and data-light workflows cannot leak or corrupt user data, and
workflows-as-code make deploys reproducible.

### III. Local-First LLM
All model inference runs against a locally hosted Ollama server. No cloud LLM
provider may be called for product functionality. Model names, context size and
generation limits are operator settings, not code. Structured extraction MUST use
grammar-constrained (JSON-schema) decoding and MUST fall back to a plain reply on
failure; arithmetic (BMI, relative times, dates) is done in code, never by the
model. Fine-tuning requires a written justification in a feature spec.
Rationale: independence from token-metered APIs is the purpose of this system;
small local models are reliable when constrained and unreliable at arithmetic.

### IV. Forward-Only Migrations
Prisma migrations (PostgreSQL) and `migrate-mongo` scripts (MongoDB), once
committed, are never edited or rolled back in place; a correction is a new
migration. Every MongoDB document carries `schemaVersion`. The phone's drift
database bumps `schemaVersion` together with a matching `MigrationStrategy`
branch in the same change, guarded so a column added to a table created in an
earlier branch is not added twice; every bump ships a test that opens a
hand-built old-schema file.
Rationale: mutating history breaks every environment that already applied it;
on the phone, a missing branch makes every existing install refuse to open.

### V. Single Public Surface
Exactly one container publishes a port: the Caddy edge, which routes `/` to the
web app and `/api/*`, `/graphql`, `/ws`, `/health`, `/media` to the API. It is
reached through one named Cloudflare tunnel or the LAN. PostgreSQL, MongoDB,
n8n, the worker and Ollama MUST remain on the Docker network or localhost and
are never tunnelled or port-forwarded.
Rationale: one audited, authenticated entry point; the old quick-tunnel exposed
an entire editor.

### VI. Multi-User By Default, Three Principal Kinds
Every table, collection, endpoint, resolver, socket room and prompt-assembly
path is scoped by user from the first migration — no singleton rows, no
identity-by-device shortcuts. Every request carries a principal of kind `user`
(role `user` or `admin`), or `service` (a service client with scopes). Guards
enforce kind and role: member routes refuse service principals, `/internal/*`
refuses user tokens, admin routes require the admin role. Authentication is JWT
access + DB-backed rotating refresh with reuse detection; Google Sign-In tokens
are verified server-side and never stored.
Rationale: the platform is explicitly multi-device and multi-user, and machine
callers must never be able to act as a member.

### VII. Test-Then-Verify (NON-NEGOTIABLE)
No phase, feature, or task is reported complete without running its stated
verification command and showing the real output. Business logic with a branch
or calculation — intent parsing, time-zone math, recurrence expansion, sync
conflict resolution, the alert claim, the practice cut-off, allergen checks,
migrations — requires an automated test. Fixtures are written relative to the
current clock, never pinned to a date. A claim of "done", "fixed" or "passing"
without evidence is a constitution violation.
Rationale: this system runs unattended jobs and holds other people's plans; a
green incremental build proves nothing, and a pinned fixture is a time bomb.

### VIII. YAGNI
No speculative abstraction, no dependency without a present need, no new
service when an existing one satisfies the requirement, no interface with one
implementation. Each phase ships the minimum that passes its gate; deferred work
is written down, not built early. Two slices that need the same helper duplicate
it until a third needs it.
Rationale: a solo-maintained system pays for every unused moving part.

### IX. Bounded Contexts and Vertical Slices
The API is organised as bounded contexts (Identity & Access, Profile, Planning,
Reminders, Notifications, Daily Rhythm, Training, Knowledge, Nutrition,
Conversations, Meetings & Calendar, Sync, Operations). Inside a context, every
feature is one vertical slice folder holding its command or query, handler,
DTO, endpoint and test. Contexts communicate through domain events written to
the transactional outbox and relayed by the worker, or through query handlers —
never through shared services or shared collections. The shared kernel holds
only cross-cutting infrastructure (time, auth, settings, outbox, LLM client,
push, media) and helpers proven duplicated three times.
Rationale: the v1 chat service became an 802-line junction box because
boundaries followed shipping order; slices keep each capability small enough to
hold in one head.

### X. Commands, Queries and Streams Are Separate
State changes are REST commands that return an ack or an id — never a view.
Reads are GraphQL queries (or the sync pull) and never mutate. Live chat and
real-time nudges travel over one authenticated WebSocket. Offline clients
replay commands and chat through REST. A handler dispatches other contexts'
commands through the command bus, not by calling their services.
Rationale: the split keeps write rules, read shapes and streaming concerns from
tangling, and lets each client use the channel it can support.

### XI. Times Belong to the User
Every user-facing time is resolved against the member's profile time zone
through the shared time helpers. The server's own `TZ` is never read for
product logic. Scheduled prompts fire per member at their local time, claim the
date before sending, and catch up after downtime rather than skip. Wall-clock
preferences are stored as `HH:mm` strings; instants are stored as UTC.
Rationale: reading the server clock once shifted every extracted reminder by
three hours.

### XII. Three Kinds of Configuration
Secrets and connection details live in environment variables, validated at boot
(a bad one kills the process). Anything an operator might retune lives in the
`settings` registry with a schema, a default and a description, editable from
the admin portal without restart. Anything a member might want different lives
in their preferences, seeded from the operator defaults. Constants in code are
for values that never change.
Rationale: retuning must not need a deploy; members must not need an operator.

## Technology & Deployment Constraints

Backend: NestJS (TypeScript, Node 24 LTS) with `@nestjs/cqrs`; Prisma against
PostgreSQL 16 for Identity; Mongoose against MongoDB 8 (single-node replica set,
required for transactions and change streams) for all other contexts; GraphQL
code-first with Apollo for queries; Socket.IO for chat and nudges; `ollama` client
for inference. Mobile: Flutter with Bloc/Cubit, drift/SQLite, Material 3 themed
from shared tokens, English and Arabic with RTL. Web: Next.js (App Router,
standalone output) with MobX and PrimeReact, one app for the public site and the
admin portal. PC companion: a Chrome extension built with WXT, React, MobX and
Bootstrap, side panel first. Push: Firebase Cloud Messaging for the phone only.
Automation: n8n. Edge: Caddy. Delivery: Docker Compose, images on GHCR built by
GitHub Actions, deployed by the release workflow; APK and extension built in CI.
The full stack MUST be transferable — buildable from the repository and runnable
from published images plus documented prerequisites (Docker, a running Ollama
with the configured models, and a tunnel token or LAN-only operation).

## Development Workflow

The platform is planned once in the blueprint (`specs/013-platform-v2-blueprint`)
and delivered in numbered phases, each a spec-kit feature on its own branch:
`/speckit-specify` → `/speckit-clarify` when ambiguity exists → `/speckit-plan`
(with the twelve-row Constitution Check) → `/speckit-tasks` →
`/speckit-checklist` → `/speckit-analyze` → `/speckit-implement`. A phase lands
only when its gate in the blueprint's `tasks.md` passes with recorded output.
Botvy v1 (`legacy/` after the foundation phase, and `E:\Software\automation\botvy`
before it) is a read-only reference until v2 reaches feature parity and v1 is
explicitly decommissioned in the hardening phase.

## Governance

This constitution supersedes any conflicting ad-hoc practice. Amending it
requires: (1) a written rationale, (2) a version bump per the policy below,
(3) a check of `.specify/templates/plan-template.md`, `spec-template.md`,
`tasks-template.md` and `CLAUDE.md` for now-outdated guidance, and (4) a commit
whose message states the amendment. Versioning is semantic: MAJOR for a
backward-incompatible principle removal or redefinition, MINOR for a new
principle or materially expanded guidance, PATCH for wording. Every phase plan
MUST carry the Constitution Check table and justify any deviation in its
Complexity Tracking section, never absorb it silently.

**Version**: 2.0.0 | **Ratified**: 2026-08-29 | **Last Amended**: 2026-09-05

# Research: Botvy v2 Platform Blueprint

**Feature**: `013-platform-v2-blueprint` | **Date**: 2026-09-05 | **Phase 0 output**

Every entry: **Decision** → **Rationale** → **Alternatives considered** → **Sources**.
Inputs: the System Anatomy survey of v0.7.0 (artifact `60bf233f`), three repository
explorations (gateway, mobile, infra/admin/n8n/CI), four web research briefs
(backend, frontend/mobile/extension, product patterns, deployment/data/spec-kit),
and the four decisions the user settled on 2026-09-05 (topology, persistence split,
chat transport, phase order).

---

## Part A — Architecture

### R-01 Topology: modular monolith, two deployables

- **Decision**: One NestJS codebase with bounded contexts as modules. Two processes
  built from it — `api` (REST + GraphQL + WebSocket) and `worker` (outbox relay,
  LLM jobs, link ingestion, sweeps) — selected by `BOTVY_ROLE`. Contexts never read
  another context's collections; they communicate through events.
- **Rationale**: solo maintenance on one host. The v1 survey's pressure point 05
  showed a whole container costing more than the two cron entries it ran. Seams
  (own store per context, events only) mean any context can be lifted into its own
  service later without a rewrite. Satisfies "treat each service as standalone
  responsibility" at the module boundary rather than the container boundary.
- **Alternatives**: (a) one service per context — 8+ containers, cross-service auth,
  distributed debugging, rejected by the user on 2026-09-05; (b) single process
  doing both edge and jobs — LLM generation and ingestion would starve request
  latency; rejected.
- **Sources**: survey §pp-05; constitution VIII (YAGNI);
  https://github.com/mehdihadeli/nestjs-vertical-slice-template

### R-02 Persistence split: Identity on PostgreSQL, everything else on MongoDB

- **Decision**: The Identity & Access context keeps PostgreSQL 16 with Prisma 6
  (tables `users`, `refresh_tokens`, `devices`, `service_clients`). All other
  contexts use MongoDB 8. Other contexts obtain user facts only through Identity's
  query handlers, never by touching Postgres. `userId` in Mongo documents is the
  Postgres `users.id` uuid as a string. No cross-store joins, no distributed
  transactions; Identity changes propagate as outbox events.
- **Rationale**: user decision (2026-09-05): "user management and authorization
  will be maintained across postgres, otherwise on mongoDB". It preserves the v1
  auth code (argon2, rotating refresh, Google exchange, admin seed) nearly verbatim
  and keeps existing accounts. Postgres is already running for n8n. DDD permits a
  store per context.
- **Alternatives**: all-Mongo (simpler ops, but rewrites proven auth and drops
  accounts); all-Postgres (contradicts the MongoDB requirement).
- **Sources**: user answer 2026-09-05; `apps/gateway/prisma/schema.prisma`;
  `apps/gateway/src/auth/*`.

### R-03 MongoDB access layer: Mongoose via `@nestjs/mongoose`

- **Decision**: `@nestjs/mongoose` 11 (Mongoose 8) with hand-rolled repository
  classes at aggregate boundaries; schema classes per aggregate; discriminators for
  polymorphic sub-documents.
- **Rationale**: first-class Nest integration; embeds value objects naturally;
  references other aggregates by id only. Prisma's Mongo connector is behind its
  SQL connectors (no `createMany skipDuplicates`, weaker discriminators). Typegoose
  is a decorator layer over Mongoose — solves nothing `@nestjs/mongoose` schema
  factories do not. MikroORM's Mongo driver is less battle-tested than its SQL drivers.
- **Alternatives**: Prisma (Mongo connector), Typegoose, MikroORM.
- **Sources**: https://www.npmjs.com/package/@nestjs/mongoose ;
  https://www.mongodb.com/docs/manual/core/transactions-production-consideration/

### R-04 MongoDB runtime: single-node replica set, `mongodump` backups

- **Decision**: `mongo:8` with `--replSet rs0`; a healthcheck that runs
  `rs.status()` and falls back to `rs.initiate(...)` on first boot. A `mongodump`
  cron container writes logical backups to a host volume. Compass for ops, no
  mongo-express.
- **Rationale**: multi-document transactions and change streams (needed for the
  outbox) require a replica set. Logical dumps are portable and selectively
  restorable; mongo-express is not production-grade.
- **Alternatives**: standalone `mongod` (no transactions); volume snapshots (harder
  to verify, point-in-time only).
- **Sources**: https://www.mongodb.com/docs/manual/changeStreams/ ;
  https://anthonysimmon.com/the-only-local-mongodb-replica-set-with-docker-compose-guide-youll-ever-need/ ;
  https://www.mongodb.com/docs/manual/core/backups/ ;
  https://github.com/istepanov/docker-mongodump ;
  https://www.mongodb.com/docs/manual/release-notes/8.0

### R-05 Identifiers: client-minted UUIDv7 for syncable aggregates

- **Decision**: Syncable aggregates (tasks, labels, reminders, meetings,
  conversations, programs, workouts, meals, links) use a client-generated UUIDv7
  string as `_id`. Server-only collections (outbox, alerts, usage, audit) use
  ObjectId. `(userId, clientId)` uniqueness where still needed uses a partial
  index (`clientId: {$exists: true}`).
- **Rationale**: v1 already mints conversation ids on the phone so a message can
  name its thread with no round trip; offline task creation needs the same. UUIDv7
  is time-ordered, so index locality is close to ObjectId. Postgres treats NULLs as
  distinct in unique constraints; Mongo does not — hence the partial index.
- **Alternatives**: ObjectId everywhere (server-minted; forces a temp-id remap on
  the client); UUIDv4 (random, poor index locality).
- **Sources**: survey §L2 "Client-minted identity"; gateway exploration §5 item 2;
  https://wildandfreetools.com/blog/uuid-in-mongodb-vs-objectid/

### R-06 CQRS: `@nestjs/cqrs`

- **Decision**: `@nestjs/cqrs` 11 — CommandBus, QueryBus, EventBus, Sagas. One
  folder per vertical slice containing command|query, handler, DTO/validator,
  endpoint (controller or resolver) and spec.
- **Rationale**: official module; no custom mediator to maintain; sagas give
  process managers (e.g. Daily Rhythm reacting to TaskCompleted) without a broker.
- **Alternatives**: hand-written mediator; plain services without CQRS (rejected —
  user requirement).
- **Sources**: https://docs.nestjs.com/recipes/cqrs ;
  https://github.com/gm50x/nestjs-cqrs-ddd

### R-07 Read models: query write collections, denormalise selectively

- **Decision**: GraphQL query handlers read the write collections with projection.
  Only two denormalised views: the `daily_plans` snapshot (Daily Rhythm) and the
  label name+colour snapshot embedded on each task (Extended Reference pattern).
- **Rationale**: 2025-26 guidance converges on "CQRS at hotspots, not system-wide".
  A separate read database is a second thing to keep consistent for one maintainer.
- **Alternatives**: dedicated read-model collections per query; a separate read DB.
- **Sources**: https://www.mongodb.com/docs/manual/data-modeling/design-patterns/ ;
  https://martinuke0.github.io/posts/2025-12-06-cqrs-a-practical-guide-to-command-query-responsibility-segregation/

### R-08 Cross-slice events: transactional outbox + change-stream relay

- **Decision**: Domain events are appended to an `outbox` collection in the same
  Mongo transaction as the aggregate write. The `worker` opens a change stream on
  `outbox`, dispatches each event to in-process handlers (EventBus) and to
  registered n8n webhooks, then marks it delivered. Events carry a UUID for
  idempotent consumers. Identity (Postgres) writes its events to the Mongo outbox
  after commit (at-least-once; consumers idempotent).
- **Rationale**: no broker justified on one host; change streams beat polling
  (no cadence, no missed window). n8n subscribes by webhook, satisfying "automation
  workflow or background job for those events".
- **Alternatives**: Redis + BullMQ, NATS, RabbitMQ (each a new process to run and
  back up); outbox polling (cadence + hot-scan).
- **Sources**: https://oneuptime.com/blog/post/2026-03-31-mongodb-outbox-pattern-reliable-events/view ;
  https://github.com/xeno097/transactional-outbox-pattern-with-mongodb ;
  https://judoscale.com/blog/node-task-queues

### R-09 Queries: GraphQL code-first with Apollo

- **Decision**: `@nestjs/graphql` 13 code-first, Apollo driver on Express. Per-
  request DataLoader for point lookups; `_id` cursor pagination; a `GqlAuthGuard`
  reusing the same Passport JWT strategy as REST.
- **Rationale**: ecosystem and tooling outweigh Mercurius's throughput edge at this
  QPS. DataLoader only for keyed lookups, never for paginated lists.
- **Alternatives**: Mercurius/Fastify (+60–89% throughput under load, irrelevant
  here); REST for queries (contradicts requirement).
- **Sources**: https://dev.to/v_diachenko/i-benchmarked-nestjs-graphql-express-vs-fastify-vs-mercurius-heres-what-actually-won-47lh ;
  https://www.graphql-js.org/docs/n1-dataloader/ ;
  https://medium.com/@prinpulkes/adding-graphql-guards-to-a-nestjs-project-1bfa6287c5ef

### R-10 Chat transport: WebSocket (Socket.IO)

- **Decision**: `@nestjs/platform-socket.io`; JWT presented in the handshake
  `auth` payload. Client → server: `chat.send`, `chat.cancel`. Server → client:
  `chat.intent`, `chat.token`, `chat.moved`, `chat.done`, `chat.error`, plus
  server-initiated `chat.message` (coach-initiated) and `sync.nudge`. Offline
  messages still replay through REST `POST /api/v1/conversations/batch`.
- **Rationale**: user asked for a handshake connection; the bidirectional needs are
  real — cancel mid-generation, the coach writing the check-in question into the
  chat, and a real-time sync nudge for the Chrome extension where FCM is not
  viable. Constitution v1 preferred SSE "unless a feature demonstrates a genuine
  need" — this is that demonstration.
- **Alternatives**: SSE (v1; unidirectional, no cancel, no server push to the
  extension); GraphQL subscriptions over WS (industry moving away for token
  streams).
- **Sources**: user answer 2026-09-05;
  https://wundergraph.com/blog/deprecate_graphql_subscriptions_over_websockets ;
  https://docs.nestjs.com/websockets/gateways ;
  https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle

### R-11 Authentication

- **Decision**: email/password (argon2) with confirm-password on the client and a
  minimum of 8 characters server-side; Google Sign-In verified server-side with
  `google-auth-library` `verifyIdToken` (mobile, extension) and the OAuth
  authorisation-code flow (web); JWT access token 15 min + DB-backed rotating
  refresh token with reuse detection (family revocation). Login accepts a bare
  username so the seeded `admin` account keeps working.
- **Rationale**: 2026 consensus; v1 code carries over (`auth.service.ts`,
  `admin-seed.service.ts`).
- **Alternatives**: session cookies (poor fit for mobile + extension); Keycloak/
  Auth0 (new service or cloud dependency).
- **Sources**: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token ;
  https://syskool.com/refresh-tokens-and-token-rotation-in-nestjs-secure-jwt-authentication/ ;
  `apps/gateway/src/auth/auth.service.ts`

### R-12 Authorisation: roles + principal kinds

- **Decision**: `RolesGuard` + `@Roles('admin')` for the two roles. Every request
  carries a `principal` of kind `user` (with role) or `service` (with client id).
  Handlers that must not be called by services check `principal.kind`.
- **Rationale**: two roles do not justify CASL; the kind field is what separates
  machine callers from users, as the user asked.
- **Alternatives**: CASL/policy guards — adopt only when per-record permissions
  appear.
- **Sources**: https://medium.com/@auscaydev/mastering-authorization-in-nestjs-from-rbac-to-advanced-policy-guards-55a452c1e70b

### R-13 Machine-to-machine auth: static service tokens

- **Decision**: `service_clients` rows (Postgres) each hold a hashed long random
  token and a scope list; callers send `Authorization: Bearer <token>` (n8n keeps
  `X-Service-Token` for compatibility). `ServiceTokenGuard` uses `timingSafeEqual`
  and rejects user JWTs.
- **Rationale**: n8n has no native OAuth2 client-credentials for outbound calls
  (open feature request). mTLS is overkill inside one compose network.
- **Alternatives**: OAuth2 client credentials; mTLS.
- **Sources**: https://community.n8n.io/t/authenticate-the-public-api-and-webhooks-with-oauth2-bearer-tokens-from-the-configured-sso-idp-client-credentials-m2m/289854 ;
  `apps/gateway/src/internal/service-token.guard.ts`

### R-14 LLM: Ollama, official client, models as settings

- **Decision**: `ollama` npm client against native `/api/chat`; `format` = JSON
  schema for extraction (decoding grammar); settings keys `llm.chatModel`,
  `llm.extractModel`, `llm.summarizeModel`, one shared `llm.numCtx`. Default
  `qwen2.5:3b-instruct` (fits the current host); `qwen3:4b` or `gemma3:4b` when
  VRAM allows; `phi4-mini` as a CPU-only summariser option.
- **Rationale**: v1 measured 39 s to first token when two calls used different
  context sizes (model reload); grammar-constrained extraction took it from 528 s
  to seconds. Cloud LLMs remain forbidden (constitution III).
- **Alternatives**: OpenAI-compatible shim (loses `format`/`think`/`num_ctx`);
  raw fetch (v1; the client wraps NDJSON streaming with types).
- **Sources**: https://ollama.com/blog/streaming-tool ; https://www.npmjs.com/package/ollama ;
  survey §L6; `SETUP.md` (qwen3:4b VRAM spill note)

### R-15 Background work: n8n cron for schedules, worker for event-driven jobs

- **Decision**: fixed-cadence schedules stay n8n cron → `/internal/*` (sweep, tick).
  Event-triggered work (link ingestion, suggestion generation, meal line) runs in
  `worker` consuming the outbox. No Agenda/BullMQ.
- **Rationale**: per-user local-time scheduling is a data-driven decision the tick
  already makes in code; ingestion is naturally event-triggered. Agenda
  (`@agendajs/mongo-backend`) is current and Mongo-native — the documented upgrade
  path if data-driven schedules outgrow the tick.
- **Alternatives**: Agenda; BullMQ (needs Redis); `@nestjs/schedule` (no visibility
  when it stops — the exact failure the `ops.*` signal exists to catch).
- **Sources**: https://github.com/agenda/agenda/releases ; survey §F4

### R-16 Content ingestion

- **Decision**: `@mozilla/readability` + `jsdom` for articles/sites; `youtubei.js`
  for YouTube transcripts and playlist listing (playlist → one child link per
  video); map-reduce summarisation in ~2–4K-token chunks with the local model;
  images/media referenced by URL through the existing signed `/media` proxy.
- **Rationale**: Node-native, no Python sidecar. `youtubei.js` uses YouTube's
  internal API — against the ToS for anything beyond low-volume personal use; the
  feature is per-user, self-hosted, and documented as such; `yt-dlp` is the
  fallback if it breaks.
- **Alternatives**: `@extractus/article-extractor` (same algorithm, friendlier
  API); `trafilatura` (best F1, Python); `yt-dlp` (binary dependency).
- **Sources**: https://chuniversiteit.nl/papers/comparison-of-web-content-extraction-algorithms ;
  https://developers.google.com/youtube/terms/api-services-terms-of-service ;
  https://www.npmjs.com/package/@extractus/article-extractor

### R-17 Recurrence: RRULE stored, occurrences computed

- **Decision**: meetings and recurring tasks store `DTSTART`, an RFC 5545 `RRULE`
  string, `exdates[]`, and `overrides[]` (per-occurrence changes keyed by original
  start). Occurrences are expanded on read for the requested window with the
  `rrule` library; never materialised as rows. Recurring tasks add a mode:
  `from-schedule` vs `from-completion`.
- **Rationale**: Google Calendar and iCalendar both model moved instances as
  exceptions, not rule edits; Todoist's `every!` shows the completion-based mode
  must be explicit.
- **Alternatives**: materialised occurrence rows (cache only, never source of truth).
- **Sources**: https://www.nylas.com/blog/calendar-events-rrules/ ;
  https://icalendar.org/iCalendar-RFC-5545/3-8-5-1-exception-date-times.html ;
  https://www.triedandloved.com/post/todoist-recurring-tasks-and-subtasks

### R-18 Offline sync: hand-rolled v2 with per-entity adapters

- **Decision**: keep the v1 protocol semantics (two timestamps, tombstones, purge
  horizon, lagged cursor, rejections carrying the authoritative row) and
  generalise it: each context implements a `SyncableEntity` adapter (`pull(since)`,
  `apply(change)`), the Sync facade composes them. Mobile uses one drift sync mixin
  for every synced table.
- **Rationale**: the v1 design is documented, tested (921-line sync test) and
  working. PowerSync's MongoDB connector is beta and adds a sync service to a host
  already running Postgres, Mongo, n8n, Ollama, Caddy.
- **Alternatives**: PowerSync (re-evaluate once per year), Ditto (paid connector,
  full CRDT fabric), ElectricSQL (Postgres-only).
- **Sources**: https://www.powersync.com/blog/powersync-mongodb-connector-module-now-in-beta ;
  https://docs.ditto.live/cloud/mongodb-connector ; survey §F2;
  `apps/mobile/lib/src/sync/sync_service.dart`

### R-19 Web: Next.js 16 + MobX + PrimeReact

- **Decision**: one Next.js 16 app (App Router, `output: 'standalone'`) with route
  groups `(marketing)` and `(admin)`. MobX via `mobx-react-lite`; observer
  components are client components; stores are created per request inside a
  client Provider with `useState(() => new Store())`; `enableStaticRendering` on
  the server. PrimeReact pinned to the current MIT release line; upgrade to a
  PrimeUI-licensed major only after a licence review.
- **Rationale**: single deploy, shared auth; a module-level MobX singleton would
  leak one user's data into another's SSR response. PrimeTek's 2026 licence change
  applies to future majors only.
- **Alternatives**: two Next apps; Vite SPA served by the API (v1 — breaks with a
  Next server anyway); Tailwind-only UI.
- **Sources**: https://github.com/mobxjs/mobx/discussions/3805 ;
  https://primeui.dev/nextchapter ; https://github.com/primefaces/primereact/issues/5291 ;
  https://docs.docker.com/guides/nextjs/

### R-20 Chrome extension framework: WXT

- **Decision**: WXT (Vite-based, MV3-first, framework-agnostic) with React, MobX
  and Bootstrap 5. Side panel (`chrome.sidePanel`) as the primary surface plus a
  context-menu quick capture ("add selection as task / page as link").
- **Rationale**: Plasmo describes itself as in maintenance mode (core stalled at
  0.90.5, May 2025); CRXJS is volunteer-maintained; WXT ships weekly and imposes no
  SDK lock-in. The side panel re-mounts on close, so state lives in
  `chrome.storage` (settings, tokens) and IndexedDB via Dexie (entity cache;
  `chrome.storage.local` is capped at 10 MB).
- **Alternatives**: Plasmo, CRXJS, plain Vite + manifest.
- **Sources**: https://dev.to/extensionbooster/plasmo-vs-crxjs-vs-wxt-which-chrome-extension-framework-should-you-use-in-2026-37o4 ;
  https://developer.chrome.com/docs/extensions/reference/api/sidePanel ;
  https://developer.chrome.com/docs/extensions/reference/api/storage

### R-21 Extension realtime: WS while alive, alarms, sync-on-open

- **Decision**: the extension keeps the Socket.IO connection open while its
  service worker is alive (Chrome ≥116 extends SW lifetime on socket activity),
  reconnects via `chrome.alarms`, and always syncs on side-panel open. No FCM in
  the extension. Sign-in via `chrome.identity.launchWebAuthFlow` against the API's
  Google flow, or email/password.
- **Rationale**: FCM in MV3 goes through legacy `chrome.gcm`; MV3 workers are
  ephemeral. Botvy's sync is already tolerant of gaps.
- **Alternatives**: `chrome.gcm`; polling only; offscreen document for a permanent
  socket (fallback if needed).
- **Sources**: https://developer.chrome.com/docs/extensions/how-to/integrate/chrome.gcm ;
  https://groups.google.com/a/chromium.org/g/chromium-extensions/c/23pCzk69Ueo ;
  https://developer.chrome.com/docs/extensions/reference/api/identity

### R-22 Mobile UI: Material 3 + `flex_color_scheme` + shared tokens

- **Decision**: Material 3 as the foundation, themed through `flex_color_scheme`
  from `packages/tokens` (seed colours, radii, spacing, type scale). Soft cards,
  large greeting header and quick-prompt chips (the reference screenshots) are
  achieved with M3 components and tokens. No third-party kit as the foundation.
- **Rationale**: the app serves English and Arabic; Material 3 has proven RTL
  (`Directionality`) and screen-reader semantics. forui, shadcn_flutter and
  moon_design have no documented RTL or accessibility audit.
- **Alternatives**: forui, shadcn_flutter, moon_design, fluent_ui.
- **Sources**: https://forui.dev/ ; https://leancode.co/blog/right-to-left-in-flutter-app ;
  https://dinkomarinac.dev/blog/flutter-design-systems-exploring-modern-alternatives-to-material-design/

### R-23 Mobile architecture: Bloc/Cubit, feature-first, drift

- **Decision**: `flutter_bloc` 9 Cubits (v1 Notifiers map 1:1: same state classes,
  same method bodies), feature-first folders (`features/<name>/{presentation,
  application,domain,data}`), `go_router` 18, `get_it` for composition, `drift`
  2.34 kept for SQLite (reactive streams, migrations, type-safe queries).
- **Rationale**: user requirement (Bloc/Cubit, SQLite); v1's `database.dart`,
  `sync_service.dart`, `local_notifications.dart`, `api/*`, `push.dart` and all 13
  tests port unchanged because none touch Riverpod.
- **Alternatives**: Riverpod (v1), `auto_route`, `sqflite`/`sqlite_async`.
- **Sources**: mobile exploration §1–§9; https://pub.dev/packages/flutter_bloc ;
  https://luci-studio.com/blog/the-flutter-local-database-landscape-in-2026-a-maintenance-first-guide-fe6d267c/

### R-24 Mobile packages

- **Decision**: `google_sign_in` 7 (`initialize()` + `authenticate()` API),
  `firebase_messaging`, `flutter_local_notifications` + `timezone` (exact alarm
  with `inexactAllowWhileIdle` fallback), `image_picker` + `image_cropper` for the
  profile photo, `table_calendar` (free), `flutter_markdown_plus`,
  `socket_io_client`, `graphql_flutter` (server-computed reads only), `dio`,
  `flutter_secure_storage`, `connectivity_plus`, `uuid`, `intl`.
- **Rationale**: `flutter_markdown` is discontinued; `syncfusion_flutter_calendar`
  is licence-gated; mobile reads local SQLite for everything synced, so GraphQL is
  needed only for read models that are not synced (ingestion status, suggestions).
- **Alternatives**: `ferry` (codegen GraphQL), `syncfusion_flutter_calendar`.
- **Sources**: https://github.com/flutter/flutter/issues/162966 ;
  https://isaacadariku.medium.com/google-sign-in-flutter-migration-guide-pre-7-0-versions-to-v7-version-cdc9efd7f182

### R-25 Shared TypeScript packages

- **Decision**: `packages/contracts` (OpenAPI JSON emitted by the API, GraphQL
  SDL, generated TS types, JSON-schema for events), `packages/sdk` (typed fetch
  client, Socket.IO client wrapper, MobX stores: auth/tokens, tasks, meetings,
  sync) consumed by web and extension, `packages/tokens` (design tokens). All
  browser-safe ESM: no Node built-ins, no DOM globals in code reachable from the
  extension service worker.
- **Rationale**: the survey's pressure point 02 — the domain written three times by
  hand. The v1 admin token store with single-flight refresh ports into the SDK.
- **Alternatives**: none (v1 had zero shared packages despite `packages/*` in the
  workspace file).
- **Sources**: survey §pp-02; admin exploration §1;
  https://dev.to/lico/step-by-step-guide-sharing-types-and-values-between-react-esm-and-nestjs-cjs-in-a-pnpm-monorepo-2o2j

### R-26 Public edge: Caddy

- **Decision**: a `caddy` container is the only published port. Routes: `/` →
  `web:3000`; `/api/*`, `/graphql`, `/ws`, `/health`, `/media` → `api:8080`.
  Cloudflare tunnel (or LAN) targets Caddy only.
- **Rationale**: v1 kept one origin by having the gateway serve the SPA; a Next
  server breaks that. Caddy keeps constitution V (single public surface) true with
  one small container and works identically with or without the tunnel.
- **Alternatives**: cloudflared ingress rules with two hostnames (no LAN story);
  nginx; Next.js rewrites proxying the API (couples deploys).
- **Sources**: infra exploration §2 and closing note.

### R-27 Runtime, images, CI/CD

- **Decision**: Node 24 LTS; pnpm 9 workspace; 3-stage Dockerfiles for `api`
  (also runs `worker` via `BOTVY_ROLE`) and `web` (standalone). GitHub Actions:
  build + test every app on PR; on tag build images to GHCR; deploy job over SSH
  runs `docker compose pull && docker compose up -d` with the image tag in `.env`.
  Flutter APK via `subosito/flutter-action` (+ optional Firebase App Distribution);
  extension zipped as an artifact (Web Store upload optional).
- **Rationale**: v1 CI had no deploy stage at all; the image job was opt-in.
- **Alternatives**: Docker Hub (v1), watchtower auto-pull, self-hosted runner.
- **Sources**: https://endoflife.date/nodejs ;
  https://ecostack.dev/posts/automated-docker-compose-deployment-github-actions/ ;
  https://github.com/subosito/flutter-action ;
  https://github.com/mnao305/chrome-extension-upload

### R-28 Host

- **Decision**: recommend Linux (bare metal or WSL2 with docker-ce) for the
  production host; Docker Desktop remains fine for development. Ollama stays
  host-native for GPU access.
- **Rationale**: Docker Desktop is heavier and desktop-oriented; bind mounts on
  `/mnt/c` are ~10× slower.
- **Sources**: https://arg-software.medium.com/goodbye-docker-desktop-run-linux-docker-natively-on-windows-with-wsl2-178ebb1deb51

### R-29 Migrations

- **Decision**: Prisma migrations for Postgres (Identity), `migrate-mongo` scripts
  for MongoDB, both forward-only; every Mongo document carries `schemaVersion`
  (MongoDB Schema Versioning pattern); mobile drift keeps its version ladder rule.
- **Sources**: constitution IV;
  https://www.mongodb.com/company/blog/building-with-patterns-the-schema-versioning-pattern

### R-30 Spec-kit usage

- **Decision**: this blueprint (`013`) is the umbrella — business, architecture,
  data, contracts, roadmap. Each implementation phase (`014`–`025`) is its own
  spec-kit feature with `spec.md`, `plan.md`, `tasks.md`, gated by
  `/speckit-analyze` and a `/speckit-checklist` before implementation.
- **Rationale**: spec-kit's own guidance and this repo's practice are one feature
  per folder; a single giant spec would never be "done".
- **Sources**: https://github.com/github/spec-kit/releases ;
  https://github.github.io/spec-kit/reference/overview.html

---

## Part B — Product patterns adopted (from reference apps)

### P-01 Tasks (Todoist, TickTick, Things 3)

- Priority is a fixed 4-level enum (P1–P4) with fixed colours, independent from
  labels. Labels are user-defined, coloured (default palette or custom hex).
- "Today", "Upcoming", "Overdue" are saved filters over the same collection, not
  stored lists. The "To Do — Today" heading is a view, not a label.
- Recurring tasks store a mode: from-schedule (`every`) vs from-completion
  (`every!`).
- Added: `estimatedMinutes` (enables timeboxing later), `deferCount` (Sunsama's
  "carried over" counter drives the end-of-day nudge).
- Sources: https://www.usecarly.com/blog/how-to-use-natural-language-in-todoist/ ;
  https://upbase.io/blog/ticktick-vs-todoist/ ;
  https://www.triedandloved.com/post/todoist-recurring-tasks-and-subtasks

### P-02 Daily rituals (Sunsama, Motion)

- Evening ritual = review today, roll unfinished tasks forward (increment
  `deferCount`), confirm tomorrow's short list. Morning ritual = the plan for
  today with the training slot. Botvy's 22:00 / 08:00 prompts map onto these.
- Unfinished tasks are never silently re-dated; the rollover is explicit and
  counted.
- Sources: https://get-alfred.ai/blog/sunsama-vs-motion ;
  https://super-productivity.com/blog/best-sunsama-alternatives-2026/

### P-03 Training (Hevy, Fitbod, TrainingPeaks)

- Program → Week → Session → Exercise → Set, with `sport` on the session, not a
  schema per sport. Sets carry target and actual values so progression rules can
  be applied later.
- "Current or next practice" is a query over sessions (nearest ongoing/future,
  with the user's cutoff hour), not an entity. Rest days are the absence of a
  session.
- Sources: https://www.sensai.fit/blog/hevy-vs-strong-vs-fitbod ;
  https://www.corahealth.app/compare/training-peaks

### P-04 AI coaching (Rocky.ai, Fabulous, Noom, Headspace)

- Check-ins are lightweight time-series rows (date, mood 0–100, adhered, note),
  decoupled from the chat log. A low mood routes to a different quick-reply set and
  coach tone (Noom's reactive branch).
- Streak visualisation kept (Fabulous); coaching interactions kept short (~5 min).
- Sources: https://www.rocky.ai/app ; https://www.forbes.com/health/mind/noom-mood-review/

### P-05 Meetings & calendar (Google Calendar, Fantastical, Calendly)

- Recurrence as rule + exceptions (R-17). Location is two optional fields: online
  link, physical address. Reminders per meeting are a list of minute offsets.
  Optional "lock time zone" flag for in-person recurring meetings.
- Sources: https://flexibits.com/fantastical/help/invitations ;
  https://calendly.com/blog/guide-calendly-reminders

### P-06 Extension companions (Todoist, Clockwise)

- Side panel for the persistent "today" view (Clockwise) plus right-click capture
  of a selection or the current page (Todoist). One primary surface, not both
  popup and panel.
- Sources: https://www.todoist.com/downloads/chrome ;
  https://www.chromeanalyzer.com/content/blog/clockwise-ai-calendar-scheduling-assistant-behind-the-code-how-the-chrome-extension-really-works/

### P-07 Link-based learning (Glasp, Readwise Reader, Recall)

- Each link shows a visible processing state, including failed + retry (none of
  the references document failure UX — Botvy designs it explicitly).
- "Summarise before consuming" for videos; playlists expand into child rows;
  summaries cite their source link.
- Sources: https://glasp.co/ai-summary ; https://feedback.recall.it/feature-requests/p/reader-readwise-features

---

## Part C — Unknowns resolved from the brief

| Brief said | Resolved as |
|---|---|
| "set it by 10pm by default … remind at the end of the day with the highest priority tasks in the next day and if the user has a training" | One evening ritual at `eveningPlanTime` (22:00): shows tomorrow's draft (top-priority tasks + training flag), asks to confirm/edit. No separate nudge time; adding one later is a single preference. |
| "next day practice if the clock passed 9 o'clock (configurable)" | `nextPracticeCutoff` preference, default 21:00 local. |
| "an optional label" | One label per task (`labelId`), snapshot of name + colour on the task. Many-to-many not modelled (YAGNI; array upgrade is a small migration). |
| "meals should be generic" | `mealMode` preference: `llm` (generic suggestion) or `library` (rotate the user's own meals, no LLM call). Allergies always excluded; a suggestion containing a declared allergen is withheld. |
| "hand-shake connection" | WebSocket (R-10). |
| "roles for authorization for now" | user/admin + service principals (R-12, R-13). |
| "the training program considered a todo task but managed from another screen" | Training sessions are projected into Today as a virtual item; never stored as a task. |
| "two pinned chats" | `coach` and `planner` conversations created on registration, pinned, undeletable (clearable). |
| v1 data | Accounts carry over (same Postgres). Other v1 rows not migrated (assumption; optional P11 script). |

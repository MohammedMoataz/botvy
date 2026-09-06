# Research: Foundation (P0)

**Feature**: `014-foundation` | **Date**: 2026-09-05 | **Parent**: `specs/013-platform-v2-blueprint/research.md` (R-01…R-30 apply unchanged)

Only decisions specific to standing the platform up are recorded here.

### F-01 Where v1 goes: a self-contained `legacy/` tree

- **Decision**: move the whole v1 shape, not its parts: `git mv apps legacy/apps`,
  `infra legacy/infra`, `workflows legacy/workflows`, plus `package.json`,
  `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `SETUP.md`, `README.md` (v1) into
  `legacy/`. New root files replace them. v1 then runs from
  `docker compose -f legacy/infra/docker-compose.yml --env-file .env up -d` with no
  edits — its Dockerfile build context `..` still resolves to a tree containing
  `apps/gateway`.
- **Rationale**: FR-018 (unchanged and runnable). Moving files individually would
  force edits to Dockerfile paths and compose contexts.
- **Alternatives**: `legacy/gateway`, `legacy/admin`… (breaks build contexts);
  deleting v1 (phones in use still talk to it).

### F-02 Identity keeps the v1 PostgreSQL database

- **Decision**: `apps/backend` connects to the same `botvy` database v1 uses. The v1
  Prisma migration history (`legacy/apps/gateway/prisma/migrations`) is copied into
  `apps/backend/src/contexts/identity/infrastructure/prisma/migrations` so
  `prisma migrate deploy` continues from where v1 left off; one new migration adds
  `refresh_tokens.family_id / replaced_by / device_id`, `devices.kind`,
  `users.google_sub / deleted_at` and the `service_clients` table. The Prisma schema
  declares only Identity models; v1's other tables stay in the database, ignored,
  until `025-hardening-release` decides on them.
- **Rationale**: existing accounts and refresh tokens carry over (blueprint
  assumption); `migrate deploy` never drops tables it does not know.
- **Alternatives**: a fresh `botvy_identity` database (loses accounts unless copied);
  `prisma db push` (no history).
- **Caveat**: never run `prisma migrate dev` against the production database — it
  would propose dropping the v1 tables. Development uses a fresh database.

### F-03 MongoDB database, migrations and the replica set

- **Decision**: database `botvy` on `mongo:27017`, connection string
  `mongodb://mongo:27017/botvy?replicaSet=rs0&directConnection=true`.
  `migrate-mongo` (ESM config in `apps/backend/migrations/mongo/`) runs from
  `bootstrap.mjs` and from the backend's `pnpm migrate:mongo`; the first migration
  creates the indexes for `settings`, `ops_heartbeats`, `audit_log`, `outbox`,
  `relay_state`, `idempotency_keys` and `pings`. The compose healthcheck runs
  `infra/mongo/init-replica.sh` (the blueprint's name for it), whose body is
  `mongosh --quiet --eval "try { rs.status().ok } catch (e) { rs.initiate({_id:'rs0',
  members:[{_id:0, host:'mongo:27017'}]}).ok }"` — a healthcheck rather than a
  one-shot init container, so a set that is somehow lost is re-initiated rather than
  leaving a container reporting healthy with no set behind it.
- **Rationale**: transactions and change streams need a replica set (R-04);
  `directConnection` avoids the driver trying to resolve the replica-set host from
  outside the compose network during development.
- **Sources**: R-04; https://www.mongodb.com/docs/manual/reference/connection-string/

### F-04 One image, two roles

- **Decision**: `apps/backend/Dockerfile` builds one image. `src/main.ts` reads
  `BOTVY_ROLE`: `backend` boots `AppModule` (HTTP + GraphQL + WebSocket on `:8080`);
  `worker` boots `WorkerModule` (outbox relay, sagas, job handlers) with a bare
  `/healthz` on `:8081` for the compose healthcheck. Both share the same contexts
  and shared kernel; the role only selects which entry modules load.
- **Rationale**: R-01; one build, one test suite, no duplicated wiring.
- **Alternatives**: two packages (duplicated dependencies and config).

### F-05 Edge: Caddy modes

- **Decision**: `infra/Caddyfile` serves `{$CADDY_SITE}` (default `:80`) and routes
  `/api/*`, `/graphql`, `/ws`, `/health`, `/media` to `backend:8080`, everything
  else to `frontend:3000`. Behind the Cloudflare tunnel the tunnel terminates TLS and
  reaches Caddy on `:80`; for LAN-only, set `CADDY_SITE=botvy.local` and
  `tls internal`. Published port `${EDGE_PORT:-80}:80` (+ `443` when TLS is local).
- **Rationale**: R-26; a configurable port avoids collisions with the v1 stack still
  running on the same host.
- **The n8n editor is the other publish, and it is deliberate**: `n8n` binds
  `${N8N_BIND:-127.0.0.1:5679}:5678`. Principle V permits exactly this — it requires
  the supporting services to stay "on the Docker network or localhost" — and a
  loopback publish is what lets the Owner reach the editor through an SSH tunnel
  instead of exposing it. On a host where v1's n8n already holds 5679 (v1's own
  compose publishes it), set `N8N_BIND` to another loopback port or to the empty
  string to drop the publish entirely; the API reaches n8n over the compose network
  either way. `verify.mjs` counts only publishes bound to a non-loopback address, so
  "exactly one public port" stays a check rather than a claim.

### F-06 CI/CD shape

- **Decision**: `.github/workflows/ci.yml` — jobs `backend` (pnpm, lint,
  `prisma generate`, `nest build`, `vitest run`), `frontend` (lint, `next build`),
  `extension` (lint, `wxt build` + zip artifact), `packages` (lint, typecheck +
  tests), `mobile` (`flutter analyze`, `flutter test`, debug APK artifact), every one
  of them with `timeout-minutes: 15`. Lint runs inside each job rather than as a
  sixth: a surface whose lint fails should fail its own job, which is what FR-016's
  "each as its own job" and US3's "the others still report" ask for. The blueprint
  lists `mobile.yml` and `extension.yml` as separate files; they are jobs here — same
  isolation, one file to keep in step (VIII). `.github/workflows/release.yml` on `v*` tags:
  build + push `ghcr.io/<owner>/botvy-backend` and `botvy-frontend`, release
  APK + extension zip as GitHub release assets, then a `deploy` job that runs over SSH
  `cd /opt/botvy && sed -i BOTVY_TAG=… .env && docker compose pull && docker compose up -d`
  only `if: secrets.DEPLOY_HOST != ''` (skipped, not failed, when unset).
- **Rationale**: FR-016/017; v1 had no deploy at all.
- **Sources**: R-27.

### F-07 Phone side-by-side with v1

- **Decision**: `apps/mobile` is a new Flutter project reusing v1's `android/`
  configuration (namespace `org.botvy.botvy`, permissions, receivers, channel id)
  with a `dev` product flavour adding `applicationIdSuffix ".dev"` so the v2 app
  installs beside v1 during development. The `dev` flavour ships without
  `google-services.json` (push off, logged); the release flavour keeps
  `org.botvy.botvy` and the Firebase app. Drift opens `botvy_v2.sqlite`.
- **Rationale**: testers keep their working v1 app; the release id decision is P11's.
- **Alternatives**: same id from day one (every dev install replaces the user's v1 app).

### F-08 Tooling

- **Decision**: Node 24 via `.nvmrc`/`engines`; pnpm 9 through corepack
  (`packageManager` in root `package.json`); TypeScript 5.x strict everywhere;
  `oxlint` + `prettier` shared from the root (`.prettierrc`, `oxlint.json`) for
  backend, packages and extension; Next.js keeps its bundled ESLint config;
  `vitest` for backend and packages; Playwright added in P9/P10 when the first
  browser test exists; `flutter_lints` on mobile. Root scripts: `pnpm lint`,
  `pnpm test`, `pnpm build`, `pnpm gen:contracts`.
- **Rationale**: continuity with v1's gateway tooling; YAGNI on Playwright.

### F-09 Logging and request context

- **Decision**: `nestjs-pino` for structured logs — pino's default line-delimited
  JSON, one object per line carrying `level`, `time`, `msg` and `req.id`, pretty-printed
  only in development. An `AsyncLocalStorage`-backed `RequestContext` carries
  `requestId`, `principal`, and — set by the CQRS interceptor — `context` and `slice`,
  so every line from a handler is attributable (FR-008). Log retention is the
  container runtime's (`json-file`, rotated by compose's `max-size` / `max-file`), not
  the application's: an application that prunes its own logs is a second thing to keep
  running.
- **Alternatives**: Nest's default logger (unstructured).

### F-10 Settings cache across two processes

- **Decision**: in-memory cache with a 60 s TTL (v1 behaviour) plus immediate
  invalidation on `operations.SettingChanged` delivered through the outbox to both
  processes. Cross-process staleness is bounded by the TTL. The TTL is a constant, not
  a registry key — a key that governed the cache would have to be read through the
  cache — and it is listed as such in the plan's constants table (XII).
- **Alternatives**: no cache (v1 pressure point 07); Redis pub/sub (new process).

### F-11 Outbox relay resumability

- **Decision**: the relay stores the change-stream resume token in `relay_state`
  after each processed event. On start it resumes from the token; if the token is
  invalid (oplog rolled over), it first drains `outbox` rows with
  `deliveredAt: null` ordered by `occurredAt`, then opens a fresh stream. Delivery
  is at-least-once; every handler is idempotent on `eventId`. Identity's events are
  picked up from PostgreSQL's `identity_outbox` (written in the same transaction as
  the change) by a 2-second poll and copied into the Mongo outbox, upsert by
  `eventId` — a post-commit write to Mongo would have been at-most-once.
- **Sources**: R-08; https://www.mongodb.com/docs/manual/changeStreams/#resume-a-change-stream

### F-12 Contract generation

- **Decision**: `pnpm gen:contracts` boots the backend in a generation mode that
  writes `packages/contracts/openapi.json` (Nest Swagger), `schema.graphql`
  (`autoSchemaFile` printed) and `events/*.schema.json` (zod → JSON schema for each
  event payload). `openapi-typescript` and `@graphql-codegen/typescript` turn them
  into `packages/contracts/src/*.ts`. Mobile uses `swagger_dart_code_generator`
  (pure Dart, `build_runner`) for REST models; GraphQL on the phone stays
  hand-written until P7 needs it.
- **Rationale**: FR-014; no Java toolchain for the Dart generator.
- **Alternatives**: `openapi-generator-cli` (Java); hand-written models (v1's
  three-times problem).

### F-13 The demonstration slice

- **Decision**: `contexts/operations/features/ping`: `POST /api/v1/ping { clientId }`
  (user) → `PingCommand` → inserts `pings` and appends `operations.Pinged` in one
  transaction → relay → in-process handler stamps `ops_heartbeats.ping` → webhook
  to `n8n /webhook/botvy/pinged` (workflow `ping_echo.json`, which only records the
  execution). `Idempotency-Key = clientId` makes a repeat a no-op (FR-012, US4).
  Removed in `016-tasks-labels-reminders` once `TaskScheduled` proves the same path.
- **Rationale**: the spine must be proven before any context is built on it.

### F-14 Design tokens seed

- **Decision**: `packages/tokens/tokens.json` starts from the v1 admin palette
  (`--bg #f6f7f9`, `--surface #fff`, `--text #14171a`, `--muted #4b5563`,
  `--accent #2563eb`, dark set as in the blueprint artifact) and a type scale; a
  build step emits `tokens.css` (custom properties, light + dark) and
  `lib/tokens.dart` (a `BotvyTokens` class feeding `flex_color_scheme`). Product
  palette work is a later, explicit design task.
- **Rationale**: one source for four surfaces from day one; no palette invented in P0.

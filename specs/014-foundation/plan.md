# Implementation Plan: Foundation (P0)

**Branch**: `014-foundation` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-foundation/spec.md`; parent blueprint
`specs/013-platform-v2-blueprint/` (plan, research R-01…R-31, data-model, contracts).

## Summary

Restructure the repository around v2 (v1 moves to `legacy/` intact), stand up the
NestJS backend as one image with two roles (`backend`, `worker`) on PostgreSQL
(Identity, Prisma) and MongoDB (everything else, Mongoose, single-node replica set),
with the shared kernel every later context depends on — time, principals and
guards, CQRS bases, **repository and unit-of-work ports with Mongo/Prisma/in-memory
adapters**, settings registry, transactional outbox with a change-stream relay,
Ollama client, push, media, structured logging — plus GraphQL and WebSocket edges,
health with heartbeats, and one demonstration slice (`ping`) proving
command → transaction → outbox → worker → handler + n8n. Around it: the three
shared packages, skeletons of the Next.js frontend, the WXT extension and the
Flutter app (sign-in screens, tokens theme, en/ar), a compose stack behind Caddy
with a backup job, and CI/CD that builds, tests and can deploy every surface.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 24 LTS (backend, frontend, extension,
packages); Dart ≥ 3.5 / Flutter stable (mobile)

**Primary Dependencies**: NestJS 12, `@nestjs/cqrs` 11, `@nestjs/mongoose` 11 +
Mongoose 8, Prisma 6, `@nestjs/graphql` 13 + `@nestjs/apollo`, `@nestjs/platform-
socket.io`, `@nestjs/passport` + `passport-jwt`, `nestjs-pino`, `zod`,
`class-validator`, `ollama`, `firebase-admin`, `migrate-mongo`, `uuid` (v7);
Next.js 16, `mobx`, `mobx-react-lite`, PrimeReact (current MIT line, pinned exact);
WXT, React 19, `mobx`, Bootstrap 5, Dexie, `socket.io-client`; `flutter_bloc` 9,
`drift` 2.34, `go_router` 18, `get_it`, `flex_color_scheme`, `dio`,
`socket_io_client`, `flutter_secure_storage`, `swagger_dart_code_generator`

**Storage**: PostgreSQL 16 (`botvy` database, Identity tables; v1 tables left in
place), MongoDB 8.0 replica set `rs0` (`botvy` database), drift SQLite
`botvy_v2.sqlite` (phone), Dexie (extension), `chrome.storage.local` (extension tokens)

**Testing**: vitest (backend, packages) with in-memory repository adapters for
handler specs and a Mongo-backed spec for the outbox/relay (uses the compose Mongo
or `mongodb-memory-server` replica set); `flutter test` (drift open + ladder
harness); frontend/extension type-check + build only in P0

**Target Platform**: Docker Compose on one Linux/WSL2 host (Docker Desktop for dev);
Android 10+ (dev flavour `org.botvy.botvy.dev`); Chrome 116+; evergreen browsers. The
documented developer loop runs from PowerShell on a Windows host as well as from a
POSIX shell; the production recommendation stays a Linux or WSL2 engine. The release
job reaches the deploy host over SSH.

**Project Type**: pnpm monorepo (`apps/*`, `packages/*`) + Flutter app; v1 under `legacy/`

**Performance Goals**: stack up + bootstrap + `/health ok` < 5 min; dev loop < 20 min
from checkout; CI < 15 min; ping → n8n < 10 s

**Constraints**: one published port; env validated at boot; every job heartbeats;
drivers only in `infrastructure/`; en + ar with RTL on every client skeleton

**Scale/Scope**: ~120 new files; no member-facing feature beyond sign-in placeholders

## Constitution Check

*GATE — constitution v2.1.1.*

| Principle | Status | How |
|---|---|---|
| I. API owns all data; each context owns its store | PASS | Only `apps/backend` (roles `backend`, `worker`) opens Postgres or Mongo; Identity module owns Prisma, Operations owns its Mongo collections; ports per context |
| II. n8n infrastructure only | PASS | `bootstrap.mjs` imports `workflows/*.json`; n8n holds one service token; receives signed webhooks; `/internal/*` only |
| III. Local-first LLM | PASS | `shared/llm` OllamaClient with `llm.*` settings; no cloud SDK in dependencies |
| IV. Forward-only migrations | PASS | Prisma history copied and extended; `migrate-mongo` scripts; drift `schemaVersion 1` with ladder harness |
| V. Single public surface | PASS | Caddy is the only service publishing beyond the host; n8n binds `${N8N_BIND:-127.0.0.1:5679}`, which the principle names as permitted (Docker network *or localhost*) and which `verify.mjs` excludes when it counts public ports; `EDGE_PORT` configurable |
| VI. Multi-user, three principal kinds | PASS | `Principal` type + `JwtAuthGuard`/`GqlAuthGuard`/`WsAuthGuard`/`ServiceTokenGuard`/`RolesGuard` in `shared/auth`; `ping` scoped by `userId` |
| VII. Test-then-verify | PASS | Gate commands listed below; outbox/relay, guards, settings registry, time helpers, ping idempotency have specs, and so does every other branch P0 ships: the bootstrap re-run, the replica-set healthcheck's initiate-once, the `main.ts` role switch and the `internal-alerts` slice |
| VIII. YAGNI | PASS with notes | Only the `ping` slice; Playwright deferred; no Agenda/Redis; tokens seeded from v1 CSS, no new palette |
| IX. Bounded contexts, slices, ports | PASS | `shared/persistence` ports + bases; lint rule `no-restricted-imports` for drivers outside `infrastructure/`; slice folder for `ping` |
| X. Commands / queries / streams separate | PASS | `POST /api/v1/ping` (command), `me`/`health` GraphQL (query), `/ws` gateway with `presence.ping` |
| XI. Times belong to the user | PASS | `shared/time` ported with its tests; nothing reads `TZ` |
| XII. Three kinds of configuration | PASS | zod env schema; `settings` registry (every key the blueprint lists, each with schema, default, description and `readOnly`); each hard-coded number declared constant-or-key below; `user_preferences` reserved for P1 |

## Project Structure

### Documentation (this feature)

```text
specs/014-foundation/
├── spec.md · plan.md · research.md (F-01…F-14) · data-model.md · quickstart.md · tasks.md
├── contracts/foundation.md          # /health, /api/v1/ping, /ws presence, /internal/alerts, n8n ping_echo
└── checklists/requirements.md
```

### Source Code (repository root, after this feature)

```text
legacy/                               # F-01 — v1 moved whole: apps/{gateway,admin,mobile}, infra/, workflows/, package.json, pnpm-workspace.yaml, pnpm-lock.yaml, SETUP.md, README.v1.md
package.json                          # pnpm 9 (packageManager), scripts: dev:*, build, test, lint, gen:contracts
pnpm-workspace.yaml                   # apps/*, packages/*
.nvmrc · .prettierrc · oxlint.json · tsconfig.base.json
apps/
├── backend/
│   ├── package.json                  # @botvy/backend — scripts: dev, dev:worker, build, test, migrate:pg, migrate:mongo, gen:contracts
│   ├── Dockerfile                    # deps → build → runtime (pnpm deploy); CMD reads BOTVY_ROLE
│   ├── migrations/mongo/             # migrate-mongo config + 0001-indexes.js
│   ├── prompts/                      # empty README (prompts arrive with P4)
│   ├── src/
│   │   ├── main.ts                   # role switch: backend | worker
│   │   ├── app.module.ts             # backend role: Config, Persistence, Auth, Settings, Outbox(writer), Operations, Identity(skeleton), GraphQL, Ws
│   │   ├── worker.module.ts          # worker role: Config, Persistence, Settings, Outbox(relay + webhook fanout), Operations(handlers), healthz
│   │   ├── shared/
│   │   │   ├── config/               # env.schema.ts (zod), config.module.ts
│   │   │   ├── logging/              # pino setup, RequestContext (AsyncLocalStorage), CqrsContextInterceptor
│   │   │   ├── time/                 # ported v1 common/time.ts + spec
│   │   │   ├── cqrs/                 # Command/Query/Event bases, Result, ids.ts (uuidv7), IdempotencyKey interceptor
│   │   │   ├── auth/                 # principal.ts, jwt.strategy.ts, jwt-auth.guard.ts, gql-auth.guard.ts, ws-auth.guard.ts, roles.guard.ts, service-token.guard.ts, decorators (Public, Roles, ServiceOnly, UsersOnly, CurrentPrincipal)
│   │   │   ├── persistence/
│   │   │   │   ├── ports/            # aggregate-root.ts, repository.ts, syncable-repository.ts, read-repository.ts, unit-of-work.ts
│   │   │   │   ├── mongo/            # mongoose.module.ts, mongo-unit-of-work.ts, mongo-repository.base.ts, mapper.ts
│   │   │   │   ├── prisma/           # prisma.service.ts, prisma-unit-of-work.ts (events → identity_outbox in-tx), prisma-repository.base.ts
│   │   │   │   └── memory/           # in-memory-repository.base.ts, in-memory-unit-of-work.ts
│   │   │   ├── outbox/               # outbox.schema.ts, outbox-writer.ts, outbox-relay.ts (change stream + relay_state), identity-outbox-forwarder.ts (Postgres poll), webhook-fanout.ts (HMAC), outbox.module.ts
│   │   │   ├── settings/             # settings.registry.ts (zod keys), settings.service.ts (Mongo + TTL cache + SettingChanged), settings.module.ts
│   │   │   ├── llm/                  # ollama.client.ts (chat stream, extract with format, summarize), llm.module.ts
│   │   │   ├── push/                 # ported v1 push.service.ts
│   │   │   ├── media/                # ported v1 media.signing.ts + controller
│   │   │   └── health/               # health.controller.ts (postgres, mongo, ollama, push, heartbeats), healthz.controller.ts (worker)
│   │   ├── graphql/                  # graphql.module.ts (code-first, Apollo, DataLoader factory, GqlAuthGuard), scalars (DateTime, Date, JSON)
│   │   ├── ws/                       # socket.gateway.ts (handshake auth, rooms user:<id>, presence.ping, ops room), ws.module.ts
│   │   └── contexts/
│   │       ├── identity/             # PostgreSQL — P0 ships the schema, PrismaUnitOfWork binding, UserRepository/DeviceRepository ports + Prisma adapters, `me` and `DevicesQuery`, admin and `n8n` service-client seeds (ported/new); auth commands arrive in P1
│   │       │   ├── domain/           # user.aggregate.ts, user.repository.ts (port), device.repository.ts (port), service-client.repository.ts (port)
│   │       │   ├── infrastructure/   # prisma/schema.prisma + migrations/, prisma-user.repository.ts, prisma-device.repository.ts, prisma-service-client.repository.ts, mappers
│   │       │   ├── features/me/      # me.query.ts, me.handler.ts, me.resolver.ts, me.spec.ts
│   │       │   ├── features/devices/ # devices.query.ts (QueryBus handler — the only way another context learns a member's devices), devices.spec.ts
│   │       │   └── identity.module.ts
│   │       └── operations/           # MongoDB — settings admin, heartbeats, audit trail, ping demo, internal alerts
│   │           ├── domain/           # heartbeat.ts, ping.aggregate.ts, ping.repository.ts (port), heartbeat.repository.ts (port), audit.port.ts (append-only)
│   │           ├── infrastructure/   # mongo-ping.repository.ts, mongo-heartbeat.repository.ts, mongo-audit.adapter.ts, in-memory-*.ts, schemas, mappers
│   │           ├── features/
│   │           │   ├── ping/         # ping.command.ts, ping.handler.ts, ping.controller.ts, pinged.handler.ts (worker: heartbeat), ping.spec.ts
│   │           │   ├── patch-setting/ # admin PATCH /api/v1/admin/settings/:key
│   │           │   ├── health-query/ # GraphQL health (admin)
│   │           │   └── internal-alerts/ # POST /internal/alerts (service)
│   │           └── operations.module.ts
│   └── test/                         # fixtures/, mongo-testing.ts (replica-set helper), intent-fixture placeholder
├── frontend/                         # Next.js 16 — app/(marketing)/page.tsx, app/(admin)/login/page.tsx, app/(admin)/layout.tsx, stores/provider.tsx (per-request MobX), lib/api.ts (from @botvy/sdk), Dockerfile (standalone), next.config.ts
├── extension/                        # WXT — entrypoints/sidepanel/{index.html,main.tsx,App.tsx}, entrypoints/background.ts (alarms, socket stub), lib/db.ts (Dexie), lib/store.ts (@botvy/sdk AuthStore), wxt.config.ts (sidePanel, permissions), styles (Bootstrap + tokens.css)
└── mobile/                           # Flutter — lib/main.dart, lib/app/{router.dart,theme.dart,di.dart,l10n/}, lib/core/{db/database.dart (SyncColumns, KeyValues, schemaVersion 1),db/migrations.dart, api/api_client.dart (dio port), api/socket_client.dart, notifications/ (port), push.dart (port)}, lib/features/auth/presentation/sign_in_page.dart, android/ (v1 config + dev flavour), test/ (migration ladder harness, base_url_test)
packages/
├── contracts/                        # openapi.json, schema.graphql, events/*.schema.json, src/ (generated TS), scripts/generate.mjs
├── sdk/                              # src/{client.ts (typed fetch), socket.ts, stores/auth.store.ts (single-flight refresh), index.ts}; ESM, browser-safe; vitest
└── tokens/                           # tokens.json, build.mjs → dist/tokens.css, dist/tokens.dart
infra/
├── docker-compose.yml                # caddy, frontend, backend, worker, postgres, mongo, mongodump, n8n, cloudflared (profile)
├── Caddyfile · .env.example · mongo/init-replica.sh (run as the compose healthcheck) · bootstrap.mjs · verify.mjs · backup-postgres.sh
workflows/                            # error_handler.json, ping_echo.json (sweep/tick arrive with P2/P3)
.github/workflows/                    # ci.yml, release.yml
README.md · SETUP.md (v2, pointing to legacy/SETUP.md for v1)
```

**Structure Decision**: as the blueprint prescribes — one backend codebase with
per-context folders (domain / infrastructure / features), shared kernel under
`shared/`, three shared packages, v1 preserved under `legacy/`.

## Design

### Backend boot and roles (F-04)

`main.ts` reads the validated env; `BOTVY_ROLE=backend` creates `AppModule` and
listens on `PORT` (8080) with Swagger at `/docs`, GraphQL at `/graphql`, Socket.IO
at `/ws`; `BOTVY_ROLE=worker` creates `WorkerModule`, starts `OutboxRelay`, and
listens on `WORKER_PORT` (8081) for `/healthz`. Both roles share `ConfigModule`
(zod `env.schema.ts`: `DATABASE_URL`, `MONGO_URL`, `JWT_*`, `INTERNAL_*`,
`OLLAMA_BASE_URL`, `FIREBASE_CREDENTIALS_FILE?`, `MEDIA_SIGNING_SECRET`,
`AUTOMATION_WEBHOOK_SECRET`, `N8N_URL`, `CORS_ORIGINS?`), `PersistenceModule`
(Prisma + Mongoose connections, both unit-of-work adapters), `SettingsModule`,
`LoggingModule`.

### Persistence ports and adapters (R-31, the load-bearing part of P0)

Ports in `shared/persistence/ports`:

```ts
export abstract class AggregateRoot<Id = string> { readonly id: Id; readonly events: DomainEvent[]; protected raise(e: DomainEvent): void; pullEvents(): DomainEvent[] }
export abstract class Repository<T extends AggregateRoot> { abstract findById(userId: string, id: string): Promise<T | null>; abstract save(agg: T): Promise<void>; abstract remove(agg: T): Promise<void> }
export abstract class SyncableRepository<T> extends Repository<T> { abstract pullSince(userId: string, since: Date | null): Promise<T[]>; abstract applyChange(userId: string, change: SyncChange): Promise<ApplyResult> }
export abstract class ReadRepository { /* marker; concrete read ports declare their own methods returning DTOs */ }
export abstract class UnitOfWork { abstract run<R>(work: () => Promise<R>): Promise<R>; abstract onCommit(cb: () => Promise<void>): void }
```

`MongoUnitOfWork.run` opens a `ClientSession`, runs `withTransaction`, exposes the
session through `AsyncLocalStorage` so `MongoRepositoryBase.save` writes the
document **and** appends the aggregate's pulled events to `outbox` in the same
session; `onCommit` callbacks run after commit (used for socket nudges).
`PrismaUnitOfWork.run` uses the interactive `$transaction`; its `save` cannot
join the Mongo outbox, so `PrismaRepositoryBase.save` writes the aggregate's events
to the `identity_outbox` table **inside the same transaction**. A post-commit write
to Mongo would be at-most-once (a crash between the two writes loses the event);
the table makes the hop at-least-once, and the worker's forwarder copies rows into
the Mongo `outbox` (upsert by `eventId`) and marks them forwarded. `InMemoryUnitOfWork` runs the work and collects events for
assertions. Every repository adapter extends the store base and takes a `Mapper<T,
Doc>` with `toDomain` (upcasting by `schemaVersion`) and `toPersistence`.
Context modules bind ports: `{ provide: PingRepository, useClass:
MongoPingRepository }`; specs bind `InMemoryPingRepository`. `oxlint.json` adds
`no-restricted-imports` for `mongoose`, `mongodb`, `@prisma/client` under
`src/contexts/**/{domain,features}/**` and `src/shared/{cqrs,auth,time}/**`.

### Principals and guards

`Principal = { kind: 'user'; id; role } | { kind: 'service'; id; scopes }`. One
Passport JWT strategy; `JwtAuthGuard` (REST, global via `APP_GUARD`, `@Public()`
opt-out), `GqlAuthGuard` (overrides `getRequest`), `WsAuthGuard` (handshake
`auth.token`), `ServiceTokenGuard` (Bearer or `X-Service-Token`; hashes and
compares against `service_clients` through the Identity `ServiceClientRepository`
port; refuses user JWTs), `RolesGuard` (`@Roles`), plus `@ServiceOnly()` /
`@UsersOnly()` kind checks. `CurrentPrincipal()` param decorator.

### Settings registry (every key the blueprint lists, registered here)

P0 registers the whole registry, not the subset P0 happens to read: a key registered
in the phase that first reads it is a key that spent the phases before it as a
hard-coded default. `settings.registry.ts` carries, each with a zod schema, a default,
a description and a `readOnly` flag:

`defaults.timezone`, `defaults.planTomorrowTime`, `defaults.endOfDayTime`,
`defaults.morningBriefingTime`, `defaults.nextPracticeCutoff`, `defaults.leadTimes`,
`defaults.quietHours`, `defaults.weekStartsOn`, `defaults.checkinEnabled`,
`defaults.locale`, `defaults.meetingDurationMin`, `defaults.mealMode`,
`defaults.aiSuggestions`, `reminders.tombstoneDays`, `notifications.sweepBatch`,
`notifications.expiryHours`, `rhythm.checkinWindowHours`, `rhythm.draftTopN`,
`chat.historyLimit`, `chat.ratePerMin`, `chat.dailyQuotaTokens`, `llm.chatModel`,
`llm.extractModel`, `llm.summarizeModel`, `llm.numCtx`, `knowledge.maxAttempts`,
`knowledge.maxChars`, `knowledge.playlistMaxItems`, `knowledge.maxLinksPerDay`,
`knowledge.concurrency`, `knowledge.stuckAfterMinutes`, `nutrition.mealsPerDay`,
`auth.registrationOpen`, `backup.retentionDays`, `backup.staleHours`,
`ops.staleAfterMinutes` (15), `push.copy`, `automation.subscriptions`,
`labels.palette`, and the two the system writes for itself — `ops.lastBackupAt` and
`ops.adminPasswordIsDefault` — marked `readOnly: true`.

`SettingsService.get(key)` → cache → Mongo → default; `set(key, value)` validates,
upserts, writes `operations.SettingChanged` to the outbox; the relay's in-process
delivery invalidates the cache in both roles. `PATCH /api/v1/admin/settings/:key`
refuses a key whose registry entry is `readOnly` — the flag, not a key prefix, is what
makes a key un-editable, so `ops.staleAfterMinutes` stays tunable while
`ops.lastBackupAt` does not. Every write, refused or applied, leaves an `audit_log`
row through the Operations `AuditPort`.

### Constants and keys: which number lives where (XII)

Every number P0 hard-codes is declared here, so a later phase does not have to guess
whether it may be retuned:

| Value | Where it lives | Why |
|---|---|---|
| Identity-outbox forwarder poll, 2 s | constant | an implementation detail of at-least-once delivery; retuning it changes nothing an operator can observe |
| Relay backoff ladder 1 m / 5 m / 30 m / 2 h then park | constant | the shape of the ladder is behaviour, not a knob; a stuck subscription is a health signal, not a tuning problem |
| Settings cache TTL, 60 s | constant | it bounds cross-process staleness (F-10); a key that changed the cache would need the cache to read it |
| `/healthz` relay-loop window, 60 s | constant | it belongs to the compose healthcheck's own timing, not to the operator |
| `Idempotency-Key` retention, 24 h | constant, as the collection's TTL index | a replay older than a day is a new request |
| Backup schedule | env (`BACKUP_CRON`, default `0 3 * * *`) | it is a deployment detail, and the job is a container, not the API |
| Backup retention and staleness | keys `backup.retentionDays` (14), `backup.staleHours` (48) | disk budget and "when should a missing backup worry me" are exactly what an operator retunes |
| Heartbeat staleness, 15 min | key `ops.staleAfterMinutes` | same reason; editable without restart, and `readOnly: false` |

### Outbox relay (F-11)

`OutboxRelay` (worker only): loads `relay_state.resumeToken`; drains
`outbox.find({ deliveredAt: null }).sort({ occurredAt: 1 })`; opens
`outbox.watch([{ $match: { operationType: 'insert' } }], { resumeAfter })`; for each
event: `EventBus.publish` to in-process handlers (registered per context by
`@EventsHandler`), then `WebhookFanout.deliver` to matching
`settings.automation.subscriptions` (POST JSON, `X-Botvy-Event`, `X-Botvy-Event-Id`,
`X-Botvy-Signature: sha256=hmac`), then `$set deliveredAt`, `attempts++`, save
resume token; failures backoff 1 m / 5 m / 30 m / 2 h then park with `lastError`.
Delivery is at-least-once by design, so a parked-then-resumed subscription and a
retried webhook both arrive twice; every subscriber discards an `X-Botvy-Event-Id` it
has already seen, `ping_echo` included. Heartbeat `outbox.relay` every loop.

A second loop, `IdentityOutboxForwarder`, polls PostgreSQL's `identity_outbox` every
2 s for `forwardedAt IS NULL` rows through Identity's `IdentityOutboxRepository` port,
upserts each into the Mongo `outbox` by `eventId`, and marks it forwarded — the only
place the worker touches Identity's store, and it does so through a port. The
`identity_outbox` row carries no `context` column: the forwarder derives it from the
`<context>.<Event>` name when it writes the Mongo row, so the two tables never
disagree. Both tables carry the blueprint envelope's `schemaVersion`, defaulting to 1.

### Health and heartbeats

`GET /health` (public, backend role): `postgres` (`SELECT 1` via Prisma), `mongo`
(`ping`), `ollama` (`GET /api/tags` with 2 s timeout), `pushConfigured`, `jobs`
from `ops_heartbeats` with `stale = now − lastOkAt > ops.staleAfterMinutes`;
`status = degraded` when any store is down, Ollama is down, or a job is stale.

Push has two distinct failures and P0 treats them differently. At boot, a
`FIREBASE_CREDENTIALS_FILE` that is set but unreadable **kills the process**, named:
declaring a credentials file is a declared intent to have push, and a process that
quietly starts without it notifies nobody for as long as nobody looks (`shared/push`,
XII's fail-fast rule). A file that was readable at boot and later becomes unreadable
— rotated, unmounted, permissions changed — cannot kill a running process without
taking every other capability down with it, so `/health` reports `pushConfigured:
false` and `status: degraded` instead. `FIREBASE_CREDENTIALS_FILE` unset stays
`pushConfigured: false` with `status` unaffected.

`GET /healthz` (worker role) returns `ok` when the relay loop ran in the last 60 s.
`HeartbeatService.stamp(job, ok, error?)` used by the relay and by the `Pinged`
handler; each stamp also emits `ops.heartbeat { job, lastOkAt }` to the `ops` room
through `NudgeService`, which is what the admin overview's live tiles read in P10.

### The `ping` slice (F-13)

`POST /api/v1/ping { clientId: uuid }` (user) → `PingCommand` → handler: `uow.run`
→ `Ping.create(userId, clientId)` raises `operations.Pinged` → `pings.save`
(unique `(userId, clientId)` makes the repeat a no-op; `Idempotency-Key` interceptor
returns the first ack) → `{ id, updatedAt }`, the blueprint's command-ack shape.
Worker: `PingedHandler` stamps `ops_heartbeats.ping`; fan-out posts to
`n8n /webhook/botvy/pinged` (`workflows/ping_echo.json`, default subscription
enabled), which checks the signature, then discards any `X-Botvy-Event-Id` already in
its static data before recording the execution — so twenty attempts of the same event
leave one execution, and SC-004 measures what FR-010 actually promises. The slice is
removed by `016-tasks-labels-reminders` once `planning.TaskScheduled` proves the same
path (F-13); no task in this phase removes it.

### GraphQL and WebSocket bootstrap

`GraphqlModule`: code-first, `autoSchemaFile` (also written to
`packages/contracts/schema.graphql` in gen mode), scalars `DateTime`, `Date`,
`JSON`, `GqlAuthGuard` global for the schema, DataLoader factory in context; resolvers
in P0: `me` (Identity), `health` (admin) and `settings` (admin — the registry with
current values, `readOnly` included, the read side of the PATCH). Swagger is mounted
at `/docs` unconditionally in development and behind `RolesGuard('admin')` when
`NODE_ENV=production`, so the schema of every endpoint is not a public document on a
tunnelled host. `SocketGateway` (`/ws`): `WsAuthGuard` in `handleConnection`, join
`user:<id>` and, for admins, `ops`; `presence.ping` → `{ serverTime }`,
`auth.expiring` timer, refuse `service` principals; `NudgeService.emit(userId,
event, payload)` and `emitToOps(event, payload)` used by the relay's in-process
handlers and by `HeartbeatService`.

### Frontend, extension, mobile skeletons

- **frontend**: Next 16 App Router; `(marketing)/page.tsx` (name, one paragraph,
  links); `(admin)/login/page.tsx` (email + password form wired to
  `@botvy/sdk` `AuthStore.login`, which calls `POST /api/v1/auth/login` — the
  endpoint arrives in P1; P0 shows the wired form and a "not yet available"
  message on 404); `StoreProvider` (`useState(() => new RootStore())`,
  `enableStaticRendering` on server); PrimeReact theme from `tokens.css`;
  `next.config.ts` `output: 'standalone'`; `Dockerfile`.
- **extension**: WXT with `sidepanel` entry (React + MobX + Bootstrap import +
  `tokens.css`), `background.ts` (`chrome.sidePanel.setPanelBehavior`,
  `chrome.alarms` heartbeat, socket connect stub using `@botvy/sdk`), `lib/db.ts`
  (Dexie `meta` table), sign-in view; `wxt.config.ts` permissions `sidePanel`,
  `storage`, `alarms`, `identity`, `contextMenus`.
- **mobile**: new project in `apps/mobile` with v1 `android/` copied (namespace,
  permissions, receivers, channel) + `dev` flavour; `lib/app/theme.dart` builds
  `FlexColorScheme` from `BotvyTokens`; `go_router` with `/sign-in`; `l10n` (en, ar,
  `Directionality` from locale); `core/db/database.dart` with `SyncColumns` mixin,
  `KeyValues` table, `schemaVersion = 1`, `MigrationStrategy` skeleton;
  `test/migration_ladder_test.dart` opens a hand-built v1-shaped file and asserts
  the ladder pattern (fixture for future bumps); `core/api/api_client.dart` ports v1's
  dio client from `legacy/apps/mobile/lib/src/api`. There is nothing to port for the
  socket: v1 streams over `legacy/apps/mobile/lib/src/api/sse.dart` (Server-Sent
  Events), so `socket_client.dart` is new code against `socket_io_client`, matching
  the WebSocket handshake the blueprint's `ws-chat.md` defines.

### Compose, edge, bootstrap, CI (F-03, F-05, F-06)

`infra/docker-compose.yml` services: `caddy` (`ports: ${EDGE_PORT:-80}:80`,
`Caddyfile` mounted), `frontend`, `backend` (`BOTVY_ROLE=backend`), `worker`
(`BOTVY_ROLE=worker`, healthcheck `/healthz`), `postgres:16` (init SQL creates the
n8n database as in v1), `mongo:8` (`--replSet rs0`, healthcheck runs
`infra/mongo/init-replica.sh`, which initiates the set on first boot and is a plain
status read afterwards), `mongodump` (cron `${BACKUP_CRON:-0 3 * * *}` →
`./backups/mongo`), `n8n` (Postgres-backed, `ports: ${N8N_BIND:-127.0.0.1:5679}:5678`
— a loopback publish so the Owner can open the editor through an SSH tunnel without
exposing it, and settable to a different address or removed entirely on a host where
v1's n8n already holds 5679), `cloudflared` (profile `tunnel`). All required env as
`${VAR:?}`. `verify.mjs` reads `compose ps --format json` and counts only publishes
whose host address is neither `127.0.0.1` nor `::1`; that count must be 1 (`caddy`).

n8n's environment carries `BOTVY_INTERNAL_TOKEN=${INTERNAL_SERVICE_TOKEN}` and
`BOTVY_WEBHOOK_SECRET=${AUTOMATION_WEBHOOK_SECRET}` from the same `.env` the API
reads — that is how `error_handler.json` authenticates to `/internal/alerts` and how
`ping_echo.json` verifies `X-Botvy-Signature`. Both are shared secrets the API
already holds, injected as environment, never a second credential stored in n8n's own
database, so principle II's "one credential and no data" still reads true.

**Who writes the `n8n` service client.** The backend seeds it at boot, in the same
place and the same way it seeds the admin account: on start, the Identity module
upserts a `service_clients` row named `n8n` with scopes `internal:alerts
internal:sweep internal:tick internal:ingest` whose `token_hash` is the hash of
`INTERNAL_SERVICE_TOKEN`, through `ServiceClientRepository`. It is idempotent — a
changed `INTERNAL_SERVICE_TOKEN` rotates the hash, an unchanged one is a no-op — and
it runs before the first request can arrive. `bootstrap.mjs` therefore never opens
PostgreSQL: an outside process writing a store the API owns is exactly what principle
I forbids, and P0 has no admin login yet through which the blueprint's
`POST /admin/service-clients` could be called. `bootstrap.mjs`: wait for health of
stores → `prisma migrate deploy` → `migrate-mongo up` → n8n owner + API key (once) →
**verify** the `n8n` service client answers by calling `/internal/alerts` with
`INTERNAL_SERVICE_TOKEN` and expecting anything but `401` → import
`error_handler.json` then `ping_echo.json` → verify `/health`.

CI and release as in F-06, with one deviation from the blueprint's four workflow
files: the blueprint's `mobile.yml` and `extension.yml` are folded into `ci.yml` as
their own jobs. FR-016 asks for a job per surface, not a file per surface, and one
file with five independent jobs gives the same "one surface red, the others still
report" guarantee with less to keep in step (VIII).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Three store adapters (Mongo, Prisma, in-memory) in P0 | R-31 (user requirement): handlers must not know the store; tests must not need a database | Adapters "later" means the first real context (P1/P2) is written against drivers and ported twice |
| `legacy/` tree kept in the repo | v1 phones and stack keep running until parity | Deleting v1 strands installed phones |
| Demonstration `ping` slice | Proves the spine before any context depends on it | Waiting for P2's `TaskScheduled` leaves the outbox/relay untested for a whole phase |
| Two health endpoints | The worker has no HTTP edge but compose needs a healthcheck | Marking the worker healthy on process start hides a dead relay |

## Verification gate (from tasks.md)

```powershell
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
node infra/bootstrap.mjs
node infra/verify.mjs                      # prints elapsed seconds since `up` began — SC-001 is under 300
curl -s http://localhost/health            # status ok, postgres true, mongo true, jobs.outbox.relay.stale false
pnpm -r lint; pnpm -r test                 # backend + packages green
cd apps/mobile; flutter analyze; flutter test
# spine: login later (P1) — P0 uses a seeded dev token: pnpm --filter @botvy/backend dev:token
curl -s -X POST http://localhost/api/v1/ping -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"clientId":"<uuid>"}'
# → n8n executions show ping_echo within 10 s; repeat with the same clientId → one execution total
docker compose -f legacy/infra/docker-compose.yml --env-file .env config >/dev/null   # v1 still valid
```

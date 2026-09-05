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
Android 10+ (dev flavour `org.botvy.botvy.dev`); Chrome 116+; evergreen browsers

**Project Type**: pnpm monorepo (`apps/*`, `packages/*`) + Flutter app; v1 under `legacy/`

**Performance Goals**: stack up + bootstrap + `/health ok` < 5 min; dev loop < 20 min
from checkout; CI < 15 min; ping → n8n < 10 s

**Constraints**: one published port; env validated at boot; every job heartbeats;
drivers only in `infrastructure/`; en + ar with RTL on every client skeleton

**Scale/Scope**: ~120 new files; no member-facing feature beyond sign-in placeholders

## Constitution Check

*GATE — constitution v2.1.0.*

| Principle | Status | How |
|---|---|---|
| I. API owns all data; each context owns its store | PASS | Only `apps/backend` (roles `backend`, `worker`) opens Postgres or Mongo; Identity module owns Prisma, Operations owns its Mongo collections; ports per context |
| II. n8n infrastructure only | PASS | `bootstrap.mjs` imports `workflows/*.json`; n8n holds one service token; receives signed webhooks; `/internal/*` only |
| III. Local-first LLM | PASS | `shared/llm` OllamaClient with `llm.*` settings; no cloud SDK in dependencies |
| IV. Forward-only migrations | PASS | Prisma history copied and extended; `migrate-mongo` scripts; drift `schemaVersion 1` with ladder harness |
| V. Single public surface | PASS | Caddy is the only `ports:` entry; `EDGE_PORT` configurable |
| VI. Multi-user, three principal kinds | PASS | `Principal` type + `JwtAuthGuard`/`GqlAuthGuard`/`WsAuthGuard`/`ServiceTokenGuard`/`RolesGuard` in `shared/auth`; `ping` scoped by `userId` |
| VII. Test-then-verify | PASS | Gate commands listed below; outbox/relay, guards, settings registry, time helpers, ping idempotency have specs |
| VIII. YAGNI | PASS with notes | Only the `ping` slice; Playwright deferred; no Agenda/Redis; tokens seeded from v1 CSS, no new palette |
| IX. Bounded contexts, slices, ports | PASS | `shared/persistence` ports + bases; lint rule `no-restricted-imports` for drivers outside `infrastructure/`; slice folder for `ping` |
| X. Commands / queries / streams separate | PASS | `POST /api/v1/ping` (command), `me`/`health` GraphQL (query), `/ws` gateway with `presence.ping` |
| XI. Times belong to the user | PASS | `shared/time` ported with its tests; nothing reads `TZ` |
| XII. Three kinds of configuration | PASS | zod env schema; `settings` registry (initial keys from blueprint); `user_preferences` reserved for P1 |

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
│   │   │   │   ├── prisma/           # prisma.service.ts, prisma-unit-of-work.ts, prisma-repository.base.ts
│   │   │   │   └── memory/           # in-memory-repository.base.ts, in-memory-unit-of-work.ts
│   │   │   ├── outbox/               # outbox.schema.ts, outbox-writer.ts, outbox-relay.ts (change stream + relay_state), webhook-fanout.ts (HMAC), outbox.module.ts
│   │   │   ├── settings/             # settings.registry.ts (zod keys), settings.service.ts (Mongo + TTL cache + SettingChanged), settings.module.ts
│   │   │   ├── llm/                  # ollama.client.ts (chat stream, extract with format, summarize), llm.module.ts
│   │   │   ├── push/                 # ported v1 push.service.ts
│   │   │   ├── media/                # ported v1 media.signing.ts + controller
│   │   │   └── health/               # health.controller.ts (postgres, mongo, ollama, push, heartbeats), healthz.controller.ts (worker)
│   │   ├── graphql/                  # graphql.module.ts (code-first, Apollo, DataLoader factory, GqlAuthGuard), scalars (DateTime, Date, JSON)
│   │   ├── ws/                       # socket.gateway.ts (handshake auth, rooms user:<id>, presence.ping, ops room), ws.module.ts
│   │   └── contexts/
│   │       ├── identity/             # PostgreSQL — P0 ships the schema, PrismaUnitOfWork binding, UserRepository port + Prisma adapter, `me` query, admin seed (ported); auth commands arrive in P1
│   │       │   ├── domain/           # user.aggregate.ts, user.repository.ts (port), service-client.repository.ts (port)
│   │       │   ├── infrastructure/   # prisma/schema.prisma + migrations/, prisma-user.repository.ts, prisma-service-client.repository.ts, mappers
│   │       │   ├── features/me/      # me.query.ts, me.handler.ts, me.resolver.ts, me.spec.ts
│   │       │   └── identity.module.ts
│   │       └── operations/           # MongoDB — settings admin, heartbeats, ping demo, internal alerts
│   │           ├── domain/           # heartbeat.ts, ping.aggregate.ts, ping.repository.ts (port), heartbeat.repository.ts (port)
│   │           ├── infrastructure/   # mongo-ping.repository.ts, mongo-heartbeat.repository.ts, in-memory-*.ts, schemas, mappers
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
├── Caddyfile · .env.example · mongo/healthcheck.sh · bootstrap.mjs · backup-postgres.sh
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
join the Mongo outbox, so `PrismaRepositoryBase.save` queues events and the unit
of work's post-commit hook writes them to `outbox` (at-least-once; consumers
idempotent). `InMemoryUnitOfWork` runs the work and collects events for
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

### Settings registry (initial keys)

`defaults.timezone`, `defaults.eveningPlanTime`, `defaults.morningBriefingTime`,
`defaults.nextPracticeCutoff`, `defaults.leadTimes`, `defaults.mealMode`,
`defaults.aiSuggestions`, `reminders.tombstoneDays`, `notifications.sweepBatch`,
`notifications.expiryHours`, `rhythm.checkinWindowHours`, `chat.historyLimit`,
`chat.ratePerMin`, `llm.chatModel`, `llm.extractModel`, `llm.summarizeModel`,
`llm.numCtx`, `knowledge.maxAttempts`, `knowledge.maxChars`,
`knowledge.playlistMaxItems`, `push.copy`, `automation.subscriptions`,
`labels.palette`, `ops.staleAfterMinutes` (15). Each: zod schema, default,
description. `SettingsService.get(key)` → cache (60 s TTL) → Mongo → default;
`set(key, value)` validates, upserts, writes `operations.SettingChanged` to the
outbox; the relay's in-process delivery invalidates the cache in both roles.
`ops.*` keys are refused by the admin endpoint.

### Outbox relay (F-11)

`OutboxRelay` (worker only): loads `relay_state.resumeToken`; drains
`outbox.find({ deliveredAt: null }).sort({ occurredAt: 1 })`; opens
`outbox.watch([{ $match: { operationType: 'insert' } }], { resumeAfter })`; for each
event: `EventBus.publish` to in-process handlers (registered per context by
`@EventsHandler`), then `WebhookFanout.deliver` to matching
`settings.automation.subscriptions` (POST JSON, `X-Botvy-Event`,
`X-Botvy-Signature: sha256=hmac`), then `$set deliveredAt`, `attempts++`, save
resume token; failures backoff 1 m / 5 m / 30 m / 2 h then park with `lastError`.
Heartbeat `outbox.relay` every loop.

### Health and heartbeats

`GET /health` (public, backend role): `postgres` (`SELECT 1` via Prisma), `mongo`
(`ping`), `ollama` (`GET /api/tags` with 2 s timeout), `pushConfigured`, `jobs`
from `ops_heartbeats` with `stale = now − lastOkAt > ops.staleAfterMinutes`;
`status = degraded` when any store down, Ollama down, a job stale, or
`FIREBASE_CREDENTIALS_FILE` set but unreadable. `GET /healthz` (worker role) returns
`ok` when the relay loop ran in the last 60 s. `HeartbeatService.stamp(job,
ok, error?)` used by the relay and by the `Pinged` handler.

### The `ping` slice (F-13)

`POST /api/v1/ping { clientId: uuid }` (user) → `PingCommand` → handler: `uow.run`
→ `Ping.create(userId, clientId)` raises `operations.Pinged` → `pings.save`
(unique `(userId, clientId)` makes the repeat a no-op; `Idempotency-Key` interceptor
returns the first ack) → `{ id, at }`. Worker: `PingedHandler` stamps
`ops_heartbeats.ping`; fan-out posts to `n8n /webhook/botvy/pinged`
(`workflows/ping_echo.json`, default subscription enabled). `tasks.md` names the
removal task in P2.

### GraphQL and WebSocket bootstrap

`GraphqlModule`: code-first, `autoSchemaFile` (also written to
`packages/contracts/schema.graphql` in gen mode), scalars `DateTime`, `Date`,
`JSON`, `GqlAuthGuard` global for the schema, DataLoader factory in context; resolvers
in P0: `me` (Identity), `health` (admin). `SocketGateway` (`/ws`): `WsAuthGuard` in
`handleConnection`, join `user:<id>`, `presence.ping` → `{ serverTime }`,
`auth.expiring` timer, refuse `service` principals; `NudgeService.emit(userId,
event, payload)` used by the relay's in-process handlers.

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
  the ladder pattern (fixture for future bumps); `core/api` dio client and socket
  client ports from v1 (`legacy/apps/mobile/lib/src/api`).

### Compose, edge, bootstrap, CI (F-03, F-05, F-06)

`infra/docker-compose.yml` services: `caddy` (`ports: ${EDGE_PORT:-80}:80`,
`Caddyfile` mounted), `frontend`, `backend` (`BOTVY_ROLE=backend`), `worker`
(`BOTVY_ROLE=worker`, healthcheck `/healthz`), `postgres:16` (init SQL creates the
n8n database as in v1), `mongo:8` (`--replSet rs0`, healthcheck initiates),
`mongodump` (cron `0 3 * * *` → `./backups/mongo`), `n8n` (Postgres-backed,
`127.0.0.1:5679`), `cloudflared` (profile `tunnel`). All required env as
`${VAR:?}`. `bootstrap.mjs`: wait for health of stores → `prisma migrate deploy`
→ `migrate-mongo up` → n8n owner + API key (once) → create service client `n8n`
(scopes `internal:*`), write its token into n8n's env / credential → import
`error_handler.json` then `ping_echo.json` → verify `/health`. CI and release as
in F-06.

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
curl -s http://localhost/health            # status ok, postgres true, mongo true, jobs.outbox.relay.stale false
pnpm -r lint; pnpm -r test                 # backend + packages green
cd apps/mobile; flutter analyze; flutter test
# spine: login later (P1) — P0 uses a seeded dev token: pnpm --filter @botvy/backend dev:token
curl -s -X POST http://localhost/api/v1/ping -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"clientId":"<uuid>"}'
# → n8n executions show ping_echo within 10 s; repeat with the same clientId → one execution total
docker compose -f legacy/infra/docker-compose.yml --env-file .env config >/dev/null   # v1 still valid
```

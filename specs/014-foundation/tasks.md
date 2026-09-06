# Tasks: Foundation (P0)

**Input**: `spec.md`, `plan.md`, `research.md` (F-01…F-14), `data-model.md`,
`contracts/foundation.md`; blueprint `specs/013-platform-v2-blueprint/`.

**Tests**: required by constitution VII for branchy logic — guards, settings
registry, time helpers, unit of work + outbox, relay resumability, ping idempotency,
drift ladder harness. Handler specs use the in-memory adapters; one Mongo-backed spec
covers the outbox/relay.

**Format**: `[ID] [P?] [Story] Description with file paths` — `[P]` = parallel-safe.

**Task ids are phase-local.** `T0xx` here means P0's own list; the blueprint's
`tasks.md` runs its own `T###` series for the roadmap, and a number that appears in
both means two different things (blueprint `T013` is the ping round trip, this file's
`T013` is `shared/cqrs`). Cross-phase references always name the phase.

---

## Phase 1 — Setup: repository shape and tooling

- [X] T001 Move v1 whole into `legacy/`: `git mv apps legacy/apps`, `git mv infra legacy/infra`, `git mv workflows legacy/workflows`, `git mv package.json pnpm-workspace.yaml pnpm-lock.yaml SETUP.md legacy/`, `git mv README.md legacy/README.v1.md`. The move only — `legacy/README.md` is written once, by T080, which is the task that also verifies the command it prints (F-01, FR-018)
- [X] T002 New root: `package.json` (`packageManager: pnpm@9.15.0`, `engines.node >=24`, scripts `dev:backend dev:worker dev:frontend dev:extension build test lint gen:contracts` — declared here, proven to run by T054), `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `.nvmrc`, `tsconfig.base.json` (strict, ESNext, bundler), `.prettierrc` (from legacy gateway), `oxlint.json` (+ `no-restricted-imports` rule for `mongoose`, `mongodb`, `@prisma/client` in `apps/backend/src/contexts/**/{domain,features}/**` and `apps/backend/src/shared/{cqrs,auth,time}/**`), `.gitignore`, `.dockerignore`, `README.md` (v2). `SETUP.md` is not written here — T090 owns it end to end (F-08, R-31)
- [X] T003 [P] Create `apps/backend` NestJS 12 project (`@botvy/backend`, ESM, `nest-cli.json`, `tsconfig`, `vitest.config.ts`, scripts `dev dev:worker dev:token build test migrate:pg migrate:mongo gen:contracts`)
- [X] T004 [P] Create `packages/tokens` (`tokens.json` seeded from `legacy/apps/admin/src/index.css`, `build.mjs` → `dist/tokens.css` light+dark and `dist/tokens.dart`), `packages/contracts` (empty generated dirs, `scripts/generate.mjs` with `openapi-typescript` + `@graphql-codegen/typescript`), `packages/sdk` (`src/index.ts`, vitest) (F-12, F-14)
- [X] T005 [P] Create `apps/frontend` (Next.js 16, TypeScript, `output: 'standalone'`, PrimeReact pinned exact MIT version, `mobx`, `mobx-react-lite`), `apps/extension` (WXT + React 19 + `mobx` + Bootstrap 5 + Dexie + `socket.io-client`), `apps/mobile` (Flutter project `botvy`, deps per plan; copy `legacy/apps/mobile/android/` config, add `dev` flavour with `applicationIdSuffix ".dev"`, `google-services.json` only for the release flavour) (F-07)

**Checkpoint**: `pnpm install` succeeds at the root; `flutter pub get` succeeds; `legacy/` untouched by later tasks.

---

## Phase 2 — Foundational: shared kernel (blocks every story)

- [X] T010 `shared/config`: `env.schema.ts` (zod, all vars in data-model §7), `config.module.ts` (global, fail-fast with the offending key named) — spec: missing `MONGO_URL` throws naming it (FR-002)
- [X] T011 [P] `shared/logging`: `nestjs-pino` setup, `request-context.ts` (AsyncLocalStorage: requestId, principal, context, slice), `cqrs-context.interceptor.ts` (sets context/slice from handler metadata) (F-09, FR-008)
- [X] T012 [P] `shared/time`: copy `legacy/apps/gateway/src/common/time.ts` and `legacy/apps/gateway/test/time.spec.ts` unchanged; export `localDate`, `localHhMm`, `formatInTz`, `wallClockToUtc`, `isValidTimezone` (FR-019, XI)
- [X] T013 [P] `shared/cqrs`: `command.ts`, `query.ts`, `domain-event.ts` (the blueprint envelope verbatim, `schemaVersion` included — data-model §1), `result.ts`, `ids.ts` (uuidv7 via `uuid`), `idempotency.interceptor.ts` (header `Idempotency-Key`, `idempotency_keys` per data-model §3: `_id` is `<principalId>:<key>`, retention is the collection's 24 h TTL index, not a timer in code) — spec: repeated key returns the first response; the same key from a different principal does not
- [X] T014 `shared/persistence/ports`: `aggregate-root.ts`, `repository.ts`, `syncable-repository.ts`, `read-repository.ts`, `unit-of-work.ts`, `mapper.ts`, `sync-change.ts` (types) (R-31)
- [X] T015 `shared/persistence/mongo`: `mongoose.module.ts` (connection from `MONGO_URL`, `directConnection`), `mongo-unit-of-work.ts` (ClientSession + `withTransaction`, AsyncLocalStorage session, `onCommit`), `mongo-repository.base.ts` (session-aware `findById/save/remove`, `updatedAt` optimistic check, appends pulled events to `outbox` in-session, tombstone helpers, `pullSince`) — spec against Mongo: save writes aggregate + outbox atomically; rollback leaves neither
- [X] T016 [P] `shared/persistence/prisma`: `prisma.service.ts`, `prisma-unit-of-work.ts` (interactive `$transaction`; the aggregate's events are written to `identity_outbox` inside the same transaction), `prisma-repository.base.ts` — spec: a committed change always has its rows in `identity_outbox`; a failed transaction writes neither
- [X] T017 [P] `shared/persistence/memory`: `in-memory-unit-of-work.ts`, `in-memory-repository.base.ts` (Map store, collects events) — used by every handler spec
- [X] T017b [P] `shared/persistence/contract-tests/`: one vitest suite parameterised over the three adapter sets (in-memory, Mongo, Prisma) asserting identical repository semantics — find/save/remove, the `updatedAt` optimistic check, tombstone helpers, events captured; runs against all three in CI so a handler cannot tell which store it is on (Liskov, R-31)
- [X] T018 `shared/outbox`: `outbox.schema.ts` (+ `schemaVersion` and the indexes per data-model §3), `outbox-writer.ts`, `outbox.module.ts`; `outbox-relay.ts` (drain undelivered → change stream with `relay_state` resume token → EventBus publish → `WebhookFanout` → mark delivered → heartbeat `outbox.relay`; backoff 1m/5m/30m/2h then park — a constant ladder, per plan §Constants and keys), `identity-outbox-forwarder.ts` (polls PostgreSQL `identity_outbox` every 2 s through Identity's port, derives `context` by splitting the `<context>.<Event>` name, carries `schemaVersion` across, upserts into Mongo `outbox` by `eventId`, marks forwarded), `webhook-fanout.ts` (subscriptions from settings, `X-Botvy-Event`, `X-Botvy-Event-Id`, HMAC `X-Botvy-Signature`) — specs: resume after restart delivers exactly the missed events; failed webhook retries with backoff; a redelivered event carries the same `eventId` so an idempotent consumer sees it once; a forwarded row's `context` matches its name; a crash between a Prisma commit and the forward loses nothing (F-11, FR-010)
- [X] T019 [P] `shared/settings`: `settings.registry.ts` — every key in plan §"Settings registry", not only the ones P0 reads, each with a zod schema, a default, a description and a `readOnly` flag (`ops.lastBackupAt` and `ops.adminPasswordIsDefault` are the only `true` ones); `settings.service.ts` (Mongo read-through, 60 s TTL cache, `set()` validates, refuses a `readOnly` entry, writes `operations.SettingChanged` via outbox and an `audit_log` row through the Operations `AuditPort`), `settings.module.ts`, `SettingChangedHandler` (cache invalidation) — specs: invalid value rejected; default returned when unset; a `readOnly` key is refused with `setting_read_only`; `ops.staleAfterMinutes` — a key sharing that prefix but not the flag — is accepted; a refused write still leaves an audit row (F-10, FR-011)
- [X] T020 [P] `shared/auth`: `principal.ts`, `jwt.strategy.ts`, `jwt-auth.guard.ts` (global, `@Public()`), `gql-auth.guard.ts`, `ws-auth.guard.ts`, `roles.guard.ts` (`@Roles`), `service-token.guard.ts` (Bearer or `X-Service-Token`, hash + `timingSafeEqual` against `ServiceClientRepository`, refuses user JWTs, attaches `{ kind: 'service', id, scopes }`), `kind.guard.ts` (`@UsersOnly`, `@ServiceOnly`), `current-principal.decorator.ts` — specs: user JWT on `/internal/*` → 403; service token on user route → 403; expired JWT → 401 (FR-009)
- [X] T021 [P] `shared/llm`: `ollama.client.ts` (`ollama` npm; `chat()` streaming with per-chunk idle timeout, `extract()` with `format` schema returning null on failure, `summarize()`; models + `numCtx` from settings), `llm.module.ts`; health ping `GET /api/tags` — spec: extract returns null on malformed output (FR-019)
- [X] T022 [P] `shared/push`: port `legacy/apps/gateway/src/push/push.service.ts` — v1 ships no spec for it, so write one here: `FIREBASE_CREDENTIALS_FILE` unset → no-op and `pushConfigured: false`; set but unreadable **at boot** → the module throws and the process dies naming the file; set, readable, then unreadable → `isConfigured()` flips to false for `/health` instead of throwing (plan §Health and heartbeats) (FR-019)
- [X] T023 [P] `shared/media`: port `media.signing.ts` + controller with SSRF guard, and its spec from `legacy/apps/gateway/test/media.spec.ts` (FR-019)
- [X] T024 `shared/health`: `heartbeat.service.ts` (`stamp(job, ok, error?)`, which also emits `ops.heartbeat { job, lastOkAt }` to the `ops` room through `NudgeService`), `health.controller.ts` (`GET /health` per contracts), `healthz.controller.ts` (worker, 60 s relay-loop window) — specs: stale job → degraded; a Firebase file readable at boot and unreadable afterwards → `degraded` with `pushConfigured: false` and the process still serving; Ollama down → degraded with everything else true (FR-006/007)
- [X] T025 `graphql/`: `graphql.module.ts` (code-first, Apollo, `autoSchemaFile`, scalars, `GqlAuthGuard`, DataLoader factory in context, error code mapping) (X)
- [X] T026 [P] `ws/`: `socket.gateway.ts` (`/ws`, `WsAuthGuard` in `handleConnection`, room `user:<id>` for everyone and `ops` for admins, `presence.ping`, `auth.expiring`, refuse service principals), `nudge.service.ts` (`emit(userId, event, payload)` and `emitToOps(event, payload)`), `ws.module.ts` — specs: bad token → `connect_error unauthorized`; a heartbeat stamp reaches an admin socket in `ops` and not a member socket
- [X] T027 `main.ts` role switch (`backend` → `AppModule` :8080 + Swagger `/docs`, mounted openly in development and behind `RolesGuard('admin')` when `NODE_ENV=production` per contracts; `worker` → `WorkerModule` :8081 `/healthz`), `app.module.ts`, `worker.module.ts`; `helmet`, CORS from `CORS_ORIGINS`, global validation pipe, body-size limits — specs: `BOTVY_ROLE=worker` boots without an HTTP edge and with the relay running, `backend` the reverse; an unknown role exits naming it; `/docs` anonymous → 200 in development, 403 in production (F-04)
- [X] T028 Identity context skeleton (PostgreSQL): copy v1 `prisma/migrations` → `contexts/identity/infrastructure/prisma/migrations`, write `schema.prisma` (Identity models + `IdentityOutbox`), add migration `20260905120000_v2_identity` (data-model §2, `identity_outbox.schema_version` included); `domain/user.aggregate.ts`, `domain/user.repository.ts` (port), `domain/device.repository.ts` (port), `domain/service-client.repository.ts` (port), `domain/identity-outbox.repository.ts` (port); `infrastructure/prisma-user.repository.ts`, `prisma-device.repository.ts`, `prisma-service-client.repository.ts`, mappers; `features/me/` and `features/devices/` (`DevicesQuery { userIds }` → `[{ userId, deviceId, kind, pushToken?, lastSeenAt }]` on the QueryBus — the only way a Mongo context learns a member's devices, and what T029's `internal-alerts` binds), each with a spec against the in-memory repo; ported `admin-seed.service.ts` **and** a `service-client-seed.service.ts` that upserts the `n8n` client (scopes `internal:alerts internal:sweep internal:tick internal:ingest`, `token_hash` from `INTERNAL_SERVICE_TOKEN`) at boot through the port — specs: both seeds are no-ops on a second boot, and a changed `INTERNAL_SERVICE_TOKEN` rotates the hash without creating a second row; `identity.module.ts` binds ports (F-02, FR-003)
- [X] T029 Operations context skeleton (MongoDB): `domain/heartbeat.repository.ts` port + `infrastructure/mongo-heartbeat.repository.ts`; `domain/audit.port.ts` (`record(entry)` and nothing else — append-only) + `infrastructure/mongo-audit.adapter.ts` + `in-memory-audit.adapter.ts`, the port every later phase's admin action writes through (data-model §3, FR-020); `features/patch-setting/` (admin `PATCH /api/v1/admin/settings/:key` + `GET /api/v1/admin/settings`, both writing an audit row), `features/health-query/` (GraphQL `health`), `features/settings-query/` (GraphQL `settings`: registry with current values, `readOnly` included — the read side of the PATCH, per contracts), `features/internal-alerts/` (service `POST /internal/alerts` → Identity's `DevicesQuery` for admin devices → push → audit row) with `internal-alerts.spec.ts` covering its branches: no admin device → `{ notified: 0 }` and no throw, a device without a push token skipped, a push failure recorded rather than propagated; `operations.module.ts`
- [X] T030 Mongo migrations: `apps/backend/migrations/mongo/migrate-mongo-config.js`, `0001-foundation-indexes.js` (every index in data-model §3 — `outbox`, `relay_state`, `settings`, `ops_heartbeats`, `audit_log`, `pings`, and `idempotency_keys` with its 24 h TTL on `createdAt`), script `migrate:mongo` — spec: running it twice changes nothing (F-03)
- [X] T031 `gen:contracts`: generation mode in `main.ts` writes `packages/contracts/openapi.json`, `schema.graphql`, `events/*.schema.json` (zod → JSON schema for `Pinged`, `SettingChanged`); `packages/contracts/scripts/generate.mjs` emits TS (F-12, FR-014)

**Checkpoint**: `pnpm --filter @botvy/backend test` green with in-memory adapters; Mongo-backed specs green against a local replica set; `nest build` clean.

---

## Phase 3 — User Story 1: the Owner brings v2 up (P1) 🎯

- [X] T040 [US1] `infra/docker-compose.yml`: services `caddy`, `frontend`, `backend`, `worker`, `postgres`, `mongo` (`--replSet rs0`, healthcheck `infra/mongo/init-replica.sh`, which initiates the set on first boot and is a status read afterwards), `mongodump` (cron `${BACKUP_CRON:-0 3 * * *}` → `./backups/mongo`, pruning past `backup.retentionDays`), `n8n` (Postgres-backed, `ports: ${N8N_BIND:-127.0.0.1:5679}:5678` — a loopback publish, which principle V permits, settable or removable where v1's n8n already holds the port; environment `BOTVY_INTERNAL_TOKEN=${INTERNAL_SERVICE_TOKEN}` and `BOTVY_WEBHOOK_SECRET=${AUTOMATION_WEBHOOK_SECRET}` so the committed workflows need no stored credential), `cloudflared` (profile `tunnel`); every required var `${VAR:?}`; `caddy` is the only service publishing beyond loopback; volumes `pg_data`, `mongo_data`, `n8n_data`, `media`, `caddy_data` — spec: `init-replica.sh` run twice initiates once (F-03, F-05, FR-001/004/005)
- [X] T041 [P] [US1] `infra/Caddyfile` (`{$CADDY_SITE}`; `/api/* /graphql /ws /health /media` → `backend:8080` with WebSocket upgrade; else → `frontend:3000`), `infra/.env.example` documenting every variable in data-model §7, `infra/postgres/001_create_databases.sql` (ported), `infra/backup-postgres.sh` (nightly `pg_dump` beside the Mongo dump, same retention window — FR-005)
- [X] T042 [P] [US1] `apps/backend/Dockerfile` (deps → build → runtime via `pnpm deploy`, non-root, `CMD node dist/main.js`, healthcheck by role), `apps/frontend/Dockerfile` (standalone)
- [X] T043 [US1] `infra/bootstrap.mjs` (order per contracts: wait → `prisma migrate deploy` → `migrate-mongo up` → n8n owner/API key once → **verify** the `n8n` service client by calling `/internal/alerts` with `INTERNAL_SERVICE_TOKEN` and requiring anything but `401`, the seed itself being the backend's job in T028 → import `workflows/error_handler.json` then `ping_echo.json` → verify health). The script opens neither store. `workflows/error_handler.json` (ported, token from `$env.BOTVY_INTERNAL_TOKEN`), `workflows/ping_echo.json` (signature verified with `$env.BOTVY_WEBHOOK_SECRET`, then `X-Botvy-Event-Id` checked against the workflow's static data so a redelivery leaves no second execution) (FR-003, FR-010)
- [X] T044 [US1] Gate script `infra/verify.mjs`: `compose ps` all healthy; counts published ports whose host address is neither `127.0.0.1` nor `::1` and requires exactly one; `/health ok` with both stores true; **runs `bootstrap.mjs` a second time and requires it to exit 0 having created nothing** (FR-003's "idempotently" is otherwise only ever tested by hand); prints the table and the elapsed seconds since the run began, which is the number SC-001 is measured against

**Independent test**: US1 acceptance scenarios 1–4 on a clean machine; record output in this file.

---

## Phase 4 — User Story 2: developer loop on every surface (P1)

- [ ] T050 [P] [US2] `packages/sdk`: `client.ts` (typed fetch over `@botvy/contracts`, base URL + bearer), `socket.ts` (Socket.IO wrapper with handshake auth + reconnect), `stores/auth.store.ts` (MobX; tokens; single-flight refresh ported from `legacy/apps/admin/src/api/client.ts`), `stores/root.store.ts`; ESM, no Node/DOM globals; vitest for the refresh dedupe
- [ ] T051 [P] [US2] `apps/frontend`: `app/(marketing)/page.tsx`, `app/(admin)/layout.tsx` + `login/page.tsx` (form → `AuthStore.login`; shows "sign-in arrives in the next phase" on 404), `stores/provider.tsx` (per-request store, `enableStaticRendering`), PrimeReact theme + `tokens.css`, `next.config.ts`; en/ar via `next-intl` with `dir` switch
- [ ] T052 [P] [US2] `apps/extension`: `wxt.config.ts` (sidePanel, storage, alarms, identity, contextMenus), `entrypoints/sidepanel/` (React + MobX + Bootstrap + tokens.css; sign-in view), `entrypoints/background.ts` (`setPanelBehavior`, alarm heartbeat, socket connect stub), `lib/db.ts` (Dexie `meta`), `lib/store.ts`, `lib/i18n.ts` — en and ar message catalogues seeded from the same strings the frontend uses, the locale taken from `chrome.i18n.getUILanguage()` with a manual override in `chrome.storage`, and `document.documentElement.dir` set to `rtl` for Arabic so Bootstrap's logical properties flip. Without it the extension is the one surface FR-013 names that ships English-only (FR-013)
- [ ] T053 [P] [US2] `apps/mobile`: `lib/main.dart`, `lib/app/{router.dart (go_router: /sign-in), theme.dart (FlexColorScheme from BotvyTokens), di.dart (get_it), l10n/ (en, ar)}`, `lib/core/db/database.dart` (`SyncColumns` mixin, `KeyValues`, `schemaVersion 1`, `MigrationStrategy` skeleton), `lib/core/api/api_client.dart` (dio, ported from `legacy/apps/mobile/lib/src/api/api_client.dart`) + `socket_client.dart` (**new** — v1 streams over `sse.dart`, so there is no socket client to port; written against `socket_io_client` and the blueprint's `ws-chat.md` handshake), base URL from `--dart-define` then secure storage, `lib/core/notifications/` + `lib/core/push.dart` (ports from legacy), `lib/features/auth/presentation/sign_in_page.dart`; tests: `test/migration_ladder_test.dart` (the two assertions in data-model §4), `test/base_url_test.dart` (ported) (FR-013/015)
- [ ] T054 [US2] Prove the root scripts T002 declared: `pnpm dev:*`, `build`, `test`, `lint` and `gen:contracts` each run from a clean checkout; `pnpm gen:contracts` produces files and `pnpm -r build` compiles frontend + extension against them; `swagger_dart_code_generator` configured in mobile `build.yaml` (FR-014)

**Independent test**: US2 scenarios 1–4 on a fresh clone following `quickstart.md`
alone, wall-clock timed from `git clone` to the last surface answering — SC-002 is
that number, under 20 minutes; record it here.

---

## Phase 5 — User Story 3: CI and release (P1)

- [ ] T060 [US3] `.github/workflows/ci.yml`: jobs `backend` (pnpm, `oxlint`, `prisma generate`, `nest build`, `vitest run` with a Mongo replica-set service container), `frontend` (`next lint`, `next build`), `extension` (`oxlint`, `wxt build` + zip artifact), `packages` (`oxlint`, typecheck + tests), `mobile` (`subosito/flutter-action`, `flutter analyze`, `flutter test`, debug APK artifact); each independent, each with `timeout-minutes: 15` so SC-003 fails the run rather than being measured after the fact. FR-016 asks for a job per surface, not a file per surface — the blueprint's `mobile.yml` and `extension.yml` are jobs here (plan §Compose, edge, bootstrap, CI) (FR-016, SC-003)
- [ ] T061 [US3] `.github/workflows/release.yml` on `v*`: build + push `ghcr.io/${{ github.repository_owner }}/botvy-backend` and `botvy-frontend` (tag + `latest`), release APK (`--flavor prod --release`) and extension zip as assets, `deploy` job over SSH (`appleboy/ssh-action`) `cd /opt/botvy && sed -i "s/^BOTVY_TAG=.*/BOTVY_TAG=${TAG}/" .env && docker compose pull && docker compose up -d`, gated `if: secrets.DEPLOY_HOST != ''` (F-06, FR-017)
- [ ] T062 [US3] Compose images reference `${BOTVY_TAG:-local}` with `build:` for local dev and `image:` for release; hand the tag/deploy paragraph to T090, which writes `SETUP.md`

**Independent test**: a PR breaking one backend spec → only `backend` job red; a tag → images + assets present; deploy skipped cleanly without secrets.

---

## Phase 6 — User Story 4: the spine (P1)

- [X] T070 [US4] `contexts/operations/domain/ping.aggregate.ts` (raises `operations.Pinged`), `ping.repository.ts` (port), `infrastructure/ping.schema.ts`, `ping.mapper.ts`, `mongo-ping.repository.ts` (unique `(userId, clientId)` → no-op on repeat), `in-memory-ping.repository.ts`
- [X] T071 [US4] `features/ping/`: `ping.command.ts`, `ping.handler.ts` (`uow.run` → save), `ping.controller.ts` (`POST /api/v1/ping`, `@UsersOnly`, `Idempotency-Key`, ack `{ id, updatedAt }` per contracts), `ping.spec.ts` (in-memory: one event per new clientId, none on repeat) (F-13, FR-012)
- [X] T072 [US4] Worker `features/ping/pinged.handler.ts` (`@EventsHandler` → `heartbeat.stamp('ping')`); default subscription `operations.Pinged` → `http://n8n:5678/webhook/botvy/pinged` in `settings.registry.ts`
- [ ] T073 [US4] `dev:token` script (`apps/backend/scripts/dev-token.ts`: mints a 1 h user JWT for `ADMIN_EMAIL`; refuses to run when `NODE_ENV=production`)
- [ ] T074 [US4] End-to-end spec `test/spine.e2e.spec.ts` (runs only with `E2E=1` against the compose stack): **20 consecutive pings**, each with its own `clientId`, each visible in the n8n executions API within 10 s and each leaving exactly one `Botvy Ping Echo` run — that is SC-004's number, and running it once proves nothing about a timing failure that shows up one time in ten; then repeating one `clientId` → still one execution; then replaying a delivered event's webhook by hand with the same `X-Botvy-Event-Id` → still one execution, which is the dedupe FR-010 relies on rather than an exactly-once delivery the relay never promised; then stop worker → ping → start → delivered (SC-004)

**Independent test**: US4 scenarios 1–4; paste the n8n execution id and the `/health` jobs block here.

---

## Phase 7 — User Story 5: v1 keeps running (P2)

- [ ] T080 [US5] Write `legacy/README.md` (its only author — "read-only reference; run with `legacy/infra/docker-compose.yml`", plus the exact v1 run command) and verify `docker compose -f legacy/infra/docker-compose.yml --env-file .env config` renders and `up -d` starts on the v1 ports (5432 shared Postgres — document that v1 and v2 share the Postgres container only if the Owner points both at it; default: v1 stack runs its own `postgres` service as before)
- [ ] T081 [US5] Root `.gitattributes` / `.prettierignore` / lint ignores exclude `legacy/**` so tooling never touches it (FR-018)

---

## Phase 8 — Polish

- [ ] T090 [P] `SETUP.md` (v2), written once and only here: prerequisites (including the Windows/PowerShell developer loop and the Linux or WSL2 production recommendation), env contract table, run, bootstrap, verify, backups **and the restore step for both stores** (FR-005), the `BOTVY_TAG` and deploy paragraph from T062, tunnel, "v1 lives in legacy/"
- [ ] T091 [P] `CLAUDE.md`: confirm the persistence rule and the `legacy/` rule read true after the move; update paths
- [ ] T092 Record gate evidence in this file (commands + output) and mark the phase done; open `015-identity-profile` with `/speckit-specify`

---

## Dependencies & execution order

```text
Phase 1 (setup) → Phase 2 (shared kernel) → US1 (stack) → US4 (spine)
                                          ↘ US2 (surfaces, parallel with US1 after T031)
                                          ↘ US3 (CI) after US1/US2 skeletons build
US5 (legacy) any time after T001
```

Within Phase 2: T014 (ports) before T015/T016/T017; T018 (outbox) needs T015;
T019/T020/T024 need T013–T015; T027 last.

T028 is out of order in the list and first in the graph: it declares Identity's
ports, and three earlier-numbered tasks are written against them —
`PrismaUnitOfWork` (T016) writes through `IdentityOutboxRepository`, the forwarder
(T018) polls through it, and `ServiceTokenGuard` (T020) verifies through
`ServiceClientRepository`. Write T028's `domain/` ports first, then T016, T018 and
T020, then the rest of T028 (Prisma adapters, migrations, `me`, `DevicesQuery`, the
two seeds). T029's `AuditPort` likewise precedes T019, whose `set()` writes an audit
row.

## Verification gate (must pass with recorded output)

1. `docker compose --env-file .env -f infra/docker-compose.yml up -d --build && node infra/bootstrap.mjs && node infra/verify.mjs` → all healthy, exactly one non-loopback published port, `/health ok`, the second bootstrap run a no-op, elapsed under 300 s (SC-001).
2. `pnpm -r lint && pnpm -r test` green; `cd apps/mobile && flutter analyze && flutter test` green.
3. Spine: `E2E=1` `spine.e2e.spec.ts` → 20 pings, 20 executions, none late; a repeated `clientId` and a replayed `X-Botvy-Event-Id` each add none (SC-004); worker restart → delivery; `/health` shows `outbox.relay` and `ping` fresh; stopping the worker for 16 minutes → `degraded` naming `outbox.relay`.
4. CI green on the PR, every job inside its 15-minute timeout (SC-003); tag `v2.0.0-alpha.0` produces images, APK, extension zip; deploy skipped (no secrets).
5. `docker compose -f legacy/infra/docker-compose.yml config` valid; v1 untouched (`git diff --stat master -- legacy/` shows only the move).
6. The Phase 4 fresh-clone timing recorded and under 20 minutes (SC-002).

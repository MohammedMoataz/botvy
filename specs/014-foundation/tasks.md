# Tasks: Foundation (P0)

**Input**: `spec.md`, `plan.md`, `research.md` (F-01…F-14), `data-model.md`,
`contracts/foundation.md`; blueprint `specs/013-platform-v2-blueprint/`.

**Tests**: required by constitution VII for branchy logic — guards, settings
registry, time helpers, unit of work + outbox, relay resumability, ping idempotency,
drift ladder harness. Handler specs use the in-memory adapters; one Mongo-backed spec
covers the outbox/relay.

**Format**: `[ID] [P?] [Story] Description with file paths` — `[P]` = parallel-safe.

---

## Phase 1 — Setup: repository shape and tooling

- [ ] T001 Move v1 whole into `legacy/`: `git mv apps legacy/apps`, `git mv infra legacy/infra`, `git mv workflows legacy/workflows`, `git mv package.json pnpm-workspace.yaml pnpm-lock.yaml SETUP.md legacy/`, `git mv README.md legacy/README.v1.md`; add `legacy/README.md` ("read-only reference; run with legacy/infra/docker-compose.yml") (F-01, FR-018)
- [ ] T002 New root: `package.json` (`packageManager: pnpm@9.15.0`, `engines.node >=24`, scripts `dev:backend dev:worker dev:frontend dev:extension build test lint gen:contracts`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `.nvmrc`, `tsconfig.base.json` (strict, ESNext, bundler), `.prettierrc` (from legacy gateway), `oxlint.json` (+ `no-restricted-imports` rule for `mongoose`, `mongodb`, `@prisma/client` in `apps/backend/src/contexts/**/{domain,features}/**` and `apps/backend/src/shared/{cqrs,auth,time}/**`), `.gitignore`, `.dockerignore`, `README.md` (v2), `SETUP.md` (v2 skeleton pointing to quickstart) (F-08, R-31)
- [ ] T003 [P] Create `apps/backend` NestJS 12 project (`@botvy/backend`, ESM, `nest-cli.json`, `tsconfig`, `vitest.config.ts`, scripts `dev dev:worker dev:token build test migrate:pg migrate:mongo gen:contracts`)
- [ ] T004 [P] Create `packages/tokens` (`tokens.json` seeded from `legacy/apps/admin/src/index.css`, `build.mjs` → `dist/tokens.css` light+dark and `dist/tokens.dart`), `packages/contracts` (empty generated dirs, `scripts/generate.mjs` with `openapi-typescript` + `@graphql-codegen/typescript`), `packages/sdk` (`src/index.ts`, vitest) (F-12, F-14)
- [ ] T005 [P] Create `apps/frontend` (Next.js 16, TypeScript, `output: 'standalone'`, PrimeReact pinned exact MIT version, `mobx`, `mobx-react-lite`), `apps/extension` (WXT + React 19 + `mobx` + Bootstrap 5 + Dexie + `socket.io-client`), `apps/mobile` (Flutter project `botvy`, deps per plan; copy `legacy/apps/mobile/android/` config, add `dev` flavour with `applicationIdSuffix ".dev"`, `google-services.json` only for the release flavour) (F-07)

**Checkpoint**: `pnpm install` succeeds at the root; `flutter pub get` succeeds; `legacy/` untouched by later tasks.

---

## Phase 2 — Foundational: shared kernel (blocks every story)

- [ ] T010 `shared/config`: `env.schema.ts` (zod, all vars in data-model §7), `config.module.ts` (global, fail-fast with the offending key named) — spec: missing `MONGO_URL` throws naming it (FR-002)
- [ ] T011 [P] `shared/logging`: `nestjs-pino` setup, `request-context.ts` (AsyncLocalStorage: requestId, principal, context, slice), `cqrs-context.interceptor.ts` (sets context/slice from handler metadata) (F-09, FR-008)
- [ ] T012 [P] `shared/time`: copy `legacy/apps/gateway/src/common/time.ts` + its spec unchanged; export `localDate`, `localHhMm`, `formatInTz`, `wallClockToUtc`, `isValidTimezone`
- [ ] T013 [P] `shared/cqrs`: `command.ts`, `query.ts`, `domain-event.ts` (envelope from contracts/events.md), `result.ts`, `ids.ts` (uuidv7 via `uuid`), `idempotency.interceptor.ts` (header `Idempotency-Key`, in-Mongo `idempotency_keys` TTL 24 h) — spec: repeated key returns first response
- [ ] T014 `shared/persistence/ports`: `aggregate-root.ts`, `repository.ts`, `syncable-repository.ts`, `read-repository.ts`, `unit-of-work.ts`, `mapper.ts`, `sync-change.ts` (types) (R-31)
- [ ] T015 `shared/persistence/mongo`: `mongoose.module.ts` (connection from `MONGO_URL`, `directConnection`), `mongo-unit-of-work.ts` (ClientSession + `withTransaction`, AsyncLocalStorage session, `onCommit`), `mongo-repository.base.ts` (session-aware `findById/save/remove`, `updatedAt` optimistic check, appends pulled events to `outbox` in-session, tombstone helpers, `pullSince`) — spec against Mongo: save writes aggregate + outbox atomically; rollback leaves neither
- [ ] T016 [P] `shared/persistence/prisma`: `prisma.service.ts`, `prisma-unit-of-work.ts` (interactive `$transaction`, post-commit hook → `OutboxWriter`), `prisma-repository.base.ts` — spec: events written only after commit; a failed tx writes nothing
- [ ] T017 [P] `shared/persistence/memory`: `in-memory-unit-of-work.ts`, `in-memory-repository.base.ts` (Map store, collects events) — used by every handler spec
- [ ] T018 `shared/outbox`: `outbox.schema.ts` (+ indexes per data-model §3), `outbox-writer.ts`, `outbox.module.ts`; `outbox-relay.ts` (drain undelivered → change stream with `relay_state` resume token → EventBus publish → `WebhookFanout` → mark delivered → heartbeat `outbox.relay`; backoff 1m/5m/30m/2h then park), `webhook-fanout.ts` (subscriptions from settings, HMAC `X-Botvy-Signature`) — specs: resume after restart delivers exactly the missed events; failed webhook retries with backoff; consumers see each `eventId` once (F-11, FR-010)
- [ ] T019 [P] `shared/settings`: `settings.registry.ts` (keys + zod + defaults + descriptions per plan), `settings.service.ts` (Mongo read-through, 60 s TTL cache, `set()` validates + writes `operations.SettingChanged` via outbox, `ops.*` refused), `settings.module.ts`, `SettingChangedHandler` (cache invalidation) — specs: invalid value rejected; default returned when unset; `ops.*` write refused (F-10, FR-011)
- [ ] T020 [P] `shared/auth`: `principal.ts`, `jwt.strategy.ts`, `jwt-auth.guard.ts` (global, `@Public()`), `gql-auth.guard.ts`, `ws-auth.guard.ts`, `roles.guard.ts` (`@Roles`), `service-token.guard.ts` (Bearer or `X-Service-Token`, hash + `timingSafeEqual` against `ServiceClientRepository`, refuses user JWTs, attaches `{ kind: 'service', id, scopes }`), `kind.guard.ts` (`@UsersOnly`, `@ServiceOnly`), `current-principal.decorator.ts` — specs: user JWT on `/internal/*` → 403; service token on user route → 403; expired JWT → 401 (FR-009)
- [ ] T021 [P] `shared/llm`: `ollama.client.ts` (`ollama` npm; `chat()` streaming with per-chunk idle timeout, `extract()` with `format` schema returning null on failure, `summarize()`; models + `numCtx` from settings), `llm.module.ts`; health ping `GET /api/tags` — spec: extract returns null on malformed output
- [ ] T022 [P] `shared/push`: port `legacy/apps/gateway/src/push/push.service.ts` (fail-fast when `FIREBASE_CREDENTIALS_FILE` set but unreadable; no-op when unset) with its spec
- [ ] T023 [P] `shared/media`: port `media.signing.ts` + controller with SSRF guard and spec
- [ ] T024 `shared/health`: `heartbeat.service.ts` (`stamp(job, ok, error?)`), `health.controller.ts` (`GET /health` per contracts), `healthz.controller.ts` (worker) — spec: stale job → degraded; unreadable Firebase file → degraded (FR-006/007)
- [ ] T025 `graphql/`: `graphql.module.ts` (code-first, Apollo, `autoSchemaFile`, scalars, `GqlAuthGuard`, DataLoader factory in context, error code mapping) (X)
- [ ] T026 [P] `ws/`: `socket.gateway.ts` (`/ws`, `WsAuthGuard` in `handleConnection`, rooms `user:<id>` and `ops`, `presence.ping`, `auth.expiring`, refuse service principals), `nudge.service.ts`, `ws.module.ts` — spec: bad token → `connect_error unauthorized`
- [ ] T027 `main.ts` role switch (`backend` → `AppModule` :8080 + Swagger `/docs`; `worker` → `WorkerModule` :8081 `/healthz`), `app.module.ts`, `worker.module.ts` (F-04)
- [ ] T028 Identity context skeleton (PostgreSQL): copy v1 `prisma/migrations` → `contexts/identity/infrastructure/prisma/migrations`, write `schema.prisma` (Identity models only), add migration `20260905120000_v2_identity` (data-model §2); `domain/user.aggregate.ts`, `domain/user.repository.ts` (port), `domain/service-client.repository.ts` (port); `infrastructure/prisma-user.repository.ts`, `prisma-service-client.repository.ts`, mappers; `features/me/` (query, handler, resolver, spec with in-memory repo); ported `admin-seed.service.ts` using the port; `identity.module.ts` binds ports (F-02)
- [ ] T029 Operations context skeleton (MongoDB): `domain/heartbeat.repository.ts` port + `infrastructure/mongo-heartbeat.repository.ts`; `features/patch-setting/` (admin PATCH + GET settings), `features/health-query/` (GraphQL `health`), `features/internal-alerts/` (service `POST /internal/alerts` → push to admin devices via Identity `DevicesQuery` — devices exist from v1); `operations.module.ts`
- [ ] T030 Mongo migrations: `apps/backend/migrations/mongo/migrate-mongo-config.js`, `0001-foundation-indexes.js` (data-model §3), script `migrate:mongo` (F-03)
- [ ] T031 `gen:contracts`: generation mode in `main.ts` writes `packages/contracts/openapi.json`, `schema.graphql`, `events/*.schema.json` (zod → JSON schema for `Pinged`, `SettingChanged`); `packages/contracts/scripts/generate.mjs` emits TS (F-12, FR-014)

**Checkpoint**: `pnpm --filter @botvy/backend test` green with in-memory adapters; Mongo-backed specs green against a local replica set; `nest build` clean.

---

## Phase 3 — User Story 1: the Owner brings v2 up (P1) 🎯

- [ ] T040 [US1] `infra/docker-compose.yml`: services `caddy`, `frontend`, `backend`, `worker`, `postgres`, `mongo` (`--replSet rs0`, healthcheck `infra/mongo/healthcheck.sh` initiating on first boot), `mongodump` (cron → `./backups/mongo`), `n8n` (Postgres-backed, `127.0.0.1:5679`), `cloudflared` (profile `tunnel`); every required var `${VAR:?}`; only `caddy` has `ports:`; volumes `pg_data`, `mongo_data`, `n8n_data`, `media`, `caddy_data` (F-03, F-05, FR-001/004/005)
- [ ] T041 [P] [US1] `infra/Caddyfile` (`{$CADDY_SITE}`; `/api/* /graphql /ws /health /media` → `backend:8080` with WebSocket upgrade; else → `frontend:3000`), `infra/.env.example` documenting every variable, `infra/postgres/001_create_databases.sql` (ported), `infra/backup-postgres.sh`
- [ ] T042 [P] [US1] `apps/backend/Dockerfile` (deps → build → runtime via `pnpm deploy`, non-root, `CMD node dist/main.js`, healthcheck by role), `apps/frontend/Dockerfile` (standalone)
- [ ] T043 [US1] `infra/bootstrap.mjs` (order per contracts: wait → `prisma migrate deploy` → `migrate-mongo up` → n8n owner/API key once → service client `n8n` → import `workflows/error_handler.json` then `ping_echo.json` → verify health); `workflows/error_handler.json` (ported), `workflows/ping_echo.json` (FR-003)
- [ ] T044 [US1] Manual gate script `infra/verify.mjs`: `compose ps` all healthy, one published port, `/health ok`, both stores true; prints the table

**Independent test**: US1 acceptance scenarios 1–4 on a clean machine; record output in this file.

---

## Phase 4 — User Story 2: developer loop on every surface (P1)

- [ ] T050 [P] [US2] `packages/sdk`: `client.ts` (typed fetch over `@botvy/contracts`, base URL + bearer), `socket.ts` (Socket.IO wrapper with handshake auth + reconnect), `stores/auth.store.ts` (MobX; tokens; single-flight refresh ported from `legacy/apps/admin/src/api/client.ts`), `stores/root.store.ts`; ESM, no Node/DOM globals; vitest for the refresh dedupe
- [ ] T051 [P] [US2] `apps/frontend`: `app/(marketing)/page.tsx`, `app/(admin)/layout.tsx` + `login/page.tsx` (form → `AuthStore.login`; shows "sign-in arrives in the next phase" on 404), `stores/provider.tsx` (per-request store, `enableStaticRendering`), PrimeReact theme + `tokens.css`, `next.config.ts`; en/ar via `next-intl` with `dir` switch
- [ ] T052 [P] [US2] `apps/extension`: `wxt.config.ts` (sidePanel, storage, alarms, identity, contextMenus), `entrypoints/sidepanel/` (React + MobX + Bootstrap + tokens.css; sign-in view), `entrypoints/background.ts` (`setPanelBehavior`, alarm heartbeat, socket connect stub), `lib/db.ts` (Dexie `meta`), `lib/store.ts`
- [ ] T053 [P] [US2] `apps/mobile`: `lib/main.dart`, `lib/app/{router.dart (go_router: /sign-in), theme.dart (FlexColorScheme from BotvyTokens), di.dart (get_it), l10n/ (en, ar)}`, `lib/core/db/database.dart` (`SyncColumns` mixin, `KeyValues`, `schemaVersion 1`, `MigrationStrategy` skeleton), `lib/core/api/api_client.dart` + `socket_client.dart` (dio + socket_io_client; base URL from `--dart-define` then secure storage), `lib/core/notifications/` + `lib/core/push.dart` (ports from legacy), `lib/features/auth/presentation/sign_in_page.dart`; tests: `test/migration_ladder_test.dart` (hand-built old file harness), `test/base_url_test.dart` (ported) (FR-013/015)
- [ ] T054 [US2] Root scripts wired (`pnpm dev:* build test lint gen:contracts`); `pnpm gen:contracts` produces files and `pnpm -r build` compiles frontend + extension against them; `swagger_dart_code_generator` configured in mobile `build.yaml` (FR-014)

**Independent test**: US2 scenarios 1–4 on a fresh clone following `quickstart.md`.

---

## Phase 5 — User Story 3: CI and release (P1)

- [ ] T060 [US3] `.github/workflows/ci.yml`: jobs `backend` (pnpm, `prisma generate`, `nest build`, `vitest run` with a Mongo replica-set service container), `frontend` (`next build`), `extension` (`wxt build` + zip artifact), `packages` (typecheck + tests), `mobile` (`subosito/flutter-action`, `flutter analyze`, `flutter test`, debug APK artifact); each independent (FR-016)
- [ ] T061 [US3] `.github/workflows/release.yml` on `v*`: build + push `ghcr.io/${{ github.repository_owner }}/botvy-backend` and `botvy-frontend` (tag + `latest`), release APK (`--flavor prod --release`) and extension zip as assets, `deploy` job over SSH (`appleboy/ssh-action`) `cd /opt/botvy && sed -i "s/^BOTVY_TAG=.*/BOTVY_TAG=${TAG}/" .env && docker compose pull && docker compose up -d`, gated `if: secrets.DEPLOY_HOST != ''` (F-06, FR-017)
- [ ] T062 [US3] Compose images reference `${BOTVY_TAG:-local}` with `build:` for local dev and `image:` for release; documented in `SETUP.md`

**Independent test**: a PR breaking one backend spec → only `backend` job red; a tag → images + assets present; deploy skipped cleanly without secrets.

---

## Phase 6 — User Story 4: the spine (P1)

- [ ] T070 [US4] `contexts/operations/domain/ping.aggregate.ts` (raises `operations.Pinged`), `ping.repository.ts` (port), `infrastructure/ping.schema.ts`, `ping.mapper.ts`, `mongo-ping.repository.ts` (unique `(userId, clientId)` → no-op on repeat), `in-memory-ping.repository.ts`
- [ ] T071 [US4] `features/ping/`: `ping.command.ts`, `ping.handler.ts` (`uow.run` → save), `ping.controller.ts` (`POST /api/v1/ping`, `@UsersOnly`, `Idempotency-Key`), `ping.spec.ts` (in-memory: one event per new clientId, none on repeat) (F-13, FR-012)
- [ ] T072 [US4] Worker `features/ping/pinged.handler.ts` (`@EventsHandler` → `heartbeat.stamp('ping')`); default subscription `operations.Pinged` → `http://n8n:5678/webhook/botvy/pinged` in `settings.registry.ts`
- [ ] T073 [US4] `dev:token` script (`apps/backend/scripts/dev-token.ts`: mints a 1 h user JWT for `ADMIN_EMAIL`; refuses to run when `NODE_ENV=production`)
- [ ] T074 [US4] End-to-end spec `test/spine.e2e.spec.ts` (runs only with `E2E=1` against the compose stack): ping → n8n executions API shows one `Botvy Ping Echo` run within 10 s; repeat → still one; stop worker → ping → start → delivered

**Independent test**: US4 scenarios 1–4; paste the n8n execution id and the `/health` jobs block here.

---

## Phase 7 — User Story 5: v1 keeps running (P2)

- [ ] T080 [US5] `legacy/README.md` with the exact v1 run command; verify `docker compose -f legacy/infra/docker-compose.yml --env-file .env config` renders and `up -d` starts on the v1 ports (5432 shared Postgres — document that v1 and v2 share the Postgres container only if the Owner points both at it; default: v1 stack runs its own `postgres` service as before)
- [ ] T081 [US5] Root `.gitattributes` / `.prettierignore` / lint ignores exclude `legacy/**` so tooling never touches it (FR-018)

---

## Phase 8 — Polish

- [ ] T090 [P] `SETUP.md` (v2): prerequisites, env contract table, run, bootstrap, verify, backups, tunnel, "v1 lives in legacy/"
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

Within Phase 2: T014 (ports) before T015/T016/T017; T018 (outbox) needs T015; T019/T020/T024 need T013–T015; T027 last.

## Verification gate (must pass with recorded output)

1. `docker compose --env-file .env -f infra/docker-compose.yml up -d --build && node infra/bootstrap.mjs && node infra/verify.mjs` → all healthy, one port, `/health ok`.
2. `pnpm -r lint && pnpm -r test` green; `cd apps/mobile && flutter analyze && flutter test` green.
3. Spine: ping → one n8n execution; repeat → still one; worker restart → delivery; `/health` shows `outbox.relay` and `ping` fresh; stopping the worker for 16 minutes → `degraded` naming `outbox.relay`.
4. CI green on the PR; tag `v2.0.0-alpha.0` produces images, APK, extension zip; deploy skipped (no secrets).
5. `docker compose -f legacy/infra/docker-compose.yml config` valid; v1 untouched (`git diff --stat master -- legacy/` shows only the move).

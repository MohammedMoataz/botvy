# Implementation Plan: Botvy v2 — Life Coaching Platform Blueprint

**Branch**: `013-platform-v2-blueprint` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-platform-v2-blueprint/spec.md`

## Summary

Rebuild Botvy as a modular monolith of bounded contexts (NestJS, CQRS, vertical
slices, events through a transactional outbox), with Identity on PostgreSQL and
every other context on MongoDB; REST for commands, GraphQL for queries, WebSocket
for chat and real-time nudges; a Flutter (Bloc/Cubit, drift/SQLite) phone that
stays local-first; a Next.js (MobX, PrimeReact) admin portal and public site; a
WXT Chrome extension (MobX, Bootstrap) as the PC companion; n8n for schedules and
event-driven automation; Ollama for all inference; Docker Compose behind a Caddy
edge with GitHub Actions CI/CD. Delivered in twelve phases, each its own spec-kit
feature.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 24 LTS (api, worker, web, extension,
packages); Dart 3.5+ / Flutter stable (mobile)

**Primary Dependencies**: NestJS 12, `@nestjs/cqrs` 11, `@nestjs/mongoose` 11
(Mongoose 8), Prisma 6 (Identity only), `@nestjs/graphql` 13 + Apollo,
`@nestjs/platform-socket.io`, `@nestjs/passport` + `passport-jwt` + `passport-
local`, `google-auth-library`, `argon2`, `zod`, `class-validator`, `ollama`,
`rrule`, `@mozilla/readability` + `jsdom`, `youtubei.js`, `firebase-admin`,
`migrate-mongo`; Next.js 16, `mobx` + `mobx-react-lite`, PrimeReact (MIT line);
WXT, React, `mobx`, Bootstrap 5, Dexie, `socket.io-client`; `flutter_bloc` 9,
`drift` 2.34, `go_router` 18, `get_it`, `flex_color_scheme`, `google_sign_in` 7,
`firebase_messaging`, `flutter_local_notifications`, `timezone`,
`socket_io_client`, `graphql_flutter`, `dio`, `flutter_markdown_plus`,
`table_calendar`

**Storage**: PostgreSQL 16 (Identity: users, refresh tokens, devices, service
clients; also n8n's own database); MongoDB 8.0 single-node replica set (all other
contexts, outbox, settings); SQLite via drift on the phone; IndexedDB via Dexie in
the extension

**Testing**: vitest (api/worker/packages), Playwright (web, extension), `flutter
test` (mobile, incl. hand-built old-schema migration fixtures), `test/intent-
fixture` harness against live Ollama

**Target Platform**: Linux containers on one host (Docker Compose; Linux or WSL2
docker-ce recommended); Android 10+; Chrome 116+; evergreen browsers for web

**Project Type**: multi-app monorepo (pnpm workspace + Flutter app)

**Performance Goals**: first chat token < 5 s on the reference host; PC↔phone
propagation < 10 s; alarms fire within 60 s offline; evening/morning prompts
within 5 min of the member's time

**Constraints**: local-only inference; one public port; offline-first phone; every
default user-configurable; English + Arabic (RTL); solo-maintainable

**Scale/Scope**: up to a few hundred members; ~13 bounded contexts, ~90 slices,
5 client surfaces, 12 phases

## Constitution Check

*GATE — evaluated against constitution v2.0.0 (amended alongside this plan).*

| Principle | Status | How this plan complies |
|---|---|---|
| I. The API owns all data; each context owns its store | PASS | Only `api`/`worker` touch Postgres or Mongo; contexts never read another's collections; Identity ↔ Mongo contexts via query handlers + outbox events |
| II. n8n is workflow infrastructure only | PASS | n8n holds one service token, no data; workflows in git; calls `/internal/*`; subscribes to events via webhooks |
| III. Local-first LLM | PASS | Ollama only; models as settings; grammar-constrained extraction |
| IV. Forward-only migrations | PASS | Prisma + `migrate-mongo` forward-only; `schemaVersion` on documents; mobile drift ladder rule |
| V. Single public surface | PASS | Caddy is the only published port; web and api behind it; Postgres, Mongo, n8n, worker, Ollama private |
| VI. Multi-user, principals | PASS | Every document/table scoped by `userId`; principal kinds user/admin/service enforced by guards |
| VII. Test-then-verify | PASS | Every phase has a verification gate in `tasks.md`; branchy logic (time math, recurrence, sync conflict, sweep claim, intent) gets automated tests |
| VIII. YAGNI | PASS with justification | Two stores and a worker process are justified below (Complexity Tracking) |
| IX. Bounded contexts & vertical slices | PASS | Context table below; slice folder convention; duplication over shared commands/queries; shared kernel only for proven helpers |
| X. CQRS split | PASS | REST commands, GraphQL queries, WS chat; commands never return read models beyond ids/ack |
| XI. Times belong to the user | PASS | All user-facing times resolved against profile time zone in `shared/time`; server `TZ` never read |
| XII. Settings, preferences, environment | PASS | Operator registry (zod) in Mongo `settings`; per-member `user_preferences`; env only for secrets/connections |

## Project Structure

### Documentation (this feature)

```text
specs/013-platform-v2-blueprint/
├── spec.md              # business blueprint
├── plan.md              # this file
├── research.md          # decisions R-01..R-30, product patterns P-01..P-07
├── data-model.md        # Postgres tables, Mongo collections, mobile mirror, state machines
├── quickstart.md        # how the v2 stack is run and verified
├── contracts/
│   ├── rest-commands.md # command endpoints per context
│   ├── graphql.schema.graphql
│   ├── ws-chat.md       # Socket.IO protocol
│   ├── sync.md          # offline sync protocol v2
│   ├── internal.md      # service-token endpoints + n8n workflows
│   └── events.md        # domain/integration event catalogue
├── checklists/requirements.md
└── tasks.md             # phase roadmap P0–P11 with gates
```

### Source Code (repository root, target layout)

```text
apps/
├── api/                          # NestJS — builds both `api` and `worker` (BOTVY_ROLE)
│   ├── src/
│   │   ├── main.ts               # role switch: http+graphql+ws edge | worker
│   │   ├── app.module.ts
│   │   ├── shared/               # shared kernel (small, proven)
│   │   │   ├── time/             # localDate, formatInTz, wallClockToUtc (from v1)
│   │   │   ├── auth/             # JwtAuthGuard, GqlAuthGuard, RolesGuard, ServiceTokenGuard, Principal
│   │   │   ├── cqrs/             # base Command/Query/Event, Result, ids (uuidv7)
│   │   │   ├── outbox/           # OutboxWriter (tx), OutboxRelay (change stream), webhook fanout
│   │   │   ├── settings/         # registry (zod) + service (Mongo) + cache
│   │   │   ├── llm/              # OllamaClient: chat(stream), extract(schema), summarize
│   │   │   ├── push/             # FCM sender (from v1)
│   │   │   ├── media/            # signed proxy + SSRF guard (from v1)
│   │   │   └── persistence/      # PrismaService (identity), MongooseModule config, migrate hooks
│   │   └── contexts/
│   │       ├── identity/         # PostgreSQL
│   │       │   ├── domain/       # User, Credential, RefreshTokenFamily, Device, ServiceClient
│   │       │   ├── infrastructure/ prisma/schema.prisma, repositories
│   │       │   ├── features/     # register/ login/ google-sign-in/ refresh/ logout/ change-password/
│   │       │   │                 # register-device/ me/ devices/ user-by-id/ (each: command|query, handler, dto, controller|resolver, spec)
│   │       │   └── identity.module.ts
│   │       ├── profile/
│   │       ├── planning/         # tasks + labels
│   │       ├── reminders/
│   │       ├── notifications/    # alerts + sweep + FCM
│   │       ├── rhythm/           # daily plans, check-ins, streaks, tick
│   │       ├── training/
│   │       ├── knowledge/        # links, ingestion, suggestions
│   │       ├── nutrition/
│   │       ├── conversations/    # chat gateway (WS), intents, messages
│   │       ├── meetings/         # meetings + calendar agenda
│   │       ├── sync/             # facade over SyncableEntity adapters
│   │       └── operations/       # settings, heartbeats, admin, usage, health, workflows proxy
│   ├── prompts/                  # chat.md coach.md planner.md intent.md program.md summarize.md
│   ├── test/                     # vitest specs live beside slices; fixtures + intent harness here
│   ├── migrations/mongo/         # migrate-mongo scripts
│   └── Dockerfile
├── web/                          # Next.js 16
│   ├── app/(marketing)/          # landing, features, download
│   ├── app/(admin)/              # overview, users, devices, settings, workflows, ingestion, usage
│   ├── stores/                   # MobX stores (from packages/sdk) provisioned per request
│   └── Dockerfile
├── extension/                    # WXT
│   ├── entrypoints/sidepanel/    # React + MobX + Bootstrap
│   ├── entrypoints/background.ts # WS keep-alive, alarms, context menus, sync
│   └── lib/db.ts                 # Dexie cache
└── mobile/                       # Flutter
    ├── lib/
    │   ├── app/                  # router (go_router), theme (tokens → flex_color_scheme), DI (get_it), l10n
    │   ├── core/                 # db (drift, sync mixin), sync engine, notifications, api (dio, socket), push
    │   └── features/             # auth, home, tasks, reminders, rhythm, chat, meetings, calendar,
    │                             # athlete, knowledge, nutrition, profile, settings
    │                             # each: presentation/ application/ (cubits) domain/ data/
    └── test/
packages/
├── contracts/                    # openapi.json, schema.graphql, events/*.schema.json, generated TS types
├── sdk/                          # typed REST client, socket client, MobX stores (web + extension)
└── tokens/                       # tokens.json → css vars, dart theme
infra/
├── docker-compose.yml            # caddy, web, api, worker, postgres, mongo, mongodump, n8n, cloudflared
├── Caddyfile
├── mongo/init-replica.sh
└── bootstrap.mjs                 # migrations (both stores), n8n owner/API key, workflow import
workflows/                        # n8n JSON: sweep, rhythm-tick, error-handler, event subscribers
.github/workflows/                # ci.yml (build+test), release.yml (images → GHCR → SSH deploy), mobile.yml, extension.yml
```

**Structure Decision**: multi-app pnpm monorepo plus the Flutter app, with three
shared packages. The API is one codebase with a per-context folder; each context
is internally layered (domain / infrastructure / features) and each feature
folder is a complete vertical slice.

## Design

### Slice convention (backend)

```text
contexts/<ctx>/features/<slice>/
├── <slice>.command.ts | <slice>.query.ts   # plain class, validated DTO
├── <slice>.handler.ts                      # @CommandHandler / @QueryHandler; loads aggregate via repo; emits events
├── <slice>.controller.ts | <slice>.resolver.ts
└── <slice>.spec.ts
```

Rules: a handler touches only its own context's repositories; cross-context needs
are expressed as a `QueryBus` call to another context's query (read) or an event
(write side-effects). Commands return `{ id, updatedAt }` or an ack — never a view.
Two slices that need the same 30-line helper duplicate it until a third needs it;
then it moves to `shared/`.

### Principals and guards

`Principal = { kind: 'user', id, role } | { kind: 'service', id, scopes[] }`.
`JwtAuthGuard` (REST) and `GqlAuthGuard` (GraphQL) share one Passport strategy;
`WsAuthGuard` validates the same JWT from the Socket.IO handshake `auth.token`.
`ServiceTokenGuard` accepts `Authorization: Bearer <token>` or `X-Service-Token`,
hashes and compares against `service_clients`, and attaches a `service` principal;
it refuses user JWTs. `RolesGuard` reads `@Roles()`. `/internal/*` routes are
`@ServiceOnly()`; member routes are `@UsersOnly()`.

### Events and the outbox

Aggregates raise domain events; the repository `save()` appends them to `outbox`
within the same Mongo session/transaction (`{ _id, eventId(uuid), name, aggregate,
userId, payload, occurredAt, deliveredAt: null, attempts }`). The `worker` runs
`OutboxRelay`: a resumable change stream on inserts → EventBus publish (in-process
handlers and sagas) → webhook fan-out to n8n subscriptions registered in
`settings.automation.subscriptions` → `deliveredAt` set. Delivery is at-least-once;
every handler is idempotent on `eventId`. Identity (Postgres) writes its events
into the Mongo outbox immediately after its Prisma transaction commits.

### Time

`shared/time` (from v1) is the only place user-facing time is computed:
`localDate(now, tz)`, `localHhMm`, `wallClockToUtc(date, hhmm, tz)` (two-pass DST
correction), `isValidTimezone`. The Daily Rhythm tick and every alert planner
resolve against `profiles.timezone`.

### Sync v2

Each syncable context registers a `SyncableEntity<T>` adapter: `name`,
`pull(userId, since, full)`, `apply(userId, change) → accepted | rejection`,
`purgeHorizonDays`. The Sync facade runs all `apply()` first, then all `pull()`
with one cursor (`serverNow − 5 s`), returns `{ now, full, entities: {…},
rejections: [{ entity, id, reason, server }] }`, and stamps `devices.lastSeenAt`.
Conflict rule per row: accept when `baseUpdatedAt === server.updatedAt`; else
`min(claimedUpdatedAt, now) >= server.updatedAt` wins; else reject with the
server row. Messages sync by `seq`. A `since` older than the purge horizon forces
`full: true`, which alone enables the client's delete sweep.

### Chat turn

WS `chat.send { conversationId, clientId, text, composedAt }` → `ConversationsGateway`
→ `SendMessageCommand`. Handler: (1) if the conversation is `coach` and a check-in
is awaited → classify (keyword classifier from v1), record, reply; (2) extract
intent with the grammar-constrained call (`intent.md`, JSON schema); (3) relative
phrases resolved in code (`relative-time.ts`); (4) intents dispatched as commands
to Planning / Reminders / Meetings / Profile via `CommandBus` and confirmed with a
templated reply — no second inference; (5) otherwise assemble the prompt
(`coach.md` or `planner.md` or `chat.md`) with the profile line (BMI in code,
allergies as prohibitions), today's plan, streak, and stream `chat.token`s;
(6) persist both messages with the next per-user `seq`, record usage, emit
`chat.done`. `chat.cancel` aborts the Ollama stream. Coach-initiated messages
(evening prompt, check-in question) are written by Daily Rhythm handlers and
pushed as `chat.message` to connected sockets.

### Daily Rhythm tick

n8n fires `/internal/rhythm/tick` every 5 minutes. For each member with
preferences: compute local `today` + `HH:mm`; if `now >= eveningPlanTime` and
`lastEveningPromptDate != today` → **claim the date, then** build tomorrow's
draft (`tasks` due tomorrow by priority, tomorrow's training session from a
`NextSessionQuery`, meal line from Nutrition via `TodayMealsQuery`), write it to
`daily_plans[tomorrow]` with `status: draft`, write the prompt into the `coach`
conversation, schedule an alert (Notifications) and emit `PlanTomorrowPrompted`.
Same shape for the morning briefing. Stamp `ops_heartbeats.rhythm_tick`.

### Recurrence

`meetings` and recurring `tasks` store `dtstart`, `rrule`, `exdates[]`,
`overrides[]`. `agenda(from, to)` expands with the `rrule` library per document,
applies overrides, filters exdates, merges with timed tasks and training
sessions. Meeting reminder offsets create alerts for occurrences inside a rolling
window (next 14 days) maintained by a saga on `MeetingScheduled/Changed` and by
the sweep.

### Knowledge ingestion

`AddLinkCommand` → `links{status: queued}` + `LinkAdded`. Worker handler:
`fetching` (readability/jsdom or youtubei.js; playlist → child `links`) →
`extracting` → `summarising` (map-reduce with `llm.summarizeModel`) → `done` or
`failed{reason}`; each transition is a state write + event. `SessionScheduled`
(Training) + `aiSuggestions=true` → `GenerateSuggestionCommand` reads the member's
`knowledge_docs` (by sport/tags), asks the model for a session suggestion (schema-
constrained), stores `suggestions{status: pending}` and emits `SuggestionReady` →
alert + coach message.

### Mobile

Cubits per feature read drift streams only; the sync engine, notification
scheduler and socket client live in `core/` and are composed in `get_it`. Every
synced table mixes in `SyncColumns` (`id`, `updatedAt`, `baseUpdatedAt`,
`pendingOp`, `pushAttempts`, `deletedAt`); the `pendingOp` filter rule and the
migration ladder rule are enforced by shared query helpers and a test that opens
hand-built old-schema databases. The socket client feeds `chat.token`s to the
chat cubit and `sync.nudge` to the sync engine; FCM data messages also nudge.

### Web and extension

Both consume `packages/sdk`: `AuthStore` (tokens, single-flight refresh),
`TasksStore`, `MeetingsStore`, `SyncStore` (cursor + push queue), `SocketClient`.
Web provisions stores per request inside a client Provider; the extension holds
them in the side panel with Dexie persistence and a background service worker
that owns the socket, `chrome.alarms` reconnect, and context menus.

### Observability

Every scheduled job writes `ops_heartbeats{job, lastRunAt, lastOkAt, lastError}`;
`/health` folds Postgres, Mongo, Ollama, push config and heartbeat staleness
(15 min) into `ok | degraded`; the admin overview shows the same. Structured
logs (pino) carry `principal`, `context`, `slice`, `eventId`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Two databases (Postgres + Mongo) | User decision: identity/authorisation stays on Postgres; product data on MongoDB. Preserves proven auth code and existing accounts | All-Mongo would rewrite auth and drop accounts; all-Postgres contradicts the MongoDB requirement |
| Separate `worker` process | LLM generation, ingestion and change-stream relay must not compete with request latency; one codebase, one image | Single process: a 60 s summarisation would stall chat and sync |
| Caddy edge container | A Next.js server cannot be served as static files by the API as v1 did; one published port must remain | Two public hostnames via the tunnel alone has no LAN story |
| GraphQL alongside REST | User requirement (CQRS split) | REST-only queries rejected by requirement |
| WebSocket alongside REST | User requirement; cancel, coach-initiated messages and extension nudges need bidirectional | SSE has no server-initiated channel to the extension |

# Contract: Foundation endpoints and events

Everything P0 exposes. Blueprint contracts (`specs/013-platform-v2-blueprint/contracts/`)
remain the target; this file lists what exists after this phase.

## HTTP (backend role, behind Caddy)

| Method & path | Auth | Purpose | Response |
|---|---|---|---|
| `GET /health` | public | Liveness + readiness + job freshness | `{ status: 'ok'\|'degraded', postgres: bool, mongo: bool, ollama: bool, pushConfigured: bool, jobs: { 'outbox.relay': { lastOkAt, stale }, ping: {…} }, version }` |
| `GET /docs` · `GET /docs-json` | public (dev), admin (prod) | Swagger UI / OpenAPI JSON | HTML / JSON |
| `POST /api/v1/ping` | user (kind `user`) | Demonstration command | `202 { id, at }`; repeat with same `clientId` or `Idempotency-Key` → same body, `200` |
| `PATCH /api/v1/admin/settings/:key` | admin | Set an operator value | `{ key, value, updatedAt }`; `400` schema failure; `403` for `ops.*` keys |
| `GET /api/v1/admin/settings` | admin | Registry with current values | `[{ key, value, default, description, updatedAt }]` |
| `POST /internal/alerts` | service (`internal:alerts`) | n8n error workflow → push to admins | `{ notified }` |
| `GET /media?sig=…` | user | Signed proxy (ported) | bytes |

Guards: `JwtAuthGuard` global (`@Public()` opt-out) → `RolesGuard` → kind checks
(`@UsersOnly`, `@ServiceOnly`). A service token on a user route → `403 {
code: 'wrong_principal_kind' }`; a user JWT on `/internal/*` → `403` likewise.

Dev-only helper (never in the image): `pnpm --filter @botvy/backend dev:token`
prints a short-lived user JWT for the seeded admin so US4 can be exercised before
P1 ships login.

## GraphQL (`/graphql`)

```graphql
type Query {
  me: User!                 # user — from the JWT principal (Identity `MeQuery`)
  health: Health!           # admin — same data as GET /health
  settings: [Setting!]!     # admin
}
```

Types as in the blueprint SDL. Errors carry `extensions.code`: `UNAUTHENTICATED`,
`FORBIDDEN`, `BAD_USER_INPUT`, `INTERNAL`.

## WebSocket (`/ws`, Socket.IO)

Handshake `auth: { token, installId? }`; failure → `connect_error { code:
'unauthorized' }`. Events in P0: client `presence.ping {}` → ack `{ serverTime }`;
server `auth.expiring { inSeconds }` then disconnect `token_expired`; server
`ops.heartbeat { job, lastOkAt }` to room `ops` (admin sockets). Service principals
refused.

## Worker role

`GET /healthz` on `WORKER_PORT` → `200 { relayLoopAt }` when the relay loop ran in
the last 60 s, else `503`.

## Events

| Event | Payload | Delivered to |
|---|---|---|
| `operations.Pinged` | `{ pingId, clientId, at }` | in-process `PingedHandler` (heartbeat `ping`); webhook subscription `botvy/pinged` |
| `operations.SettingChanged` | `{ key }` | in-process cache invalidation (both roles) |

Envelope and delivery rules as in the blueprint `contracts/events.md`. Webhook
headers: `X-Botvy-Event`, `X-Botvy-Event-Id`, `X-Botvy-Signature: sha256=<hmac>`.

## n8n workflows (`workflows/`)

| File | Trigger | Does |
|---|---|---|
| `error_handler.json` | error trigger | `POST /internal/alerts` with `{ workflow, error }` (imported first) |
| `ping_echo.json` | webhook `POST /webhook/botvy/pinged` | verifies `X-Botvy-Signature` (Crypto node) → Set node echo; no outbound call. Exists to make US4 observable |

Default `settings.automation.subscriptions`:
`[{ event: 'operations.Pinged', url: 'http://n8n:5678/webhook/botvy/pinged', enabled: true }]`.

## Bootstrap (`infra/bootstrap.mjs`)

Idempotent order: wait for `postgres` and `mongo` healthchecks → `prisma migrate
deploy` → `migrate-mongo up` → n8n owner (once) → n8n API key (minted once, written
to `.env` as `N8N_API_KEY`) → service client `n8n` with scopes
`internal:alerts internal:sweep internal:tick internal:ingest` (token =
`INTERNAL_SERVICE_TOKEN` from `.env`, hashed into `service_clients`) → import
`error_handler.json` then `ping_echo.json` (upsert by name, placeholder id rewrite,
activate) → `GET /health` must read `ok`.

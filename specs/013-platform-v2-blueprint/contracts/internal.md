# Contract: internal (machine) endpoints and n8n workflows

## Principals

Machine callers hold a **service client** token (Postgres `service_clients`,
hashed). They send `Authorization: Bearer <token>` (n8n also accepts
`X-Service-Token` for compatibility with v1 workflows). `ServiceTokenGuard`
attaches `principal = { kind: 'service', id, scopes }` and **rejects user JWTs**;
member endpoints reject service principals. Scopes gate routes:

| Scope | Routes |
|---|---|
| `internal:sweep` | `POST /internal/notifications/sweep` |
| `internal:tick` | `POST /internal/rhythm/tick`, `POST /internal/rhythm/prompt` |
| `internal:ingest` | `POST /internal/knowledge/ingest/:linkId` |
| `internal:alerts` | `POST /internal/alerts` |
| `internal:events` | `POST /internal/events/ack` (webhook delivery acks, optional) |

Every internal job writes `ops_heartbeats[job]` on completion; `/health` marks a
job stale after 15 minutes and the admin overview shows the same.

## Endpoints

| Method & path | Scope | Behaviour | Response |
|---|---|---|---|
| `POST /internal/notifications/sweep` | sweep | Find due unsent alerts (batch `settings.notifications.sweepBatch`), skip users with no push device (leave unsent), skip devices with `lastSeenAt >= plannedAt`, **claim** each row atomically, send FCM, expire alerts older than `expiryHours`, purge tombstones past `tombstoneDays`, delete devices whose tokens FCM reports invalid | `{ claimed, sent, skippedLocal, expired, purged, ms }` |
| `POST /internal/rhythm/tick` | tick | For each member: local `today`/`HH:mm`; evening prompt if due and not yet claimed today; morning briefing likewise; check-in question at evening prompt when `checkinEnabled` | `{ users, evening, morning, checkins, ms }` |
| `POST /internal/rhythm/prompt` | tick | `{ userId?, kind: 'evening'\|'morning' }` unconditional (operator "Run") | `{ sent }` |
| `POST /internal/knowledge/ingest/:linkId` | ingest | Re-run the ingestion pipeline for one link regardless of state | `{ status }` |
| `POST /internal/alerts` | alerts | `{ workflow, error, executionId? }` → push to all admin devices + `audit_log` | `{ notified }` |

## Outbox → n8n webhooks

The `worker` relays outbox events to subscriptions in
`settings.automation.subscriptions`:

```jsonc
[ { "event": "planning.TaskCompleted", "url": "http://n8n:5678/webhook/botvy/task-completed", "enabled": true },
  { "event": "training.SessionScheduled", "url": "http://n8n:5678/webhook/botvy/session-scheduled", "enabled": true },
  { "event": "*", "url": "http://n8n:5678/webhook/botvy/firehose", "enabled": false } ]
```

Delivery: `POST` JSON `{ eventId, name, context, aggregate, userId, occurredAt,
payload }` with header `X-Botvy-Event: <name>` and `X-Botvy-Signature: sha256=<hmac
of body with AUTOMATION_WEBHOOK_SECRET>`. At-least-once; n8n workflows dedupe on
`eventId` when they have side effects. Failures retry with backoff (1 m, 5 m,
30 m, 2 h, then parked with `lastError`; visible in admin → Automation).

## n8n workflows (JSON in `workflows/`, imported by `infra/bootstrap.mjs`)

| File | Trigger | Calls | Notes |
|---|---|---|---|
| `error_handler.json` | error trigger | `POST /internal/alerts` | import **first** — other workflows reference it as `errorWorkflow` |
| `notifications_sweep.json` | schedule every 5 min + webhook `botvy-sweep` | `POST /internal/notifications/sweep` | retry 3×/5 s |
| `rhythm_tick.json` | schedule every 5 min + webhook `botvy-rhythm` | cron → `/internal/rhythm/tick`; webhook → `/internal/rhythm/prompt` (unconditional) | 600 s timeout — a firing tick may generate plans through the local model |
| `session_suggestion.json` | webhook `botvy/session-scheduled` | none (worker handles the LLM job); optional operator hook, e.g. notify a channel | example subscriber; disabled by default |
| `daily_digest.json` (optional) | webhook `botvy/firehose` | — | example for owners who want a log |

Rules (constitution II): no database nodes, no data volume, one credential
(the service token), never exposed publicly. `infra/bootstrap.mjs` creates the
n8n owner, mints the API key once, imports workflows (error handler first,
upsert by name), registers the sweep/tick service client and writes its token
into n8n's env.

## Health

`GET /health` (public, no auth):

```jsonc
{ "status": "ok" | "degraded",
  "postgres": true, "mongo": true, "ollama": true, "pushConfigured": true,
  "jobs": { "notifications.sweep": { "lastOkAt": "…", "stale": false },
            "rhythm.tick": { … }, "outbox.relay": { … }, "knowledge.ingest": { … } } }
```

`degraded` when any store is unreachable, Ollama does not answer, a job is stale,
or `FIREBASE_CREDENTIALS_FILE` is set but unreadable (declared intent to have push).

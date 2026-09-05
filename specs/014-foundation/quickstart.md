# Quickstart: Foundation (P0)

## Prerequisites

Docker Engine (Docker Desktop is fine for development; Linux/WSL2 docker-ce for a
server), Node 24 (`corepack enable` gives pnpm 9), Flutter stable + Android SDK,
Ollama installed natively with `qwen2.5:3b-instruct` pulled and `OLLAMA_HOST=0.0.0.0`.
Optional: Firebase service account, Cloudflare tunnel token.

## Bring the stack up

```powershell
Copy-Item infra/.env.example .env      # fill every ${VAR:?} value the file documents
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
node infra/bootstrap.mjs               # migrations (both stores), n8n owner/API key, service client, workflows
curl http://localhost/health           # {"status":"ok","postgres":true,"mongo":true,"ollama":true,...}
```

v1 keeps running from its own tree if you still need it:

```powershell
docker compose --env-file .env -f legacy/infra/docker-compose.yml up -d
```

## Develop

```powershell
pnpm install
pnpm --filter @botvy/backend dev              # BOTVY_ROLE=backend · http://localhost:8080/docs · /graphql
pnpm --filter @botvy/backend dev:worker       # BOTVY_ROLE=worker · http://localhost:8081/healthz
pnpm --filter @botvy/frontend dev             # http://localhost:3000
pnpm --filter @botvy/extension dev            # then chrome://extensions → Load unpacked → apps/extension/.output/chrome-mv3-dev
cd apps/mobile; flutter run --flavor dev --dart-define=BOTVY_BASE_URL=http://10.0.2.2:8080
pnpm gen:contracts                            # openapi.json, schema.graphql, events/*.json → packages/contracts/src
```

## Verify (constitution VII)

```powershell
pnpm -r lint
pnpm -r test                                  # backend (vitest, in-memory adapters + Mongo relay spec), packages
cd apps/mobile; flutter analyze; flutter test
```

Spine proof (US4):

```powershell
$TOKEN = pnpm --filter @botvy/backend --silent dev:token
curl -s -X POST http://localhost/api/v1/ping -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"clientId":"018f3c2e-7c1a-7f7e-9c2b-3d5a1b2c3d4e"}'
# → 202 {"id":"…","at":"…"}; within 10 s n8n → Executions shows "Botvy Ping Echo" succeeded
# repeat the same request → 200, same body, no second execution
curl -s http://localhost/health | jq .jobs     # outbox.relay and ping fresh
```

Stop the worker (`docker compose stop worker`), ping again, start it: the queued
event is delivered on restart.

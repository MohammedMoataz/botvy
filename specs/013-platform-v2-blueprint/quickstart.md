# Quickstart: Botvy v2 (target state after P0–P1)

This is the developer loop the foundation phase (`014-foundation`) must make true.
Until then, v1 keeps running from `SETUP.md`.

## Prerequisites

- Docker Engine (Linux or WSL2 docker-ce recommended; Docker Desktop works for dev)
- Node 24 LTS, `corepack enable` (pnpm 9 pinned in root `package.json`)
- Flutter stable (Dart ≥ 3.5), Android SDK
- Ollama installed natively with the models named in `settings.llm.*` pulled
  (default `qwen2.5:3b-instruct`); `OLLAMA_HOST=0.0.0.0` so containers reach it
- Optional: Firebase project (push), Cloudflare tunnel token (public access),
  Google OAuth client ids (web + Android + extension)

## Run the stack

```powershell
cp infra/.env.example .env            # fill secrets; every required var is ${VAR:?} in compose
docker compose --env-file .env -f infra/docker-compose.yml up -d
node infra/bootstrap.mjs              # prisma migrate deploy, migrate-mongo up, n8n owner + API key,
                                      # service client for n8n, workflow import (error handler first)
```

Services: `caddy` (:80/:443, the only published port), `web` (Next.js), `api`,
`worker`, `postgres`, `mongo` (replica set `rs0`, auto-initiated by its
healthcheck), `mongodump` (nightly), `n8n` (127.0.0.1:5679), `cloudflared`
(profile `tunnel`). Ollama runs on the host.

```powershell
curl http://localhost/health          # expect {"status":"ok", "postgres":true, "mongo":true, "ollama":true, ...}
```

## Develop

```powershell
pnpm install
pnpm --filter @botvy/api dev              # BOTVY_ROLE=api, watch mode, http://localhost:8080  (/docs, /graphql playground)
pnpm --filter @botvy/api dev:worker       # BOTVY_ROLE=worker
pnpm --filter @botvy/web dev              # http://localhost:3000
pnpm --filter @botvy/extension dev        # WXT dev build → load apps/extension/.output/chrome-mv3 in chrome://extensions
cd apps/mobile; flutter run --dart-define=BOTVY_BASE_URL=http://10.0.2.2:8080
```

Contracts are regenerated from the running API: `pnpm --filter @botvy/contracts
generate` (OpenAPI → TS types, GraphQL SDL → TS types; Dart models via
`build_runner` in mobile).

## Verify (the constitution VII loop)

```powershell
pnpm -r lint
pnpm -r test                               # vitest: api/worker/packages; Playwright: web, extension
cd apps/mobile; flutter analyze; flutter test
node apps/api/test/intent-fixture.mjs      # live Ollama intent harness (manual)
```

Smoke path after `up -d`:

1. Register in the phone (or `POST /api/v1/auth/register`) → `identity.UserRegistered`
   in the `outbox` → `profiles`, `user_preferences`, two pinned conversations exist.
2. Create a task due in 3 minutes → `alerts` row planned → phone alarm fires with
   airplane mode on.
3. `docker compose exec n8n …` or admin → Workflows → Run "Rhythm tick" →
   `ops_heartbeats.rhythm_tick` updates; `/health` stays `ok`.
4. Send "remind me to stretch in 10 minutes" in the Planner chat → `chat.intent`
   `set_reminder` → reminder appears in the list.
5. Open the extension side panel → the task from step 2 is listed; complete it →
   phone shows it completed within 10 s (`sync.nudge`).

## Backups

`mongodump` runs nightly to `./backups/mongo/<date>`; Postgres via `pg_dump`
(`infra/backup-postgres.sh`); keep `N8N_ENCRYPTION_KEY` and both JWT secrets with
the backups. Restore drill is part of `025-hardening-release`.

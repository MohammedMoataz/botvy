# Botvy

Self-hosted, multi-user AI assistant platform. Runs entirely on your own
hardware: your data, your workflow engine, your language model.

- **Gateway** (NestJS) — owns all data: auth, chat, reminders, coaching, the
  admin API, and the one `/sync` route the app reconciles through
- **Admin portal** (React + Vite) — users, devices, usage, configuration
- **Mobile app** (Flutter) — named chats, reminders, coaching and history,
  holding the user's whole account in its own SQLite store so it all works
  offline
- **n8n** — scheduler and workflow engine, calls the gateway's API only
- **Ollama** — local LLM (`qwen2.5:3b-instruct`), OpenAI-compatible, no cloud
  provider

## Prerequisites

- Docker Desktop
- [Ollama](https://ollama.com/download) installed natively (native, not in
  Docker — it needs direct GPU access), with `qwen2.5:3b-instruct` pulled —
  or whatever `OLLAMA_CHAT_MODEL` names; the gateway never pulls for you
- Optional: a Cloudflare domain + tunnel token for public access
- Optional: a Firebase project for push notifications

## Quick start

```powershell
cp infra/.env.example .env     # then fill in the values it documents
docker compose --env-file .env -f infra/docker-compose.yml up -d
node infra/bootstrap.mjs       # migrations, n8n owner + API key, workflow import
```

`bootstrap.mjs` is idempotent and exists because those steps have a
non-obvious required order: n8n rejects every API call until an owner
account exists, an API key's raw value is returned exactly once, and the
error-handler workflow must be imported before anything referencing it or
n8n silently drops the reference.

Then see `infra/docs/ollama-setup.md` for the host-level Ollama
configuration (the `OLLAMA_HOST` binding and firewall rule that let
containers reach it), and `infra/docs/tunnel-setup.md` for public access.

The gateway serves its API on `127.0.0.1:8080` and its OpenAPI docs at
`/docs`. n8n's editor is on `127.0.0.1:5679` and is deliberately never
exposed publicly.

## Development

```powershell
npx pnpm@latest install                                  # a global pnpm install fails with EPERM here
npx pnpm@latest --filter @botvy/gateway exec nest build
npx pnpm@latest --filter @botvy/gateway exec vitest run
```

## Project conventions

Read `.specify/memory/constitution.md` first — eight binding principles,
the important ones being: the gateway is the only process that touches the
database, n8n never does; all inference is local; migrations are
forward-only; only the gateway is ever publicly reachable; and nothing is
called done without running its check and showing the output.

Features are developed with [spec-kit](https://github.com/github/spec-kit):
each one gets a `specs/<nnn>-<name>/` directory with a `spec.md` saying what
was built and why, and a `tasks.md` carrying its verification evidence. (The
first two also have a `plan.md`; the practice since then has been to fold the
plan into the spec rather than keep a third file in step.)

The newest spec describes the current shape of the system — start there rather
than at 001.

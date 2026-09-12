# Botvy

A self-hosted life-coaching assistant. It helps one household of members live the
life they say they want: it keeps their tasks and reminders, plans tomorrow with
them each evening and hands it back each morning, tracks their training and meals,
reads the articles and videos they save, and talks all of it through in a chat that
runs on a model on the owner's own machine. Nothing leaves the host.

## Where things are

| Path | What |
|---|---|
| `apps/backend` | NestJS. One codebase, two roles: `backend` serves the edge, `worker` relays events and runs jobs. |
| `apps/frontend` | Next.js. The public site and the admin portal in one app. |
| `apps/extension` | Chrome side panel for tasks and meetings from a computer. |
| `apps/mobile` | Flutter. The member's phone, local-first and offline-capable. |
| `packages/contracts` | The API surface, generated once and consumed everywhere. |
| `packages/sdk` | Typed client, socket client and shared stores for the web surfaces. |
| `packages/tokens` | One palette and type scale, emitted as CSS variables and a Dart theme. |
| `infra` | Compose stack, the Caddy edge, bootstrap and the verification gate. |
| `workflows` | n8n workflows, committed as JSON. Git is the source of truth, not the running instance. |
| `specs` | Every feature, specified before it was built. Start at `specs/013-platform-v2-blueprint`. |

## Getting started

`SETUP.md` is the whole story: prerequisites, the environment contract, how to bring
the stack up, how to verify it and how to restore it. The short version:

```bash
cp infra/.env.example .env      # then fill it in
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
node infra/bootstrap.mjs
node infra/verify.mjs
```

## How this repository is built

Every change starts as a specification. `.specify/memory/constitution.md` holds the
rules each one is held to — the API is the only writer to either store, each bounded
context owns its own, migrations only go forward, one public port, times belong to
the member, and nothing ships without its verification run and recorded output.
`CLAUDE.md` records what is easy to get wrong here, in the words of the bugs that
taught it.

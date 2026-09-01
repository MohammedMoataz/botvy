# Botvy gateway

NestJS + Prisma + Postgres. The only process that touches the database, and the
only thing on this stack that is ever publicly reachable — n8n, Ollama, SearXNG
and Postgres all stay on loopback or the Docker network.

Start here: [`../../SETUP.md`](../../SETUP.md) for running it, and
[`../../specs/`](../../specs/) for why each part is shaped the way it is. The
newest spec describes the current system.

## What it owns

- **Auth** — JWT access tokens plus rotating refresh tokens, `user`/`admin` roles.
- **Chat** — SSE streaming from a local Ollama, an intent classifier that runs
  before any web text exists, and named conversations.
- **Reminders** — creation from chat or the app, ping planning from lead times,
  a sweep that delivers what the phone has not already alarmed locally, and soft
  delete with restore.
- **Coaching** — the nightly check-in and program cycle, driven by n8n hitting
  `/internal/*` on a schedule. All selection and delivery happens here so n8n
  stays credential- and data-light.
- **`POST /sync`** — the single round trip the mobile app uses for everything:
  offline edits up, everything that changed since its cursor back.
- **Admin API and the admin SPA**, served from `/admin`.

## Working on it

```powershell
npx pnpm@latest --filter @botvy/gateway exec nest build
npx pnpm@latest --filter @botvy/gateway exec vitest run
npx pnpm@latest --filter @botvy/gateway exec oxlint src/ test/
```

`prisma migrate deploy` applies migrations; they are forward-only and a
committed one is never edited. `openapi.json` is generated — fetch `/docs-json`
from a **running, freshly built** gateway, not from one that predates your
change.

Tests construct services by hand with `vi.fn()` Prisma literals rather than
standing up a Nest testing module. Match `test/sync.spec.ts`.

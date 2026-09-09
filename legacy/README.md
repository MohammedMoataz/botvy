# Botvy v1 — read-only reference

This is the system that is still running. It stays here, whole and untouched,
until v2 reaches feature parity and is explicitly decommissioned in the
hardening phase. Phones in the field talk to it; deleting it would strand them.

Nothing in the v2 tree imports anything from here. The root `tsconfig`,
`oxlint` and Prettier configurations all exclude `legacy/**`, so v2's tooling
never reformats, lints or type-checks this code — a reformat would produce a
diff nobody asked for in a system nobody is changing.

## Running it

v1 keeps its own workspace and its own stack:

```bash
docker compose -f legacy/infra/docker-compose.yml --env-file .env up -d
```

Its `SETUP.md` is `legacy/SETUP.md` and describes the v1 environment contract.
The v2 setup guide lives at the repository root and points here for this.

## What moved where

| v1 path | Now |
|---|---|
| `apps/gateway` | `legacy/apps/gateway` |
| `apps/admin` | `legacy/apps/admin` |
| `apps/mobile` | `legacy/apps/mobile` |
| `infra/` | `legacy/infra` |
| `workflows/` | `legacy/workflows` |
| `README.md` | `legacy/README.v1.md` |
| `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | `legacy/` |
| `.github/workflows/ci.yml` | `legacy/.github/workflows/ci.yml` |

That last one is worth knowing: v1's CI referenced `@botvy/gateway` and a root
`package.json` that is now v2's, so leaving it in place would have run a red
build on every push. It is preserved here for reference and no longer runs.

## The one thing v1 and v2 share

Both can use the same PostgreSQL server. v2's Identity context reads and writes
`users`, `refresh_tokens`, `devices`, `service_clients` and `identity_outbox`;
v1's tables — reminders, messages, conversations, coaching profiles, check-ins,
workout records, usage log, settings — are still there, untouched, and v2's
Prisma schema deliberately does not declare them so `migrate deploy` leaves
them alone.

By default the v1 stack still runs its own `postgres` service, as it always
did. Pointing both at one server is the Owner's choice, not the default.

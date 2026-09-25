# Implementation Plan: The stores leave the machine

**Branch**: `028-hosted-stores` | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)

**Input**: `spec.md`; `infra/docker-compose.yml`, `infra/bootstrap.mjs`,
`infra/backup/Dockerfile`, `backend/src/shared/persistence/mongo/mongoose.module.ts`,
`backend/migrate-mongo-config.cjs`, `backend/src/shared/config/env.schema.ts`;
`SETUP.md`, `docs/restore.md`, `docs/security-review.md`; the constitution.

## Summary

No new product surface and no new dependency. Two hard-coded driver options
go, one boot-time guard arrives, the compose file learns a profile, the backup
image learns a newer `pg_dump`, the bootstrap asks the API instead of compose,
and every document that said "nothing leaves the machine" says what is true
instead. The cut-over itself is a runbook, run when the Owner hands over the
two connection strings.

## Technical Context

**Primary Dependencies**: none new. Prisma 6 against Neon's direct endpoint;
Mongoose 8 / `migrate-mongo` 11 against an Atlas SRV URL; `postgresql-client-18`
from PGDG in the backup image.

**Storage**: unchanged in shape. Identity in PostgreSQL, everything else in a
MongoDB replica set; both now managed. The `media` volume stays.

**Testing**: `env.spec.ts` for the URL guard; `compose config` in both modes;
`verify.mjs` against the managed stores; one backup and one restore performed.

**Constraints**: constitution I (the API is the only client of either store),
II (n8n: one credential, no data — SQLite in its own volume keeps that true),
III untouched (the model stays on the machine), IV (no migration is edited),
V (this stack publishes no port for a store), XII (connection strings are
environment, nothing else).

## Constitution Check

| Principle | This phase |
|---|---|
| I. API owns all data; each context owns its store | unchanged; the store's *location* changes, its client does not. I amended to say so. |
| II. n8n is workflow infrastructure only | strengthened: SQLite in `n8n_data`, no shared server with Identity |
| III. Local-first LLM | untouched |
| IV. Forward-only migrations | no migration touched; `migrate deploy` and `migrate-mongo up` run unchanged against the managed stores |
| V. Single public surface | still one published port; V amended: a store is on the Docker network or managed, never published |
| VI. Three principal kinds | untouched (Supabase Auth refused for exactly this reason) |
| VII. Tests for branch logic | the URL guard has a spec; the compose profile is checked with `config` in both modes |
| VIII. Health and heartbeats | `backup` heartbeat unchanged; the nightly now proves the managed store is reachable from this machine |
| IX. Bounded contexts | no context touched beyond `shared/persistence` and `shared/config` |
| X. Commands, queries, streams | untouched |
| XI. Times belong to the user | untouched |
| XII. Three kinds of configuration | the two URLs were already environment; `POSTGRES_*` become optional environment for the profile |

## Project Structure

No new directories. Deleted: `infra/postgres/001_create_databases.sh`.

## The change, in order

1. **Code** — `env.schema.ts` refines `MONGO_URL` (database name required);
   `mongoose.module.ts` and `migrate-mongo-config.cjs` drop `directConnection`.
2. **Compose** — `postgres` and `mongo` behind `profiles: [local-stores]`;
   `required: false` on every `depends_on` that names them; `POSTGRES_*` with
   defaults instead of `:?`; n8n on `DB_TYPE: sqlite`; the initdb hook and
   `N8N_DB` gone.
3. **Backup image** — PGDG repository, `postgresql-client-${PG_CLIENT_MAJOR}`.
4. **Bootstrap** — `waitForStores` polls `/health` for both flags.
5. **Environment contract** — `.env.example` documents the managed URLs first
   and the profile's local ones as a comment.
6. **CI** — `COMPOSE_PROFILES=local-stores` and the local `MONGO_URL` in the
   e2e job's `.env`.
7. **Docs** — SETUP (prerequisites, where the data lives, bringing it up,
   backups, restore), `docs/restore.md`, `docs/security-review.md`, README,
   constitution 2.2.0, landing copy en/ar, CLAUDE.md gotchas, the three artifact
   pages.
8. **Cut-over** — the runbook in `tasks.md`, run with the Owner's strings.

## Judgement calls

- **Direct endpoint, not the pooler.** Two processes, a handful of connections;
  PgBouncer's transaction mode would need Prisma's `pgbouncer=true` and a
  `directUrl` for migrations, for no gain at this scale.
- **A newer `pg_dump` rather than an older Neon.** Creating the project on
  PostgreSQL 16 would have cost no code, and would have pinned an external
  default the next reader cannot see. The client major is one `ARG`.
- **SQLite for n8n rather than a database on Neon.** n8n holds no member data;
  a second database on the Identity server was only ever convenience, and it
  would have handed the workflow tool's execution log to the same managed
  store as the accounts.
- **A profile rather than a second compose file.** One file serves both
  installs; `required: false` is the primitive that makes it possible, and it
  costs a Compose 2.20 prerequisite.
- **Photos stay on the machine.** Moving them to Supabase Storage is a real
  adapter with its own backup story; it is 029, not a paragraph here.

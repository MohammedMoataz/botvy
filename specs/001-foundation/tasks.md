# Tasks: Foundation Infrastructure

**Branch**: `001-foundation` | **Input**: `plan.md`, `spec.md`

Conventions: [P] = can run in parallel with adjacent [P] tasks. Each task
lists its verification command; the task is not checked off until that
command has actually been run and its output confirms the acceptance
criteria.

## Phase A — Local LLM (User Story 1, P1)

- [ ] T001 Confirm Ollama service configuration: set `OLLAMA_HOST=0.0.0.0:11434`
      and `OLLAMA_KEEP_ALIVE=-1` as persistent user/system environment
      variables; restart the Ollama service.
      Verify: `netstat -ano | findstr :11434` shows listening on all interfaces.
- [ ] T002 Add a Windows Firewall inbound rule scoping port 11434 to the
      Docker NAT subnet + loopback (not the whole internet).
      Verify: `Get-NetFirewallRule` shows the rule; a request from outside
      the LAN cannot reach 11434 (skip if machine has no public IP exposure
      to test against — note as deferred).
- [ ] T003 Pull `qwen3:4b`.
      Verify: `ollama list` shows `qwen3:4b`.
- [ ] T004 [P] Benchmark: send a streamed chat completion, measure tokens/second.
      Verify: measured throughput ≥ 12 tok/s (SC-001); record the number.
- [ ] T005 [P] Verify json_schema structured output: send a
      `response_format: {"type":"json_schema", "json_schema": {...}, "strict": true}`
      request, confirm the response parses and matches the schema.
- [ ] T006 Verify container reachability: run a throwaway container
      (`docker run --rm curlimages/curl ...`) hitting
      `http://host.docker.internal:11434/v1/models` — confirm it succeeds
      (proves the Phase 1 gateway will be able to reach Ollama).

## Phase B — Postgres + n8n (User Story 2, P1)

- [ ] T007 Write `infra/init-postgres/001_create_databases.sql` creating
      the `botvy` and `n8n` databases (idempotent — `CREATE DATABASE IF NOT
      EXISTS` equivalent via `SELECT ... WHERE NOT EXISTS` + `\gexec`, or a
      shell wrapper since Postgres lacks native `IF NOT EXISTS` for CREATE
      DATABASE).
- [ ] T008 Write `infra/docker-compose.yml`: `postgres:16` service (env
      POSTGRES_USER/PASSWORD from `.env`, volume `pg_data`, init script
      mounted, port `127.0.0.1:5432:5432`) + `n8n` service (pinned image
      tag, `DB_TYPE=postgresdb` and related `DB_POSTGRESDB_*` env vars
      pointed at the `n8n` database, port `127.0.0.1:5678:5678`,
      `depends_on: postgres` with a healthcheck condition).
- [ ] T009 Write `infra/.env.example` documenting every variable T008
      introduces.
- [ ] T010 Bring the stack up: `docker compose -f infra/docker-compose.yml up -d`.
      Verify: `docker compose ps` shows both containers healthy within 60s (SC-002).
- [ ] T011 [P] Verify `botvy` and `n8n` databases both exist:
      `docker exec <postgres> psql -U <user> -l`.
- [ ] T012 [P] Verify n8n is backed by Postgres, not SQLite: open
      `http://localhost:5678`, complete first-run owner setup, confirm no
      `.n8n/database.sqlite` file is created in the n8n volume.

## Phase C — Public ingress boundary (User Story 3, P2)

- [ ] T013 Stand up a placeholder response on the port the future gateway
      will use (e.g. a minimal static container on 127.0.0.1:8080)
      standing in for "the gateway" for this feature only.
- [ ] T014 Add `cloudflared` service to `infra/docker-compose.yml` (profile
      `tunnel`, `TUNNEL_TOKEN` from `.env`) forwarding the named tunnel
      hostname to the placeholder on 8080. **Blocked on user-supplied domain
      + Cloudflare tunnel token** — if unavailable, mark deferred and
      proceed with T015 using the LAN-only profile.
      Verify: external request to `https://<hostname>` returns the
      placeholder's response.
- [ ] T015 Confirm n8n (5678) and Postgres (5432) are NOT reachable from
      outside this machine — attempt from an external network/device or,
      at minimum, confirm the compose bindings are `127.0.0.1:*` (not
      `0.0.0.0:*`) via `docker compose port` / inspecting the compose file.
- [ ] T016 Write `infra/docker-compose.lan.yml` as a compose override that
      excludes the `cloudflared` service, for development without a domain.

## Phase D — Environment documentation & wrap-up

- [ ] T017 Write `infra/docs/ollama-setup.md` and
      `infra/docs/tunnel-setup.md` capturing the manual host-level steps
      from Phases A and C (these aren't things `docker compose up`
      can do, since Ollama and the tunnel prerequisites live outside Docker).
- [ ] T018 Fill root `.env` with every resolvable value (ports, database
      names/user, model name, Postgres credentials generated now) and leave
      explicit `# TODO(user):` placeholders only for values only the
      developer holds (Cloudflare domain, `TUNNEL_TOKEN`).
- [ ] T019 Update `specs/001-foundation/spec.md` status to `Implemented`
      once T001–T016 (or their explicitly-deferred equivalents) are
      verified; commit; merge `001-foundation` → `master`.

## Dependencies

Phase A and Phase B have no dependency on each other and were executed in
parallel. Phase C depends on Phase B (needs Postgres/n8n up to prove they
are *not* reachable) but not on Phase A. Phase D depends on A, B, and C
having run (documents what actually happened, including any deferrals).

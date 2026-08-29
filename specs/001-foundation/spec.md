# Feature Specification: Foundation Infrastructure

**Feature Branch**: `001-foundation`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description: "Foundational infrastructure: repo scaffold, local Ollama LLM serving with OpenAI-compatible API, Postgres, n8n on Postgres, Cloudflare named tunnel, no public exposure except gateway"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Local model answers an OpenAI-shaped request (Priority: P1)

As the developer, I need a locally-hosted LLM reachable both from the host
and from any Docker container on this machine, so every later feature
(chat, intent extraction) has a working inference backend with zero
per-token cost and zero dependency on an external API key.

**Why this priority**: every other feature (chat pipeline, coaching, admin
usage stats) depends on the model being reachable. Nothing else can be
built or verified without it.

**Independent Test**: `curl http://localhost:11434/v1/chat/completions` from
the host returns a completion; the same request issued from inside a
throwaway container via `host.docker.internal:11434` also succeeds; a
request with `response_format: {"type":"json_schema", ...}` returns JSON
conforming to the schema.

**Acceptance Scenarios**:

1. **Given** Ollama is installed and `qwen3:4b` is pulled, **When** a chat
   completion request is sent to the OpenAI-compatible endpoint, **Then** a
   streamed response is returned at a measured throughput of at least 12
   tokens/second.
2. **Given** the model is loaded, **When** a request sets
   `response_format` to a JSON schema, **Then** the response body parses as
   JSON and satisfies that schema.

---

### User Story 2 - Application data and workflow engine share one database host (Priority: P1)

As the developer, I need a single PostgreSQL instance holding two logical
databases (`botvy` for the gateway, `n8n` for the workflow engine), so
there is exactly one stateful service to operate and back up, and n8n
never needs its own SQLite file.

**Why this priority**: every later data-owning feature (auth, reminders,
devices) depends on the `botvy` database existing and being reachable; n8n
itself must be running for any workflow feature to build on.

**Independent Test**: `docker compose up -d postgres n8n` brings both
containers to a healthy state; connecting to `botvy` and `n8n` databases
independently succeeds; the n8n editor loads at `http://localhost:5678`.

**Acceptance Scenarios**:

1. **Given** the compose stack is started fresh, **When** Postgres
   initializes, **Then** both the `botvy` and `n8n` databases exist and are
   reachable on `127.0.0.1:5432`.
2. **Given** Postgres is healthy, **When** n8n starts, **Then** it reports
   its own healthy status backed by the `n8n` database (not an internal
   SQLite file).

---

### User Story 3 - Only one thing is reachable from the internet (Priority: P2)

As the developer, I need a stable public hostname that reaches only the
future gateway service, while Postgres, n8n, and Ollama stay unreachable
from outside this machine, so the public attack surface is exactly one
audited entry point from day one — before any application code exists to
protect.

**Why this priority**: retrofitting network isolation after other services
are already built and habitually accessed directly is an easy oversight
to introduce; establishing the boundary now makes every later feature
correct by default.

**Independent Test**: from a device outside the local network, the tunnel
hostname resolves and reaches a placeholder response; from the same
external device, `n8n`'s editor port and Postgres's port are unreachable.

**Acceptance Scenarios**:

1. **Given** the named Cloudflare tunnel is configured and running,
   **When** an external client requests `https://<hostname>`, **Then** it
   receives a response (even if a temporary placeholder, since the gateway
   does not exist yet).
2. **Given** the same external client, **When** it attempts to reach port
   `5678` (n8n) or `5432` (Postgres) on the tunnel hostname or the host's
   public IP, **Then** the connection fails — those ports are bound to
   `127.0.0.1` only.

---

### Edge Cases

- What happens if Ollama defaults to binding `127.0.0.1` only? → Containers
  cannot reach it; this is the documented #1 setup mistake and must be
  caught by the container-side curl test, not assumed away.
- What happens if the measured local-model throughput is below the 12
  tok/s gate? → Treated as a blocking finding, not a soft warning; later
  chat-streaming UX depends on this number.
- What happens if no domain is available for the named tunnel yet? → A
  LAN-only compose profile (no cloudflared service) must still bring up
  Postgres + n8n + Ollama connectivity for local development to continue.
- What happens on Windows host restart? → Docker Desktop, Ollama, and
  Cloudflare tunnel must all be configured to start automatically, since
  this machine is also the only server.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST provide a `docker-compose.yml` at
  `infra/` that brings up PostgreSQL 16 and a pinned n8n version, with n8n
  configured to use Postgres (`DB_TYPE=postgresdb`) rather than its default
  internal SQLite store.
- **FR-002**: PostgreSQL MUST be initialized with two databases: `botvy`
  (future gateway data) and `n8n` (workflow engine data).
- **FR-003**: Both Postgres and n8n MUST bind only to `127.0.0.1` on the
  host — never to `0.0.0.0` or a public interface.
- **FR-004**: Ollama MUST run natively on the Windows host (for GPU
  access) with `OLLAMA_HOST=0.0.0.0:11434` so Docker containers on this
  machine can reach it via `host.docker.internal`, while Windows Firewall
  restricts inbound access on that port to the Docker NAT subnet and
  loopback only.
- **FR-005**: The `qwen3:4b` model MUST be pulled and MUST answer an
  OpenAI-compatible `/v1/chat/completions` request, including a
  `response_format: json_schema` request that returns schema-conforming
  JSON.
- **FR-006**: A Cloudflare named tunnel MUST be configured (stable
  hostname, `TUNNEL_TOKEN`-based) forwarding to a to-be-built gateway
  service; n8n's editor and API MUST NOT be reachable through this tunnel.
- **FR-007**: The repository MUST provide a `.env.example` documenting
  every environment variable this and all subsequent Foundation-dependent
  services require, and a `.env` with every value the developer can supply
  themselves already filled in.
- **FR-008**: The project MUST have a git history where this feature's
  work is isolated to branch `001-foundation` and merged to `master` only
  once its acceptance scenarios are demonstrated.
- **FR-009**: A LAN-only compose profile MUST exist that omits the
  cloudflared service, so local development is not blocked on a domain
  being available.

### Key Entities

- **Ollama model registry**: the set of locally pulled models
  (`qwen3:4b` for interactive use); not a database entity, but a
  host-level resource every later LLM-calling feature depends on.
- **Postgres databases** (`botvy`, `n8n`): two independent schemas on one
  server instance; `botvy` is empty in this feature (schema arrives in
  Feature 002) and `n8n` is owned entirely by n8n itself.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A chat completion from `qwen3:4b` streams at a measured
  throughput of at least 12 tokens/second on this machine's GTX 1050 (4GB
  VRAM).
- **SC-002**: `docker compose up -d` (default profile) brings Postgres and
  n8n to a healthy state in under 60 seconds on a machine that already has
  the images cached.
- **SC-003**: An external request to the tunnel hostname succeeds while
  the same request to n8n's or Postgres's port, from the same external
  vantage point, fails — verified, not assumed.
- **SC-004**: Every environment variable this feature introduces is
  documented in `.env.example`; every value the developer already knows
  (ports, database names, model name) is filled into `.env`; only values
  only the user holds (tunnel token, domain name) remain as explicit
  placeholders.

## Assumptions

- Docker Desktop is already installed and licensed for this personal-use
  case (confirmed present on this machine).
- Ollama is already installed on this machine (confirmed present); only
  the model pull and host-binding configuration are new.
- The developer will supply a Cloudflare account, a domain, and a tunnel
  token; until supplied, the LAN-only profile is the working default and
  the public-tunnel acceptance scenario is deferred, not blocking.
- No application code (gateway, mobile, admin) exists yet in this feature
  — User Story 3's external request against the tunnel is validated
  against a placeholder response (e.g. cloudflared's own default page or a
  minimal echo container), not the real gateway, which is Feature 002+.
- This machine (i7-8750H, 32GB RAM, GTX 1050 4GB VRAM) is both the
  development machine and, for now, the only deployment target.

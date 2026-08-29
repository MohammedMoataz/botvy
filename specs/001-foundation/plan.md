# Implementation Plan: Foundation Infrastructure

**Branch**: `001-foundation` | **Date**: 2026-08-29 | **Spec**: `specs/001-foundation/spec.md`

**Input**: Feature specification from `specs/001-foundation/spec.md`

## Summary

Stand up the infrastructure every later feature depends on: a locally
served OpenAI-compatible LLM (Ollama + qwen3:4b), a shared PostgreSQL
instance hosting both the future gateway's database and n8n's own
database, n8n itself (empty of workflows for now), and a public ingress
that reaches nothing but a placeholder today — so the "only the gateway is
public" boundary exists before there's a gateway to protect.

## Technical Context

**Language/Version**: N/A (infrastructure only — no application code this feature)

**Primary Dependencies**: Docker Compose, PostgreSQL 16 image, n8n (pinned image), Ollama (native Windows install), cloudflared

**Storage**: PostgreSQL 16, two databases (`botvy`, `n8n`)

**Testing**: Manual verification via curl/docker/PowerShell per spec's Acceptance Scenarios (no application test suite exists yet)

**Target Platform**: Windows 11 host (Docker Desktop Linux containers + native Ollama), portable to any Docker host per constitution's transferability requirement

**Project Type**: Infrastructure/ops (compose stack + host configuration)

**Performance Goals**: qwen3:4b ≥ 12 tokens/second streamed on GTX 1050 4GB VRAM

**Constraints**: Postgres and n8n bound to 127.0.0.1 only; Ollama bound 0.0.0.0 but firewall-scoped; only the (future) gateway reachable publicly

**Scale/Scope**: single developer machine today; compose file must work unmodified on any Docker host per constitution (Technology & Deployment Constraints)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Gateway Owns All Data** — N/A this feature (no gateway yet); satisfied by design: `n8n` database is n8n's own, `botvy` database is created empty and untouched by any other process.
- **II. n8n Is Workflow Infrastructure Only** — satisfied: n8n has no workflows yet; its editor/API bound to 127.0.0.1, never tunneled.
- **III. Local-First LLM** — satisfied: Ollama is the only inference path introduced; no cloud LLM call exists in this feature.
- **IV. Forward-Only Migrations** — N/A this feature (no Prisma schema yet — that's Feature 002).
- **V. Single Public Surface** — satisfied by construction: the named tunnel forwards to a placeholder container standing in for the future gateway; Postgres/n8n/Ollama are never targets of the tunnel.
- **VI. Multi-User By Default** — N/A this feature (no data model yet).
- **VII. Test-Then-Verify** — satisfied: every FR has a corresponding manual verification command executed and its output captured before the feature is marked done (see tasks.md).
- **VIII. YAGNI** — satisfied: no gateway code, no n8n workflows, no mobile/admin scaffolding introduced here — only what later features require to exist first.

No violations. Complexity Tracking table not needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-foundation/
├── plan.md              # this file
├── spec.md              # feature specification
└── tasks.md             # execution checklist
```

### Source Code (repository root)

```text
E:\Work\botvy\
├── infra/
│   ├── docker-compose.yml       # postgres + n8n + cloudflared (named-tunnel profile) + placeholder gateway-stub
│   ├── docker-compose.lan.yml   # override: omit cloudflared for LAN-only development
│   ├── init-postgres/           # 001_create_databases.sql — creates `botvy` and `n8n` databases
│   ├── .env.example
│   └── docs/
│       ├── ollama-setup.md      # native install, OLLAMA_HOST, firewall rule, model pull, benchmark command
│       └── tunnel-setup.md      # Cloudflare named tunnel setup steps (domain, token, DNS)
└── .env                          # gitignored; real values for this machine
```

**Structure Decision**: Infrastructure-only layout under `infra/`, matching the repo layout already fixed by the approved architecture plan (`apps/`, `packages/`, `workflows/` directories are created by later features that populate them — an empty scaffold here would be unused structure, contrary to Principle VIII).

## Complexity Tracking

No violations to justify.

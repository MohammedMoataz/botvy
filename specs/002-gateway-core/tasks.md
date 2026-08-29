# Tasks: Gateway Core (Auth + Chat)

**Branch**: `002-gateway-core` | **Input**: `plan.md`, `spec.md`

## Phase A — Scaffold

- [x] T001 Scaffold `apps/gateway` (NestJS, TypeScript, pnpm) inside the workspace.
      Done: `@botvy/gateway` package, pnpm workspace at repo root.
      Note: `pnpm` is invoked as `npx pnpm@latest` — a global corepack
      install fails with EPERM against `C:\Program Files\nodejs`.
- [x] T002 Add Prisma; write `schema.prisma` for User, RefreshToken, Message, UsageLog per plan's Key Entities.
      Pinned Prisma 6.19.3 (not 7.x — 7 moves to a new config format;
      no reason to absorb that churn at this scope).
- [x] T003 Add a `gateway` service to `infra/docker-compose.yml` (build from `apps/gateway`, env from root `.env`, `depends_on: postgres`); point Cloudflare tunnel's public hostname at it instead of `gateway-stub`.
      Done: `gateway-stub` placeholder deleted, real `gateway` service in
      its place with `extra_hosts: host.docker.internal:host-gateway` so the
      container can reach host-native Ollama; cloudflared now depends on
      `gateway`. Container CMD runs `prisma migrate deploy` before boot so a
      fresh machine converges its schema automatically.
      Verified: `docker compose config --quiet` passes.
- [x] T004 `prisma migrate dev` — generate + apply the initial migration against the `botvy` database from Feature 001.
      Verified: migration `20260829175841_init` committed; `psql -d botvy -c "\dt"`
      lists `users`, `refresh_tokens`, `messages`, `usage_log` (+ `_prisma_migrations`).

## Phase B — Auth (User Story 1, P1)

- [x] T005 Auth module: register (argon2id hash, duplicate-email rejection), login (issue access + refresh JWT pair).
- [x] T006 Refresh rotation: refresh endpoint issues a new pair and revokes the old refresh token; reusing a revoked token is rejected.
- [x] T007 Roles guard + decorator (`user`/`admin`); every route but `/health` requires a valid access token.
      Implemented as a global `JwtAuthGuard` + `RolesGuard` pair with a
      `@Public()` decorator escape hatch for register/login/refresh/health.
- [x] T008 [P] vitest: refresh-rotation reuse-detection unit test.
- [x] T009 Verify via curl.
      Verified output:
      - register alice → `{"id":"0f6589dd-...","email":"alice@example.com","role":"user"}`
      - duplicate register → `{"message":"An account with this email already exists","error":"Conflict","statusCode":409}`
      - `/chat/history` with no token → `status: 401`
      - refresh #1 → new token pair issued
      - reuse of the same refresh token → `{"message":"Refresh token has already been used or revoked",...,"statusCode":401}`
      Bug found and fixed during verification: optional `displayName` was
      rejected as required because `@IsOptional()` was missing, so duplicate
      registration returned 400 (validation) instead of 409 (conflict).

## Phase C — Chat pipeline (User Story 2, P1)

- [x] T010 LLM service: `openai` client against `OLLAMA_BASE_URL`; `extract(schema, messages)` (temp 0, json_schema) and `chat(messages)` (temp 0.4, streamed).
- [x] T011 `prompts/intent.md`, `prompts/chat.md` written and loaded at boot.
- [x] T012 Chat controller: `POST /chat` SSE pipeline.
- [x] T013 `GET /chat/history` scoped to the authenticated user only.
- [x] T014 15-second SSE heartbeats; error event + clean close on LLM failure.
- [x] T015 [P] vitest: intent-branch fallback.
- [x] T016 Verify via `curl -N` with two users.
      Verified SSE stream (alice, "Reply with exactly: hello alice"):
      ```
      event: heartbeat / data: {}
      event: intent   / data: {"intent":"chat","fallback":true}
      event: token    / data: hello
      event: token    / data:  alice
      event: done     / data: {}
      ```
      Isolation verified: alice `/chat/history` → 2 messages (her turn +
      the assistant reply, both persisted); bob `/chat/history` → 0. (SC-001)

      **Bug found and fixed during verification:** the initial 10s OpenAI-SDK
      timeout was shorter than a CPU-only inference call, so EVERY
      structured-extraction call silently timed out and degraded to the plain
      chat fallback (`"fallback":true` above). Root-caused from the log line
      `extract() failed ... Error: Request timed out.` Timeout is now
      configurable (`LLM_REQUEST_TIMEOUT_MS`, default 120s).
      Re-verified after the fix, "remind me to call mom tomorrow at 5pm" →
      `{"intent":"structured_action","fallback":false}` — json_schema
      constrained decoding works correctly on this Ollama build, which
      de-risks the Reminders feature.

      Deferred: the explicit 60s-idle heartbeat soak (SC-002). Heartbeats are
      observably emitted (see the stream above); the timed soak is worth
      re-running once inference is not CPU-bound.

## Phase D — Quota & rate limiting (User Story 3, P2)

- [x] T017 `@nestjs/throttler` global guard with a configurable per-minute limit.
- [x] T018 Usage service: log token usage; reject with a distinct 429 when the daily total is exceeded, checked *before* any model call.
- [x] T019 [P] vitest: quota-boundary unit test.
- [x] T020 Verify via curl (SC-003).
      Rate limit — 25 rapid requests against a limit of 20/min:
      `200 ×20, then 429 429 429 429 429` (exactly 5 rejections).
      Daily quota — seeded 55,000 tokens against a 50,000 quota, waited for
      the rate window to reset, then one chat request:
      `{"reason":"daily_quota_exceeded","quota":50000}` with `status: 429`.
      The two 429s are distinguishable, as required. Seeded row deleted after.

## Phase E — Health, docs, wrap-up

- [x] T021 `GET /health` — Postgres + Ollama reachability, no auth.
      Verified: `{"status":"ok","database":true,"ollama":true}`.
      **Bug found and fixed during verification:** `OLLAMA_BASE_URL` was set to
      `host.docker.internal`, which only resolves inside a container, so a
      host-run gateway hung. Split into `OLLAMA_BASE_URL` (host: localhost)
      and `OLLAMA_BASE_URL_CONTAINER` (compose override), and gave the SDK an
      explicit timeout so an unreachable backend reports down instead of hanging.
- [x] T022 `@nestjs/swagger` wired in `main.ts` (SC-004).
      Verified: `GET /docs-json` exports all six routes — `/auth/register`,
      `/auth/login`, `/auth/refresh`, `/chat`, `/chat/history`, `/health` —
      plus schemas RegisterDto, LoginDto, TokenPairDto, RefreshDto,
      SendMessageDto. Saved as `apps/gateway/openapi.json`, the frozen
      contract the Flutter and admin clients generate against.
- [ ] T023 Update spec status to `Implemented`; merge `002-gateway-core` → `001-foundation`.

### Test suite

`vitest run` → **16 passed (3 files)**: quota boundaries, refresh rotation +
reuse/expiry/tamper detection, duration parsing, and intent-extraction
fallback paths (malformed JSON, empty content, backend throw).

## Dependencies

Phase A blocks everything (scaffold + schema + migration must exist
first). Phase B and Phase C both depend on Phase A but not on each other
structurally — however Phase C's chat pipeline requires an authenticated
user to test against, so Phase B is implemented first in practice. Phase D
depends on Phase C existing (quota wraps the chat call). Phase E runs
last, verifying the whole feature together.

## Note on the Feature 001 Ollama blocker

T010–T016 use whatever Ollama configuration is currently active
(CPU-forced fallback, per Feature 001's tasks.md). Correctness — does the
pipeline extract intent, stream tokens, isolate users — is fully
verifiable under CPU fallback, just slowly. Throughput is explicitly out
of scope for this feature's acceptance criteria (see spec.md Assumptions)
and remains tracked as Feature 001's open item.

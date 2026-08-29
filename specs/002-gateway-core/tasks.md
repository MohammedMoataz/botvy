# Tasks: Gateway Core (Auth + Chat)

**Branch**: `002-gateway-core` | **Input**: `plan.md`, `spec.md`

## Phase A — Scaffold

- [ ] T001 Scaffold `apps/gateway` (NestJS, TypeScript, pnpm) inside the workspace.
- [ ] T002 Add Prisma; write `schema.prisma` for User, RefreshToken, Message, UsageLog per plan's Key Entities.
- [ ] T003 Add a `gateway` service to `infra/docker-compose.yml` (build from `apps/gateway`, env from root `.env`, `depends_on: postgres`); point Cloudflare tunnel's public hostname at it instead of `gateway-stub` (compose file only — actual DNS/dashboard change is user's, per Feature 001's tunnel-setup.md).
- [ ] T004 `prisma migrate dev` — generate + apply the initial migration against the `botvy` database from Feature 001.
      Verify: migration file committed; `prisma studio` or `psql` shows the four tables.

## Phase B — Auth (User Story 1, P1)

- [ ] T005 Auth module: register (argon2id hash, duplicate-email rejection), login (issue access + refresh JWT pair).
- [ ] T006 Refresh rotation: refresh endpoint issues a new pair and revokes the old refresh token; reusing a revoked token is rejected.
- [ ] T007 Roles guard + decorator (`user`/`admin`); every route but `/health` requires a valid access token.
- [ ] T008 [P] vitest: refresh-rotation reuse-detection unit test.
- [ ] T009 Verify via curl: register → login → call a protected route with the access token → refresh → confirm old refresh token now rejected (SC per User Story 1's acceptance scenarios).

## Phase C — Chat pipeline (User Story 2, P1)

- [ ] T010 LLM service: `openai` client against `OLLAMA_BASE_URL`; `extract(schema, messages)` (temp 0, json_schema) and `chat(messages)` (temp 0.4, streamed).
- [ ] T011 `prompts/intent.md`, `prompts/chat.md` written and loaded at boot.
- [ ] T012 Chat controller: `POST /chat` — quota check → intent call → SSE `event: intent` → if not a recognized structured action, streamed `event: token`/`event: done` → persist both turns to `Message` scoped to the authenticated user.
- [ ] T013 `GET /chat/history` scoped to the authenticated user only.
- [ ] T014 15-second SSE heartbeat comments; error event + clean close if the LLM call fails mid-stream.
- [ ] T015 [P] vitest: intent-branch fallback (malformed JSON from the model falls back to plain chat, per spec's Edge Cases).
- [ ] T016 Verify via `curl -N` with two separately registered users: each streams a reply, each sees only their own `/chat/history`; hold one connection idle 60s+ and confirm heartbeats keep it alive (SC-001, SC-002).

## Phase D — Quota & rate limiting (User Story 3, P2)

- [ ] T017 `@nestjs/throttler` global guard with a configurable per-minute limit.
- [ ] T018 Usage service: log every chat call's token usage; reject with 429 (distinct message) when the authenticated user's daily total exceeds the configured quota — checked *before* any model call is made.
- [ ] T019 [P] vitest: quota-boundary unit test (request that would exceed quota is rejected pre-call).
- [ ] T020 Verify via curl: exceed the rate limit → 429; exceed the daily quota → distinct 429 (SC-003).

## Phase E — Health, docs, wrap-up

- [ ] T021 `GET /health` — Postgres connectivity (Prisma `$queryRaw` ping) + Ollama reachability (`/api/tags`), no auth required.
- [ ] T022 `@nestjs/swagger` wired in `main.ts`; confirm every route from this feature appears (SC-004).
- [ ] T023 Update `specs/002-gateway-core/spec.md` status to `Implemented`; commit; merge `002-gateway-core` → `001-foundation` (not `master` — Feature 001 itself is still pending the user's Ollama/driver decision before merging further up).

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

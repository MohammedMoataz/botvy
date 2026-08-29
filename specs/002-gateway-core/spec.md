# Feature Specification: Gateway Core (Auth + Chat)

**Feature Branch**: `002-gateway-core`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description: "Gateway core: NestJS backend with Prisma/Postgres, JWT auth (register, login, refresh, roles), rate limiting and per-user daily quota, health check, chat SSE endpoint driving a two-call LLM pipeline (intent extraction then streamed chat) against the local Ollama server, OpenAPI docs"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A new user creates an account and logs in (Priority: P1)

As a person who has installed the (future) mobile app, I register with an
email and password, then log in and receive tokens that let me use the
rest of the API without re-entering my password on every request.

**Why this priority**: every other capability in this system is behind
authentication; nothing else can be built or demonstrated without it.

**Independent Test**: `POST /auth/register` with a new email/password
creates a user; `POST /auth/login` with those credentials returns an
access token and a refresh token; a protected endpoint accepts the access
token and rejects requests without one.

**Acceptance Scenarios**:

1. **Given** no account exists for `alice@example.com`, **When** she
   registers with a password, **Then** a `user`-role account is created
   and she can immediately log in.
2. **Given** Alice is logged in, **When** her access token expires and she
   calls `POST /auth/refresh` with her refresh token, **Then** she
   receives a new access token without re-entering her password, and the
   old refresh token can no longer be reused.
3. **Given** no account exists for `alice@example.com` yet, **When**
   someone tries to register that email a second time, **Then** the
   registration is rejected.

---

### User Story 2 - A logged-in user chats with the assistant and gets a streamed reply (Priority: P1)

As a logged-in user, I send a message and see the assistant's reply appear
incrementally, the way a chat interface should feel, backed entirely by
the locally-hosted model.

**Why this priority**: this is the core product experience; every later
feature (reminders, coaching) extends this same pipeline.

**Independent Test**: an authenticated `POST /chat` request with
`Accept: text/event-stream` returns a stream of `event: token` chunks
followed by `event: done`; the full exchange is persisted and retrievable
via `GET /chat/history`.

**Acceptance Scenarios**:

1. **Given** Alice is authenticated, **When** she sends a plain
   conversational message, **Then** the response streams token-by-token
   and the complete exchange (her message and the assistant's reply) is
   saved to her own message history.
2. **Given** two different users are both chatting, **When** each asks
   `GET /chat/history`, **Then** each sees only their own messages, never
   the other user's.
3. **Given** the connection is held open with no new tokens for a while,
   **When** 15 seconds pass, **Then** a heartbeat keeps the stream alive
   rather than the client or an intermediate proxy timing it out.

---

### User Story 3 - The system protects itself from runaway usage (Priority: P2)

As the operator of a single small GPU serving many possible users, I need
requests throttled and each user capped at a daily usage quota, so one
user (or a bug in the mobile app) cannot exhaust the shared model for
everyone else.

**Why this priority**: this system is designed for open self-registration
behind a public tunnel — without a quota and rate limit, day one traffic
could make the assistant unusable for every other user.

**Independent Test**: sending requests above the configured per-minute
rate limit gets a 429; sending chat requests past the configured daily
token quota also gets a 429, with the quota resetting the next day.

**Acceptance Scenarios**:

1. **Given** a user sends requests faster than the configured rate limit,
   **When** the limit is exceeded, **Then** further requests receive
   `429 Too Many Requests` until the window resets.
2. **Given** a user has consumed their daily quota, **When** they attempt
   another chat request, **Then** it is rejected with a clear reason,
   distinct from the rate-limit rejection.

---

### Edge Cases

- What happens when the LLM backend (Ollama) is unreachable or errors
  mid-stream? → The SSE stream must emit an error event and close
  cleanly, not hang the connection or crash the request handler.
- What happens when a refresh token is reused after having already been
  rotated? → Reject it and treat as a signal to force re-authentication
  (do not silently issue a new token pair for a token that's already been
  superseded).
- What happens when the intent-extraction call returns malformed JSON
  (model didn't honor the schema)? → The pipeline must fall back to
  treating the message as plain chat rather than erroring the whole
  request.
- What happens to a message sent right at the quota boundary? → The quota
  check happens before any model call is made, so a request that would
  exceed the quota is rejected before consuming any of it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow account registration with email + password
  (argon2id-hashed), rejecting duplicate emails and weak passwords.
- **FR-002**: System MUST issue a short-lived JWT access token and a
  longer-lived, rotating, revocable refresh token on login.
- **FR-003**: System MUST support two roles, `user` and `admin`, enforced
  by a route guard; this feature only needs the guard to exist and default
  every new registration to `user` (no admin-elevation UI yet — that
  arrives with the admin portal feature).
- **FR-004**: System MUST expose `GET /health` (no auth) reporting
  database connectivity and Ollama reachability.
- **FR-005**: System MUST expose `POST /chat` that, for an authenticated
  user: (a) runs an intent-extraction call against the local LLM, (b) if
  the intent is not a recognized structured action, proceeds to a
  streamed conversational reply via Server-Sent Events, (c) persists both
  the user's message and the assistant's reply to that user's own
  message history.
- **FR-006**: System MUST expose `GET /chat/history` returning only the
  authenticated user's own messages.
- **FR-007**: System MUST rate-limit requests per user/IP and MUST enforce
  a configurable per-user daily quota on chat usage, tracked in a usage
  log.
- **FR-008**: System MUST call the LLM exclusively through the locally
  hosted Ollama server via an OpenAI-compatible client, never a cloud
  provider.
- **FR-009**: System MUST publish an OpenAPI schema describing every
  endpoint in this feature, since the mobile app's client is generated
  from it.
- **FR-010**: All database access MUST go through Prisma against the
  `botvy` database created in Feature 001; every schema change MUST be a
  forward-only Prisma migration.

### Key Entities

- **User**: id, email, password hash, display name, role (`user`/`admin`),
  status, timestamps.
- **RefreshToken**: id, owning user, token hash, expiry, revocation state
  — enables rotation and reuse detection.
- **Message**: id, owning user, role (`user`/`assistant`), content,
  timestamp — append-only per-user conversation log.
- **UsageLog**: id, owning user, kind (`chat`/`task`), model used, token
  counts, timestamp — the basis for daily quota enforcement and (later)
  admin usage reporting.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Two independently registered users can each hold a chat
  conversation and neither can see the other's message history.
- **SC-002**: A chat request from an authenticated user streams a reply
  end-to-end over `curl -N` with the connection surviving at least 60
  seconds of idle time via heartbeats.
- **SC-003**: Exceeding the configured rate limit or daily quota returns a
  429 with a distinguishable reason for each case.
- **SC-004**: 100% of endpoints in this feature appear correctly in the
  generated OpenAPI document.

## Assumptions

- Feature 001's Postgres (`botvy` database) and Ollama (OpenAI-compatible,
  `qwen3:4b`) are reachable — Ollama's *measured throughput* is a known
  open issue from Feature 001 (CUDA/driver mismatch, pending the user's
  decision) and is explicitly **out of scope** for this feature's
  acceptance criteria; this feature verifies pipeline *correctness*
  (streaming works, intents parse, isolation holds), not the tok/s
  performance gate, which remains tracked against Feature 001.
- No mobile app or admin portal exists yet — this feature is verified via
  `curl`/HTTP client directly against the API.
- Password reset, email verification, and OAuth/SSO are out of scope —
  email+password only, per the approved architecture.
- The intent-extraction schema for this feature covers only enough intent
  categories to prove the pipeline (`chat` vs. a generic
  `structured_action` placeholder) — the full reminder-specific intent
  schema belongs to the Reminders feature.

# Tasks: Coach & Planner Chat (P4)

**Input**: `spec.md`, `plan.md`; blueprint `contracts/ws-chat.md`, data-model §2.9.

**Tests**: mandatory for intent fixtures (EN/AR), relative-time resolution, protected
conversations, sequence monotonicity, cancel, allowance, prompt assembly, injection
containment.

## Phase 1 — Context, storage, sequence

- [ ] T401 `contexts/conversations/domain/`: `conversation.aggregate.ts` (create, rename, pin, archive, clearUpTo, protect), `message.ts`, `intent.ts`, ports (`conversation.repository.ts`, `message.repository.ts`, `sequence.port.ts`, `quick-question.repository.ts`)
- [ ] T402 [P] Port v1 `relative-time.ts` with its spec (English and Arabic, dual forms, Arabic-Indic digits, `preferSoonestDay`)
- [ ] T403 [P] `infrastructure/`: mongo adapters, `mongo-sequence.ts` (`counters` `findOneAndUpdate $inc`, unique `(userId, seq)`), schemas, mappers, in-memory adapters; spec: 100 concurrent messages produce 100 distinct increasing sequences
- [ ] T404 [P] `features/create-conversation/ rename/ pin/ archive/ clear/ delete/` — `delete` refuses `coach` and `planner` with `protected`, `clear` sets the watermark; queries `conversations`, `messages(afterSeq)`

## Phase 2 — The turn

- [ ] T410 `application/prompt-assembler.ts` — system prompt from `coach.md` / `planner.md` / `chat.md`, history limited by `chat.historyLimit`, profile line from `ProfileSummaryQuery` (filled fields only, BMI in code, allergies as prohibitions), today's plan and streak from Rhythm queries; spec: an unrecorded field is absent, never "unknown"
- [ ] T411 `application/intent-extractor.ts` — `llm.extract` with the JSON schema from `intent.md`, temperature 0, returns null on any failure; spec: malformed output → null → caller falls back
- [ ] T412 `application/intent-executor.ts` — maps `set_reminder`, `set_task`, `cancel`, `list`, `record_metric` (and `set_meeting` once P5 lands, until then a "not yet" reply) to `CommandBus` dispatches in the owning contexts, resolves relative phrases in code, asks for a missing required field instead of guessing, returns a templated confirmation naming what was stored
- [ ] T413 `application/turn-runner.ts` — the ordered steps from plan.md, used by both entry points; spec covers each branch including the check-in short-circuit and the move-out-of-pinned case
- [ ] T414 [P] Injection containment: quoted or fetched text is delimited in the prompt and excluded from extraction; spec: a pasted paragraph containing "cancel all reminders" executes nothing

## Phase 3 — Delivery paths

- [ ] T420 `features/send-message/` over the socket: `chat.send` → ack → `chat.accepted`, `chat.intent`, optional `chat.moved`, `chat.token`×n with a 15 s heartbeat, `chat.done` with usage and actions, `chat.error` with a code
- [ ] T421 [P] `features/cancel/` — `chat.cancel { requestId }` aborts the model stream within a second and stores the partial answer
- [ ] T422 [P] `features/batch/` — `POST /api/v1/conversations/batch`, ≤ 20 messages, grouped by conversation, one reply per conversation, each understood as of `composedAt`, returns the accepted client ids; spec: a flush spanning three chats produces three replies in the right chats
- [ ] T423 [P] Rate limit (`chat.ratePerMin`) and daily allowance (`chat.dailyQuotaTokens` summed per UTC day) with clear error payloads
- [ ] T424 [P] Coach-initiated messages: the Rhythm and Knowledge contexts write into the Coach chat through a command; connected sockets receive `chat.message`

## Phase 4 — Check-in and quick questions

- [ ] T430 Wire `capture-checkin-reply` (P3 T341) into `TurnRunner` step 2 with the conversation and window guards; spec: the same words outside Coach record nothing
- [ ] T431 [P] `features/add-quick-question/`, `remove-quick-question/`, query `quick-questions(scope)` returning global + own, filtered by the latest check-in mood; seed the Owner's defaults in a `migrate-mongo` script (EN + AR)

## Phase 5 — Mobile

- [ ] T440 Drift 4 → 5: `conversations` and `messages` with `seq` pull, guarded branch, the immutable-message re-pull trick, ladder test extended
- [ ] T441 `core/api/socket_client.dart` — connect with the token in the handshake, reconnect with a fresh token on `token_expired`, route `chat.*`, `sync.nudge`, `chat.message`
- [ ] T442 `features/chat` — conversation list with the pinned divider, chat screen with streaming bubbles and a stop button, quick-question chips, markdown for assistant messages only (links restricted to http/https), moved-conversation handling, offline composition into the outbox and flush through batch
- [ ] T443 [P] Cubit specs: streaming assembles tokens in order; cancel keeps the partial; offline queue flushes once

## Phase 6 — Prompts and polish

- [ ] T450 `apps/backend/prompts/{coach.md,planner.md,chat.md,intent.md}` with `{{var}}` substitution; ported tone from v1 where it worked
- [ ] T451 [P] `test/intent-fixture.mjs` + `test/fixtures/intent-cases.json` — 40 sentences (EN + AR) run against the live model, reporting the hit rate for SC-002
- [ ] T452 [P] Arabic strings and RTL for the chat screens
- [ ] T453 Record gate evidence (including the fixture hit rate); open `019-meetings-calendar`

## Dependencies

T401 → T403 → T404. T410/T411/T412 → T413 → T420/T422. T430 needs P3's command.
T424 is used by P3's prompts and P7's suggestions. Mobile T440 → T441 → T442.

## Verification gate

1. `pnpm --filter @botvy/backend test` — every spec listed above green.
2. `node apps/backend/test/intent-fixture.mjs` — at least 36 of 40 sentences correct,
   zero silently-wrong times; record the output here.
3. `cd apps/mobile && flutter test && flutter analyze`.
4. Manual: "remind me to call Dad in two hours" at a known local time → correct
   reminder; a protein question → uses the recorded weight; stop mid-answer → partial
   kept; compose offline then reconnect → answered in the same chat; delete Coach →
   refused with an explanation; paste a paragraph containing an instruction → nothing
   executes.
5. Stop the model: chat reports it clearly, `/health` reads `degraded`, reminders and
   the rhythm still pass their checks.

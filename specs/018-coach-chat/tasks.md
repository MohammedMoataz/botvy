# Tasks: Coach & Planner Chat (P4)

**Input**: `spec.md`, `plan.md`; blueprint `contracts/ws-chat.md`, `contracts/sync.md`,
`contracts/events.md`, data-model §2.9.

**Task ids are phase-local.** The blueprint's own `tasks.md` runs a separate `T###`
series in which `T401`–`T404` mean something else entirely; nothing below corresponds
to it by number, only by the phase it belongs to.

**Tests**: mandatory for intent fixtures (EN/AR), a parsed intent becoming a command, a
confirmation or a question, relative-time resolution, the off-topic move, protected
conversations, conversation ownership, sequence monotonicity, cancel, the allowance
boundary, prompt assembly, the allergen guard, injection containment, the backfill.

## Phase 1 — Extending P3's skeleton

P3 (`017` T305) already shipped `conversation.aggregate.ts`, `message.ts`, their ports,
the mongo and in-memory adapters, the `counters` sequence, `bootstrap-on-registered/`
(the pinned `coach` and `planner` on `identity.UserRegistered`) and `append-message/`.
Nothing below re-creates them.

- [ ] T401 Extend `contexts/conversations/domain/`: add `rename`, `pin`, `archive` and `protect` to `conversation.aggregate.ts` (the two pinned kinds refuse all three of delete, unpin and archive), add `intent.ts` (name + `scope: 'coaching'|'planning'|'other'` + typed args) and the `quick-question.repository.ts` port; the P3 ports are imported, not redeclared
- [ ] T402 [P] Port v1 `relative-time.ts` with its spec (English and Arabic, dual forms, Arabic-Indic digits, `preferSoonestDay`); fixtures written relative to `Date.now()`
- [ ] T403 [P] Extend `infrastructure/`: the `quick_questions` mongo adapter, schema, mapper and in-memory twin; confirm P3's `mongo-sequence.ts` unique `(userId, seq)` index under this phase's load; spec: 100 concurrent messages produce 100 distinct increasing sequences
- [ ] T404 [P] `features/create-conversation/ rename/ pin/ archive/ clear/ delete/` — every repository read is scoped by `userId` and a conversation belonging to another member answers `forbidden` (never `not_found`, which would confirm it exists); `delete`, `unpin` and `archive` refuse `coach` and `planner` with `protected`; `clear` sets `clearedUpToSeq`; queries `conversations` and `messages(afterSeq)` start at `max(afterSeq, clearedUpToSeq)`; specs: each of the three refusals on each pinned kind, a foreign `conversationId` is `forbidden`, a cleared chat's history is empty for a caller passing `afterSeq: 0`
- [ ] T405 `features/backfill-pinned/` — a `migrate-mongo` script that gives every member who registered before P3's bootstrap existed (the seeded administrator among them) the two pinned conversations, reusing the same bootstrap command so there is one creator; spec: the script is idempotent, a member who already has both gains nothing, and a member with only one gains the other
- [ ] T406 [P] Register `conversations` and `messages` with the Sync pull (P2's facade): conversations by `updatedAt`, messages by `seq > max(lastSeq, clearedUpToSeq)`, conversations queried after messages per `sync.md`; spec: a clear pushed from one device empties the chat on a second device's next pull and does not return on the one after

## Phase 2 — The turn

- [ ] T450 `apps/backend/prompts/{coach.md,planner.md,chat.md,intent.md}` with `{{var}}` substitution; ported tone from v1 where it worked; `intent.md`'s JSON schema carries the `scope` field. First in this phase because it is the extractor's grammar and the assembler's template, not decoration
- [ ] T410 `application/prompt-assembler.ts` — system prompt from `coach.md` / `planner.md` / `chat.md`, history limited by `chat.historyLimit` (P0's registry key) and starting no earlier than `clearedUpToSeq`, profile line from `ProfileSummaryQuery` (filled fields only, BMI in code, allergies as prohibitions), today's plan and streak from Rhythm queries; specs: an unrecorded field is absent, never "unknown"; a cleared chat contributes no history
- [ ] T411 `application/intent-extractor.ts` — `llm.extract` with the JSON schema from `intent.md`, temperature 0 as a code constant (any other value parses the same sentence two ways, so it is not an operator knob), returns null on any failure; spec: malformed output → null → caller falls back
- [ ] T412 `application/intent-executor.ts` — maps `set_reminder`, `set_task`, `cancel`, `list`, `record_metric`, `update_profile` (foods, allergies, goal, symptoms — confirmed in one line before dispatching Profile commands) (and `set_meeting` once P5 lands, until then a "not yet" reply) to `CommandBus` dispatches in the owning contexts, resolves relative phrases in code, asks for a missing required field instead of guessing, returns a templated confirmation naming what was stored; spec: a complete intent dispatches exactly one command and confirms the stored values; an intent missing a required field dispatches nothing and returns a question; a `cancel` matching two reminders dispatches nothing and asks which; `set_meeting` before P5 dispatches nothing and says so; each case in English and Arabic
- [ ] T413 `application/turn-runner.ts` — the ordered steps from plan.md, used by both entry points; the move rule is `conversation is pinned && intent.scope === 'other'`, the new chat's title is the member's first six words trimmed to 60 characters, and `chat.moved` is emitted before any token; spec covers each branch: the check-in short-circuit, a `planning` intent in Coach executing in place, an `other` intent in Coach moving to a titled new chat with nothing left behind, an `other` intent in a free chat not moving
- [ ] T414 [P] Injection containment: quoted or fetched text is delimited in the prompt and excluded from extraction; spec: a pasted paragraph containing "cancel all reminders" executes nothing
- [ ] T415 [P] `application/allergen-guard.ts` — checks the answer accumulated so far at each chunk boundary against the member's declared allergies over normalised text (case, diacritics and Arabic letter forms folded, plurals and seeded synonyms, whole words only), aborts the stream on a hit, discards the partial rather than storing it, and retries the turn once with the allergy restated; spec: "peanut butter", "peanuts" and "فول سوداني" are each caught for a peanut allergy, a hit arriving mid-stream stores no partial, an answer naming an unrelated food passes untouched, and the aborted case delivers the short refusal rather than nothing

## Phase 3 — Delivery paths

- [ ] T420 `features/send-message/` over the socket: `chat.send` → ack → `chat.accepted`, `chat.intent`, optional `chat.moved`, `chat.token`×n with `chat.heartbeat` every 15 s of model silence, `chat.card` for list intents (`tasks`, `reminders`, `meetings`, `plan` — the `sessions` kind in the same contract is produced by P6 `020`), `chat.done` with usage and actions, `chat.error` with a code; a socket that disconnects mid-turn does not abort it — the turn finishes, the assistant message is stored and the member's other sockets get `sync.nudge{ entities: ['messages'] }`; specs: a disconnect leaves a complete stored answer and one nudge, two sockets of the same member sending in the same tick are both answered on their own sockets and take distinct increasing `seq` values, a `chat.send` naming another member's conversation answers `chat.error{ code: 'forbidden' }`
- [ ] T421 [P] `features/cancel/` — `chat.cancel { requestId }` aborts the model stream and stores the partial answer with `intent: { cancelled: true }`; spec: against an in-memory stream, the abort signal is raised and no further token is stored, measured under one second from the event; a `requestId` the member does not own cancels nothing
- [ ] T422 [P] `features/batch/` — `POST /api/v1/conversations/batch`, ≤ 20 messages, grouped by conversation, one reply per conversation, each understood as of `composedAt`, returns the accepted client ids, and connected sockets of the same member get `sync.nudge{ entities: ['messages'] }`; spec: a flush spanning three chats produces three replies in the right chats
- [ ] T423 [P] Rate limit (`chat.ratePerMin`) and the daily allowance: `chat.dailyQuotaTokens` (P0's registry key, default 120000) compared against `UsageTodayQuery` summed over the member's local day resolved through `shared/time`, returning `chat.error{ code: 'quota' }` naming the limit and the reset in the member's zone; specs, with fixtures relative to `Date.now()`: a member one token under the allowance is answered, one token over is refused, a member in Cairo and a member in Berlin cross their own midnights and not each other's, and the refusal message states a local time
- [ ] T424 [P] Coach-initiated messages: the Rhythm and Knowledge contexts write into the Coach chat through P3's `append-message` command; connected sockets receive `chat.message` with its `kind`; spec: a message appended while the member has two sockets open reaches both
- [ ] T425 [P] The usage loop: `conversations.MessageSent` carries `{ model, promptTokens, completionTokens, ms }`; an Operations handler writes one `usage_log` row per event, idempotent on `eventId`; Operations declares `UsageTodayQuery { userId, from, to }` on the QueryBus and Conversations calls it — neither context touches the other's collection; spec: two turns and a replayed event produce two rows, and the query returns their sum for a window covering both and zero for the day before

## Phase 4 — Check-in and quick questions

- [ ] T430 Wire `capture-checkin-reply` (P3 T341) into `TurnRunner` step 2 with the conversation and window guards, the window being `rhythm.checkinWindowHours` (P0's registry key, 12 hours by default) as P3 reads it; specs: the same words outside Coach record nothing; the same words inside Coach after the window has passed record nothing and are answered as ordinary text
- [ ] T431 [P] `features/add-quick-question/`, `remove-quick-question/`, query `quick-questions(chatKind)` returning global + own, filtered by the member's latest check-in mood read through `LatestCheckinQuery` on the QueryBus (served by P3's `checkins` slice, T342) — never by reading Rhythm's collection; seed the Owner's defaults in a `migrate-mongo` script (EN + AR); spec: a low mood brings a lighter-day question to the top, another member's own question is not returned

## Phase 5 — Mobile

- [ ] T440 Drift 4 → 5: `conversations` and `messages` with `seq` pull, guarded branch, the immutable-message re-pull trick, ladder test extended
- [ ] T441 `core/api/socket_client.dart` — connect with the token in the handshake, reconnect with a fresh token on `token_expired`, route `chat.*`, `sync.nudge`, `chat.message`
- [ ] T442 `features/chat` — conversation list with the pinned divider, chat screen with streaming bubbles and a stop button, structured cards for list answers (tap to open or complete), quick-question chips, markdown for assistant messages only (links restricted to http/https), moved-conversation handling, offline composition into the outbox and flush through batch
- [ ] T443 [P] Cubit specs: streaming assembles tokens in order; cancel keeps the partial; offline queue flushes once

## Phase 6 — Polish and evidence

- [ ] T451 [P] `test/intent-fixture.mjs` + `test/fixtures/intent-cases.json` — 40 sentences (EN + AR, including stated facts like "I weigh 80 kg" and list requests) run against the live model on the reference host, reporting the hit rate for SC-002 and the first-token latency for SC-001; times in the cases are expressed relative to the run's own clock
- [ ] T452 [P] Arabic strings and right-to-left layout for the chat screens (FR-019): the streaming bubble, the quick-question chips, the structured cards and the pinned divider; RTL screenshots recorded with the gate evidence
- [ ] T453 [P] `purge-on-deleted` handler for `conversations`, `messages`, `counters` and the member's own `quick_questions` on `identity.UserDeleted`, and `features/close-on-banned/` closing the member's sockets on `identity.UserBanned` (P1 raises it); specs: a purged member's `seq` counter is gone, a banned member's open sockets are disconnected and a `chat.send` afterwards is refused
- [ ] T454 Record gate evidence (the fixture hit rate, the first-token measurement, the RTL screenshots); open `019-meetings-calendar`

## Dependencies

T401 → T403 → T404 → T406. T405 needs P3's `bootstrap-on-registered` (`017` T305).
T450 → T410/T411 (the prompt files are the assembler's templates and the extractor's
grammar). T410/T411/T412/T415 → T413 → T420/T422. T423 needs T425's `UsageTodayQuery`.
T430 needs P3's `capture-checkin-reply` (`017` T341); T431 needs P3's `checkins` query
(`017` T342). P3's prompt delivery and P7's reading suggestions both call P3's
`append-message`, which T424 wraps for the socket push. Mobile T440 → T441 → T442.

## Verification gate

1. `pnpm --filter @botvy/backend test` — every spec listed above green.
2. `node apps/backend/test/intent-fixture.mjs` — at least 36 of 40 sentences correct,
   zero silently-wrong times; record the output here, including the first-token
   latency, which must be under 5 seconds on the reference host (SC-001).
3. `cd apps/mobile && flutter test && flutter analyze`.
4. Manual, on the reference host: "remind me to call Dad in two hours" at a known local
   time → correct reminder; a protein question → uses the recorded weight and the first
   words appear within 5 seconds; stop mid-answer → the stream halts within 1 second
   and the partial is kept; close the app mid-answer → the answer is complete on
   return; compose offline then reconnect → answered in the same chat; delete, unpin or
   archive Coach → each refused with an explanation; clear Coach on one device → cleared
   on the second and still cleared after its next sync; paste a paragraph containing an
   instruction → nothing executes.
5. Stop the model: chat reports it clearly, `/health` reads `degraded`, reminders and
   the rhythm still pass their checks.
6. Run the backfill against a database holding the seeded administrator and a member
   created before P3 → both hold a pinned Coach and Planner; run it again → nothing
   changes.

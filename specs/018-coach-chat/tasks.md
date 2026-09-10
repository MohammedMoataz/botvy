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

- [X] T401 Extend `contexts/conversations/domain/`: add `rename`, `pin`, `archive` and `protect` to `conversation.aggregate.ts` (the two pinned kinds refuse all three of delete, unpin and archive), add `intent.ts` (name + `scope: 'coaching'|'planning'|'other'` + typed args) and the `quick-question.repository.ts` port; the P3 ports are imported, not redeclared
- [X] T402 [P] Port v1 `relative-time.ts` with its spec (English and Arabic, dual forms, Arabic-Indic digits, `preferSoonestDay`); fixtures written relative to `Date.now()` Ported with three corrections, all found by using it: **no English number words** (`in two hours` resolved to nothing and fell through to the model — the one phrase the module exists for, measured producing no time at all on `qwen2.5:3b`); **`may` and `mar` were bare month abbreviations**, so "at 9pm if I may" was pushed to tomorrow; and an unchecked capture group this repo's `noUncheckedIndexedAccess` refuses. An optional-article group was added too, without which "half an hour" matched nothing.
- [X] T403 [P] Extend `infrastructure/`: the `quick_questions` mongo adapter, schema, mapper and in-memory twin; confirm P3's `mongo-sequence.ts` unique `(userId, seq)` index under this phase's load; spec: 100 concurrent messages produce 100 distinct increasing sequences
- [X] T404 [P] `features/create-conversation/ rename/ pin/ archive/ clear/ delete/` — every repository read is scoped by `userId` and a conversation belonging to another member answers `forbidden` (never `not_found`, which would confirm it exists); `delete`, `unpin` and `archive` refuse `coach` and `planner` with `protected`; `clear` sets `clearedUpToSeq`; queries `conversations` and `messages(afterSeq)` start at `max(afterSeq, clearedUpToSeq)`; specs: each of the three refusals on each pinned kind, a foreign `conversationId` is `forbidden`, a cleared chat's history is empty for a caller passing `afterSeq: 0`
- [X] T405 `features/backfill-pinned/` — a `migrate-mongo` script that gives every member who registered before P3's bootstrap existed (the seeded administrator among them) the two pinned conversations, reusing the same bootstrap command so there is one creator; spec: the script is idempotent, a member who already has both gains nothing, and a member with only one gains the other
- [X] T406 [P] Register `conversations` and `messages` with the Sync pull (P2's facade): conversations by `updatedAt`, messages by `seq > max(lastSeq, clearedUpToSeq)`, conversations queried after messages per `sync.md`; spec: a clear pushed from one device empties the chat on a second device's next pull and does not return on the one after `SyncableEntity.pull` gained a third parameter (`lastSeq`) rather than a second port: messages carry no `updatedAt`, so the date cursor the interface took could not express their read. TypeScript lets an implementation declare fewer parameters, so the six existing adapters satisfy it untouched. The pull loop also iterates **reverse** `applyOrder` now, which makes "conversations after messages" structural rather than dependent on provider-array order.

## Phase 2 — The turn

- [X] T450 `apps/backend/prompts/{coach.md,planner.md,chat.md,intent.md}` with `{{var}}` substitution; ported tone from v1 where it worked; `intent.md`'s JSON schema carries the `scope` field. First in this phase because it is the extractor's grammar and the assembler's template, not decoration Plus a loader that throws on an unsubstituted `{{var}}` — a prompt shipped with a literal brace in it is a prompt the model reads as an instruction about braces. It resolves `prompts/` by walking **up** from `import.meta.url` rather than counting `..`, because the count agrees between `src/` and `dist/` only by accident of the build layout and breaks silently in the container. Verified by importing the compiled file, not reasoned about. **The image had no prompts at all** until this phase: the Dockerfile copied `dist`, `migrations` and `prisma` and not `prompts`, so every chat turn in the container would have thrown on the first template read while every local test passed.
- [X] T410 `application/prompt-assembler.ts` — system prompt from `coach.md` / `planner.md` / `chat.md`, history limited by `chat.historyLimit` (P0's registry key) and starting no earlier than `clearedUpToSeq`, profile line from `ProfileSummaryQuery` (filled fields only, BMI in code, allergies as prohibitions), today's plan and streak from Rhythm queries; specs: an unrecorded field is absent, never "unknown"; a cleared chat contributes no history `MessageRepository` gained `latestInConversation`, because `inConversation` sorts ascending and then limits — so asking it for twenty gives the *oldest* twenty and the prompt would have carried the member's first twenty messages for ever, never the previous turn. It also takes an exclusive `beforeSeq`: the turn stores the member's message before building the prompt, so without one the model is handed it twice and answers the undelimited copy.
- [X] T411 `application/intent-extractor.ts` — `llm.extract` with the JSON schema from `intent.md`, temperature 0 as a code constant (any other value parses the same sentence two ways, so it is not an operator knob), returns null on any failure; spec: malformed output → null → caller falls back
- [X] T412 `application/intent-executor.ts` — maps `set_reminder`, `set_task`, `cancel`, `list`, `record_metric`, `update_profile` (foods, allergies, goal, symptoms — confirmed in one line before dispatching Profile commands) (and `set_meeting` once P5 lands, until then a "not yet" reply) to `CommandBus` dispatches in the owning contexts, resolves relative phrases in code, asks for a missing required field instead of guessing, returns a templated confirmation naming what was stored; spec: a complete intent dispatches exactly one command and confirms the stored values; an intent missing a required field dispatches nothing and returns a question; a `cancel` matching two reminders dispatches nothing and asks which; `set_meeting` before P5 dispatches nothing and says so; each case in English and Arabic
- [X] T413 `application/turn-runner.ts` — the ordered steps from plan.md, used by both entry points; the move rule is `conversation is pinned && intent.scope === 'other'`, the new chat's title is the member's first six words trimmed to 60 characters, and `chat.moved` is emitted before any token; spec covers each branch: the check-in short-circuit, a `planning` intent in Coach executing in place, an `other` intent in Coach moving to a titled new chat with nothing left behind, an `other` intent in a free chat not moving
- [X] T414 [P] Injection containment: quoted or fetched text is delimited in the prompt and excluded from extraction; spec: a pasted paragraph containing "cancel all reminders" executes nothing
- [X] T415 [P] `application/allergen-guard.ts` — checks the answer accumulated so far at each chunk boundary against the member's declared allergies over normalised text (case, diacritics and Arabic letter forms folded, plurals and seeded synonyms, whole words only), aborts the stream on a hit, discards the partial rather than storing it, and retries the turn once with the allergy restated; spec: "peanut butter", "peanuts" and "فول سوداني" are each caught for a peanut allergy, a hit arriving mid-stream stores no partial, an answer naming an unrelated food passes untouched, and the aborted case delivers the short refusal rather than nothing

## Phase 3 — Delivery paths

- [X] T420 `features/send-message/` over the socket: `chat.send` → ack → `chat.accepted`, `chat.intent`, optional `chat.moved`, `chat.token`×n with `chat.heartbeat` every 15 s of model silence, `chat.card` for list intents (`tasks`, `reminders`, `meetings`, `plan` — the `sessions` kind in the same contract is produced by P6 `020`), `chat.done` with usage and actions, `chat.error` with a code; a socket that disconnects mid-turn does not abort it — the turn finishes, the assistant message is stored and the member's other sockets get `sync.nudge{ entities: ['messages'] }`; specs: a disconnect leaves a complete stored answer and one nudge, two sockets of the same member sending in the same tick are both answered on their own sockets and take distinct increasing `seq` values, a `chat.send` naming another member's conversation answers `chat.error{ code: 'forbidden' }`
- [X] T421 [P] `features/cancel/` — `chat.cancel { requestId }` aborts the model stream and stores the partial answer with `intent: { cancelled: true }`; spec: against an in-memory stream, the abort signal is raised and no further token is stored, measured under one second from the event; a `requestId` the member does not own cancels nothing
- [X] T422 [P] `features/batch/` — `POST /api/v1/conversations/batch`, ≤ 20 messages, grouped by conversation, one reply per conversation, each understood as of `composedAt`, returns the accepted client ids, and connected sockets of the same member get `sync.nudge{ entities: ['messages'] }`; spec: a flush spanning three chats produces three replies in the right chats
- [X] T423 [P] Rate limit (`chat.ratePerMin`) and the daily allowance: `chat.dailyQuotaTokens` (P0's registry key, default 120000) compared against `UsageTodayQuery` summed over the member's local day resolved through `shared/time`, returning `chat.error{ code: 'quota' }` naming the limit and the reset in the member's zone; specs, with fixtures relative to `Date.now()`: a member one token under the allowance is answered, one token over is refused, a member in Cairo and a member in Berlin cross their own midnights and not each other's, and the refusal message states a local time The registry's floor for `chat.dailyQuotaTokens` was 1000, which made `TurnRunner`'s own `if (quota <= 0) return null // 0 turns the allowance off` unreachable — a comment describing a capability no operator had. The floor is 0 now. The rate limiter had the same dead branch and it was **removed** instead: unlike the token allowance, a per-minute cap protects one GPU from a runaway client, which is not something an operator should be able to opt out of on the machine's behalf.
- [X] T424 [P] Coach-initiated messages: the Rhythm and Knowledge contexts write into the Coach chat through P3's `append-message` command; connected sockets receive `chat.message` with its `kind`; spec: a message appended while the member has two sockets open reaches both
- [X] T425 [P] The usage loop: `conversations.MessageSent` carries `{ model, promptTokens, completionTokens, ms }`; an Operations handler writes one `usage_log` row per event, idempotent on `eventId`; Operations declares `UsageTodayQuery { userId, from, to }` on the QueryBus and Conversations calls it — neither context touches the other's collection; spec: two turns and a replayed event produce two rows, and the query returns their sum for a window covering both and zero for the day before

## Phase 4 — Check-in and quick questions

- [X] T430 Wire `capture-checkin-reply` (P3 T341) into `TurnRunner` step 2 with the conversation and window guards, the window being `rhythm.checkinWindowHours` (P0's registry key, 12 hours by default) as P3 reads it; specs: the same words outside Coach record nothing; the same words inside Coach after the window has passed record nothing and are answered as ordinary text
- [X] T431 [P] `features/add-quick-question/`, `remove-quick-question/`, query `quick-questions(chatKind)` returning global + own, filtered by the member's latest check-in mood read through `LatestCheckinQuery` on the QueryBus (served by P3's `checkins` slice, T342) — never by reading Rhythm's collection; seed the Owner's defaults in a `migrate-mongo` script (EN + AR); spec: a low mood brings a lighter-day question to the top, another member's own question is not returned

## Phase 5 — Mobile

- [X] T440 Drift 4 → 5: `conversations` and `messages` with `seq` pull, guarded branch, the immutable-message re-pull trick, ladder test extended
- [X] T441 `core/api/socket_client.dart` — connect with the token in the handshake, reconnect with a fresh token on `token_expired`, route `chat.*`, `sync.nudge`, `chat.message`
- [X] T442 `features/chat` — conversation list with the pinned divider, chat screen with streaming bubbles and a stop button, structured cards for list answers (tap to open or complete), quick-question chips, markdown for assistant messages only (links restricted to http/https), moved-conversation handling, offline composition into the outbox and flush through batch
- [X] T443 [P] Cubit specs: streaming assembles tokens in order; cancel keeps the partial; offline queue flushes once

## Phase 6 — Polish and evidence

- [~] T451 [P] `test/intent-fixture.mjs` + `test/fixtures/intent-cases.json` — **built and run; SC-002 is not met by the default model.** 40 cases (16 Arabic, all eight intent names). Measured against `qwen2.5:3b-instruct`: **30/40, 2 silent time errors, extraction p95 5.3 s** — against thresholds of 36, 0 and 5 s. See the gate evidence below for what moved the number and what did not.
- [~] T452 [P] Arabic strings **done** (38 keys, both locales, parity test green) and RTL asserted as **geometry** rather than as the presence of Arabic text — the member's bubble left of centre, Botvy's right of it, the first chip rightmost, the pinned heading inset from the right. That test was probed by swapping an `AlignmentDirectional` for an `Alignment` and watching it fail. **RTL screenshots outstanding: they need a device, which is `docs/for-you/inputs-016-to-025.md` I3** — the third phase running to the same item.
- [X] T453 [P] `purge-on-deleted` handler for `conversations`, `messages`, `counters` and the member's own `quick_questions` on `identity.UserDeleted`, and `features/close-on-banned/` closing the member's sockets on `identity.UserBanned` (P1 raises it); specs: a purged member's `seq` counter is gone, a banned member's open sockets are disconnected and a `chat.send` afterwards is refused
- [X] T454 Record gate evidence (the fixture hit rate, the first-token measurement, the RTL screenshots); open `019-meetings-calendar`

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

## Gate evidence — 10 September 2026

Run against the live stack after a **clean** image rebuild, with the compiled
code and the prompt templates confirmed present in the container.

| Gate | Result | Note |
|---|---|---|
| `node infra/verify.mjs` (P0) | **5/5** | after the n8n fix below; **4/5 before it**, and that failure is the story. `no stale jobs — 3 jobs fresh` is the first time the crons have actually reported. |
| `node infra/verify-p1.mjs` | **13/13** | |
| `node infra/verify-p2.mjs` | **14/14** | |
| `node infra/verify-p3.mjs` | **17/17** | |
| `node infra/verify-p4.mjs` | **18/18** | new this phase; a real socket, a real model, a real relay |
| `pnpm --filter @botvy/backend test` | **999 pass** | 63 files |
| `cd apps/mobile && flutter test` | **223 pass** | including the RTL geometry test and the ladder from every prior version |
| `flutter analyze` | clean | |
| `packages/sdk` tests | **78 pass** | |
| `pnpm lint` | 0 warnings, 0 errors | 422 files, 102 rules |
| `npm run build:clean` (backend) | clean | not incremental |
| `node infra/verify-esm.mjs` | **3/3** | both compiled roles load under plain `node` |
| `pnpm gen:contracts` | regenerated | 6 REST paths, `quickQuestions`, `Conversation`, `Message`, `MessageConnection` |
| `node apps/backend/test/intent-fixture.mjs` | **30/40** | **below SC-002's 36** — see below |

### SC-002 is not met by the configured model, and this is the number

`qwen2.5:3b-instruct`, `num_ctx` 4096, on the development host:

| | measured | required |
|---|---|---|
| corpus hit rate | **30/40** | 36 |
| silent time errors | **2** | 0 |
| extraction p95 | **5.3 s** | under 5 s |

What moved it, in order:

1. **Grading the pipeline instead of the prompt: 22 → 24.** The first version
   of the fixture called the extraction prompt and graded the raw output — so it
   was measuring the model's unaided performance at the one job
   `relative-time.ts` exists to take away from it. SC-002 is about what the
   *system* produces, so the fixture now applies the same code-side resolution
   the extractor does, from the **compiled** `relative-time.js`. Six of its
   "silent time errors" were phrases the pipeline resolves correctly.
2. **Sharpening `intent.md`'s `scope` section: 24 → 29.** The dominant failure
   was `scope` — coaching and planning swapped in both directions on sentences
   a person would not hesitate over. Replaced the prose with one decisive test
   ("their body or their schedule?"), sixteen worked examples and two catch-all
   rules.
   *A correction worth recording:* the first version of that table used
   sentences lifted straight out of the corpus, and scored 30. That number was
   worthless — it measured the model recognising strings handed to it in the
   same prompt. Every example is now a sentence that is **not** in the corpus,
   and the script that wrote them asserts that. The honest gain was 24 → 29, so
   the generalisation is real and the leak was worth one case.
3. **Constraining `metric` to an enum in the schema: 29 → 30.** As a free
   string the model returned `record_metric` for "I'm 178 cm tall" and left the
   field empty, twice out of three metric cases. A grammar-constrained call can
   only produce what the schema admits — which is the argument for constraining
   extraction rather than instructing it, made concrete.

What the remaining ten failures are, and why the lever is a setting:

- **Three** are outside-world questions the model scopes as `coaching`
  ("what's the capital of Peru?"). It defaults to coaching whatever the prompt
  says.
- **Two** invent a time when the member gave none, against an explicit prompt
  instruction not to. The executor still refuses a past moment and asks, so the
  member is not given a wrong reminder — but the case is counted as a failure
  because it should have asked without needing the second guard.
- **Five** are name confusion on Arabic sentences (`list` read as
  `set_reminder`, a statement read as `set_task`).

None of these is a plumbing defect and none is fixable in the prompt at 3B.
`llm.extractModel` is a settings key for exactly this reason, and `research.md`
already anticipated it: "`qwen3:4b`/`gemma3:4b` when VRAM allows".

**`qwen3` is the wrong upgrade and was measured to be.** It is a *thinking*
model: it emits a `thinking` field before its answer, which is precisely what
`format` exists to prevent, and the schema-constrained call did not return
within the fixture's patience. The recommendation is a larger **non-thinking
instruct** model — `qwen2.5:7b-instruct` is the natural next step — which is a
`settings` change and a `docker`-side pull, not a code change.

### What running the gates actually found

Seven defects. Two were live in earlier phases and one had never worked at all.

1. **No cron had ever run.** `verify.mjs` reported `notifications.sweep` and
   `rhythm.tick` stale, and the cause was two bugs stacked: n8n **blocks `$env`
   inside node expressions by default**, so every execution of both cron
   workflows had been failing with `access to env vars denied` — and the two
   workflows read `$env.BOTVY_SERVICE_TOKEN` while compose set
   `BOTVY_INTERNAL_TOKEN`, so even with access allowed the header would have
   been `Bearer ` with nothing after it. That second one is *exactly* the silent
   401 `CLAUDE.md`'s heartbeat rule was written after. It was invisible because
   every gate calls `/internal/*` directly — which is the right thing for a gate
   to do, and left the automation itself untested. The heartbeat mechanism is
   the only reason anybody found out, which is the argument for it.
2. **A write could reach another member's row, and had been able to since P2.**
   `MongoRepositoryBase.save` upserted on `{ _id, updatedAt }` with no
   `userId`, so a `/sync` push naming an id belonging to somebody else matched
   their row and `$set` wrote over it, `userId` included. Reachable for every
   client-minted-id entity — tasks, labels, reminders, conversations. The
   scoped *read* cannot see the row, so the adapter could not tell that push
   from an offline create; nothing but the unguessability of a UUIDv7 stood in
   the way, which is not an access control. Fixed, with `ForeignRowError`
   reported as `invalid` rather than `stale` — a stale verdict would send the
   phone into a retry loop against a rule that will never accept it.
3. **The image had no prompt templates.** Every chat turn in the container
   would have thrown on the first template read while every local test passed.
4. **A templated confirmation reached the client with no text in it.** Every
   non-model branch — every planner confirmation, every question about a
   missing field, the check-in acknowledgement, the allergen apology — emitted
   `chat.done` and no `chat.token`. `contracts/ws-chat.md` says templated
   confirmations arrive through the same path so clients render one, and nothing
   was checking it. The P4 gate is what caught it.
5. **The prompt would have carried the member's oldest twenty messages for
   ever.** `inConversation` sorts ascending then limits.
6. **`in two hours` resolved to nothing**, and `may` disabled the
   soonest-day correction. Both in the file ported to stop the model getting
   times wrong.
7. **The purge left a deleted member's own quick questions behind** — the
   fourth collection this context owns, and the easiest to forget because
   nothing else reads it.

### The gate's own four wrong assertions

Recorded because a gate that is wrong about the thing it gates teaches whoever
runs it to ignore a red line:

- It read the two pinned chats **once**, immediately after registration. They
  are created by a relay handler, which is eventual, so it reported
  `kinds=none` for a bootstrap that had worked a second later. It waits now, and
  surfaces GraphQL errors — an empty result and a failed query were the same
  `[]`.
- It asserted a from-scratch `/sync` returned **no messages at all** after a
  clear, and got six: the *planner* chat's, which was never cleared and which a
  catching-up device is entitled to. FR-011 is about the chat that was cleared.
- It graded the extraction prompt rather than the pipeline (above).
- It taught to the test (above).

### Still outstanding

- **RTL screenshots** (T452) — a device, `I3`. Third phase running.
- **SC-002** — not met by the default model; the measurement and the
  recommendation are above. Not a code change.
- **SC-001's own number** — first *chat* token under five seconds. The gate
  measures a full turn at ~5.1 s including an 18-chunk answer, and the
  extraction floor under it is 5.3 s at p95, so SC-001 is not separately
  demonstrated and would not pass on this host with this model. The same lever.
- **The manual walkthrough** in this file's verification gate: closing the app
  mid-answer, clearing on one device and watching a second, and the pasted
  instruction. The first two are covered by specs and by the P4 gate; all three
  would still be worth a human's eyes on a handset.
- **`Conversation.unread`** — in the SDL, not in the code-first type. No read
  cursor exists anywhere: nothing stores `lastReadSeq`, the phone's `lastSeq`
  never leaves the device, and `0` would draw "no unread" on a chat the coach
  had just written into. One field short of the contract until the phase that
  adds the cursor.

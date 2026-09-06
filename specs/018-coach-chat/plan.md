# Implementation Plan: Coach & Planner Chat (P4)

**Branch**: `018-coach-chat` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/018-coach-chat/spec.md`; blueprint data-model §2.9, contracts
`ws-chat.md`, `rest-commands.md` (Conversations), `sync.md`, `events.md`; research
R-10, R-14, P-04; the v1 chat service as behavioural reference
(`legacy/apps/gateway/src/chat`).

## Summary

P3 already stood up the Conversations skeleton it needed to speak: the aggregate, the
immutable `messages` collection, the per-member `counters` sequence, the bootstrap that
gives every new member a pinned `coach` and `planner`, and the one command that appends
a message and pushes it to the connected sockets. **This phase makes those chats
answer.** It adds the WebSocket gateway for live turns, cancellation, grammar-constrained
intent extraction whose results are executed **as commands in other contexts** rather
than by the model, prompt assembly from the member's own data, quick questions, the
clear watermark, the offline batch path and the daily allowance — and a one-off backfill
for the members who registered before the skeleton existed, the seeded administrator
among them. This is the phase where v1's 802-line junction box is deliberately not
rebuilt: each responsibility is a slice.

### Decisions taken here

The analysis pass left five questions the blueprint only implies; this plan settles
them so the tasks can be written and tested.

- **Usage has one writer.** `conversations.MessageSent` carries the turn's token counts,
  Operations writes `usage_log` from it (blueprint `events.md` line 48 already says
  "Operations → usage"), and Conversations reads today's total back through
  `UsageTodayQuery` on the QueryBus. Conversations never opens `usage_log` itself —
  principle I.
- **Off-topic is a field, not a feeling.** `intent.md` gains a `scope` of
  `coaching | planning | other`; only `other` moves the turn, and the new chat's title
  is the member's first six words, trimmed. A planner instruction typed in Coach
  executes where it was typed (`scope: planning` in a pinned chat is not a move) —
  the alternative, bouncing every reminder into Planner, would split one conversation
  in half.
- **The allowance is the member's day.** Summed over the member's local day through
  `shared/time`, not per UTC day as v1 did, because principle XI makes every
  user-facing moment — and "when it resets" is one — the member's own. No Complexity
  Tracking row is needed: the deviation was the UTC reading, and it is gone.
- **The latest check-in has a name.** `LatestCheckinQuery`, served by P3's `checkins`
  slice (T342) over the QueryBus; the quick-question query calls it rather than reading
  Rhythm's collection.
- **The reference host** is read as the single Docker Compose host of the blueprint's
  Target Platform, at the configured chat model and context size. The blueprint names
  the reference host without pinning hardware; this phase measures against the
  deployment host rather than inventing a machine.

## Technical Context

**Primary Dependencies**: `ollama` (from P0), `@nestjs/platform-socket.io` (P0);
mobile — `socket_io_client`, `flutter_markdown_plus`; frontend/extension — none new

**Storage**: MongoDB `conversations`, `messages`, `counters` (all three from P3),
`quick_questions` (new here); phone drift `conversations`, `messages`
(schemaVersion 4 → 5)

**Testing**: vitest — intent fixtures (English and Arabic, relative times, missing
fields), a parsed intent becoming a command, a confirmation or a question, the
off-topic move and its title, protected-conversation refusals (delete, unpin,
archive), a foreign `conversationId` refused, sequence monotonicity under concurrency,
cancel aborts the stream inside a second while a disconnect does not, the allowance
boundary either side of the member's midnight, prompt assembly omits empty fields and
states allergies as prohibitions, the output allergen check in both languages, quoted
text is not executed, the backfill is idempotent; a
manual harness against the live model for answer quality

**Performance Goals**: first token < 5 s on the reference host; cancel < 1 s; a turn's
non-model work < 150 ms

**Constraints**: one shared context size for every model call; extraction returns
null on failure and the caller falls back to plain conversation; arithmetic in code

**Scale/Scope**: ~45 backend files, ~15 mobile files

## Constitution Check (v2.1.1)

| Principle | Status | How |
|---|---|---|
| I. Store per context | PASS | Conversations owns its collections; profile, plan, training, streak, the latest check-in and today's token total arrive through query ports; `usage_log` belongs to Operations and is written there |
| II. n8n | PASS | Untouched |
| III. Local-first LLM | PASS | Ollama only; models and context size from settings; extraction grammar-constrained; arithmetic in code |
| IV. Forward-only migrations | PASS | `migrate-mongo` script; drift 4 → 5 guarded with the re-pull trick for immutable messages |
| V. Single public surface | PASS | `/ws` behind Caddy |
| VI. Multi-user, principals | PASS | Socket rooms per member; every conversation and message read or written is scoped by `userId`, a foreign id answering `forbidden`; service principals refused on `/ws`; `identity.UserBanned` closes the member's sockets |
| VII. Test-then-verify | PASS | The list under Testing; fixtures relative to `Date.now()` |
| VIII. YAGNI | PASS | No web search, no voice, no tool loop |
| IX. Contexts, slices, ports | PASS | One slice per responsibility; the intent executor dispatches commands through the bus, never another context's repository |
| X. Commands / queries / streams | PASS | The turn is a stream; the actions it takes are commands; history is a query |
| XI. Times belong to the user | PASS | `resolveRelativePhrase` + `preferSoonestDay` ported; the prompt carries the member's date, time and zone; the daily allowance is summed over the member's local day through `shared/time` and its reset is stated in their zone |
| XII. Configuration | PASS | `chat.historyLimit`, `chat.ratePerMin`, `chat.dailyQuotaTokens` (default 120000) and `llm.*` are registry keys **registered by P0**; `rhythm.checkinWindowHours` (default 12) governs the check-in window and is read, not redefined. Extraction temperature is a code constant, not a key: any value but 0 makes the same sentence parse differently twice |

## Design

### Context layout

P3 (T305) already left `conversation.aggregate.ts`, `message.ts`, their ports, the
mongo and in-memory adapters, the `counters` sequence, `bootstrap-on-registered/` and
`append-message/` in place. Everything marked **new** below is this phase's work; the
rest is extended, not created.

```text
contexts/conversations/
├── domain/
│   ├── conversation.aggregate.ts    # P3: create, clearUpTo — extended here: rename, pin, archive, protect (coach/planner)
│   ├── message.ts                   # P3: immutable value + per-member seq
│   ├── intent.ts                    # new — the understood instruction: name + scope + typed args
│   ├── relative-time.ts             # new (ported): EN/AR phrases, Arabic-Indic digits, preferSoonestDay
│   └── ports: conversation.repository.ts · message.repository.ts · sequence.port.ts (P3) · quick-question.repository.ts (new)
├── infrastructure/ mongo-*.repository.ts · mongo-sequence.ts (counters $inc) · schemas · mappers · in-memory-*.ts   # P3, plus quick_questions here
├── application/                     # all new
│   ├── prompt-assembler.ts          # builds system + history from ProfileSummaryQuery, TodayPlanQuery, StreakQuery, NextSessionQuery
│   ├── intent-extractor.ts          # llm.extract with the JSON schema; returns null on failure
│   ├── intent-executor.ts           # maps an intent to a CommandBus dispatch + a templated confirmation (+ chat.card for lists)
│   ├── allergen-guard.ts            # scans the assembled answer against the member's declared allergies before it is delivered
│   └── turn-runner.ts               # the one place a turn's steps are ordered, shared by the socket and the batch
└── features/
    ├── bootstrap-on-registered/ append-message/          (P3)
    ├── backfill-pinned/ (one-off migration)              (new)
    ├── send-message/ (WS) cancel/ (WS) batch/ (REST)     (new)
    ├── create-conversation/ rename/ pin/ archive/ clear/ delete/   (new — delete, unpin and archive refuse coach and planner)
    ├── add-quick-question/ remove-quick-question/        (new)
    ├── close-on-banned/                                  (new — identity.UserBanned)
    └── conversations/ messages/ quick-questions/         (queries, new)
```

`TurnRunner` is the antidote to v1's junction box: it orders the steps and calls a
collaborator for each, so `send-message` and `batch` share one implementation and no
step knows about another.

```text
0. the conversation is loaded scoped by userId — a foreign id is 'forbidden', never 'not found'
   the member's allowance for their local day is checked          → 'quota' names the reset in their zone
1. persist the member's message through P3's append-message (sequence port)  → MessageSent
2. if conversation is coach AND a check-in is awaited → capture-checkin-reply (P3 T341)
       recorded → templated reply, done.   unclear → continue
3. intent = IntentExtractor.extract(text, now, tz)                      → chat.intent
   (intent carries a scope: coaching | planning | other)
4. if the conversation is pinned and intent.scope is 'other' → create a new conversation
       titled from the member's first six words, emit chat.moved, and continue there
       (scope 'coaching' or 'planning' in a pinned chat never moves: both are the member's own day)
5. if the intent names an action (set/list/cancel/record/update_profile):
       relative times resolved in code, required fields checked (ask if missing),
       CommandBus.execute(...) in the owning context, templated confirmation, done
       (list intents also emit chat.card with the structured items; update_profile confirms in one line first)
6. PromptAssembler.build(kind) → llm.chat(stream) → chat.token…                → chat.done
   AllergenGuard reads the text accumulated so far at each chunk and can abort the turn
7. persist the assistant message; MessageSent carries { model, promptTokens, completionTokens }
```

The move is decided **before** the reply streams, as `ws-chat.md` requires, which is
why step 4 sits ahead of step 5 — an off-topic message never leaves a trace in a pinned
chat. A disconnect between steps 6 and 7 is not a cancel: the turn runs to the end,
the assistant message is stored, and `sync.nudge{ entities: ['messages'] }` goes to the
member's other sockets so whichever device they pick up next has it. Only `chat.cancel`
aborts, and it stores what arrived.

Prompt files live in `apps/backend/prompts/`: `coach.md`, `planner.md`, `chat.md`,
`intent.md` with `{{var}}` substitution. They are written **before** the assembler and
the extractor that read them (T450 opens Phase 2), because a prompt file is the
extractor's grammar, not decoration. The profile line is built by `ProfileSummaryQuery`
(P1): only filled fields, BMI computed in code, allergies rendered as "MUST NOT eat X —
allergic". Today's plan and the streak come from the Rhythm queries. Everything the
member did not record is simply absent.

### Allergens (FR-018, principle VII)

"Never suggest it" in a prompt file is an instruction to a small model, not a test. The
prompt keeps the prohibition, and `AllergenGuard` checks the text on the way out. It
runs over the answer accumulated so far at each chunk boundary — streaming means there
is no "finished text" to inspect at the end — matching each declared allergy against a
normalised copy (case, diacritics and Arabic letter forms folded, common plurals and
the term's known synonyms from the seed list), whole words only, in both languages, so
"peanut butter" hits "peanut", "peanuts" and "فول سوداني". On a hit the stream is aborted, the
partial is discarded rather than stored, and the member gets a short message saying the
coach cannot answer that safely; the turn is retried once with the allergy restated.
Aborting on the chunk that first names the food is why a member never reads it. This is
what SC-003 measures.

### Injection safety (FR-014)

Quoted text, pasted articles and any content that did not come from the member's own
keystrokes is wrapped in a delimited block in the prompt and the extraction call is
made only over the member's own message. Intents are executed from a typed structure,
never from free text, so a document that says "cancel all reminders" cannot act.

### Rate, allowance and who counts the tokens

`chat.ratePerMin` throttles per member. The allowance is `chat.dailyQuotaTokens`
(registered by P0, default 120000) and it has one path end to end:

```text
turn ends → conversations.MessageSent { conversationId, seq, role, usage: { model, promptTokens, completionTokens, ms } }
          → Operations' handler writes one usage_log row (kind 'chat' or 'intent'), idempotent on eventId
step 0 of the next turn → UsageTodayQuery { userId, from, to } on the QueryBus
          → Operations sums promptTokens + completionTokens over that window
```

`from` and `to` are the member's local midnights resolved through `shared/time`, so a
member in Cairo and a member in Berlin get their own days, and the `quota` error names
the reset as their own local time. Conversations never reads `usage_log`; Operations
never reads `messages`. Without this loop the allowance would sum an empty collection
and every member would sit permanently at zero used — which is what the analysis pass
found.

### Mobile

`features/chat`: conversation list with the pinned section divider, chat screen with
streaming bubbles, quick-question chips, stop button, markdown for assistant messages
only, moved-conversation handling, offline composition queued into the outbox and
flushed through the batch endpoint. Drift 4 → 5 adds `conversations` and `messages`
(pull by `seq`) plus the v1 re-pull trick: existing rows are marked and re-pulled
rather than backfilled, because messages are immutable. Both entities are already in
`sync.md`'s entity list; this phase registers the server-side pull for them, and the
pull starts at `max(lastSeq, conversation.clearedUpToSeq)` so a clear made on one
device empties the chat on the others rather than being undone by the next catch-up.

### Frontend and extension

Neither gets chat in this phase (the extension stays task-and-meeting focused) —
deliberately, to keep the phase's surface small. The admin Usage screen and the
quick-question management screen land in **P10** (`024`, blueprint T1001); what this
phase owns is the registry key and the usage write behind them, so the numbers exist
before there is a page for them. Until P10 the seeded quick questions are retuned by
the `migrate-mongo` seed, which is acceptable for a set that changes rarely.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `TurnRunner` shared by two entry points | v1 had two entry points that independently reimplemented the same tail and drifted | Duplicating the sequence in the socket handler and the batch handler recreates the exact v1 defect |
| Intent extraction as a second model call | A grammar-constrained call is orders of magnitude faster and cannot monologue; v1 measured 528 s → seconds | A single free-form call that also acts (unbounded, unsafe, unverifiable) |

## Verification gate

```powershell
pnpm --filter @botvy/backend test          # intent → command/confirmation/question, move + title, protected refusals (delete, unpin, archive), foreign id forbidden, seq monotonicity, cancel < 1 s, disconnect ≠ cancel, quota either side of local midnight, prompt assembly, allergen guard (EN + AR), injection, backfill idempotence
node apps/backend/test/intent-fixture.mjs  # against the live model: 40 sentences, EN + AR; reports first-token latency
cd apps/mobile; flutter test; flutter analyze
# manual (on the reference host): "remind me to call Dad in two hours" → correct local time; ask the coach a
#         protein question → uses the recorded weight and the first words appear within 5 s; stop mid-answer →
#         halted within 1 s and the partial kept; send offline then reconnect; try to delete, unpin or archive
#         Coach → refused; clear Coach on one device → cleared on the other
docker compose stop ollama-proxy 2>$null   # or stop the host service: chat degrades, reminders unaffected
```

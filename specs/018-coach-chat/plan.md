# Implementation Plan: Coach & Planner Chat (P4)

**Branch**: `018-coach-chat` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/018-coach-chat/spec.md`; blueprint data-model §2.9, contracts
`ws-chat.md`, `rest-commands.md` (Conversations), `events.md`; research R-10, R-14,
P-04; the v1 chat service as behavioural reference (`legacy/apps/gateway/src/chat`).

## Summary

The Conversations context: a WebSocket gateway for live turns, immutable messages
with a per-member sequence, two protected pinned conversations, grammar-constrained
intent extraction whose results are executed **as commands in other contexts** rather
than by the model, prompt assembly from the member's own data, and an offline batch
path. This is the phase where v1's 802-line junction box is deliberately not rebuilt:
each responsibility is a slice.

## Technical Context

**Primary Dependencies**: `ollama` (from P0), `@nestjs/platform-socket.io` (P0);
mobile — `socket_io_client`, `flutter_markdown_plus`; frontend/extension — none new

**Storage**: MongoDB `conversations`, `messages`, `counters`, `quick_questions`;
phone drift `conversations`, `messages` (schemaVersion 4 → 5)

**Testing**: vitest — intent fixtures (English and Arabic, relative times, missing
fields), protected-conversation refusals, sequence monotonicity under concurrency,
cancel aborts the stream, allowance enforcement, prompt assembly omits empty fields
and states allergies as prohibitions, quoted text is not executed; a manual harness
against the live model for answer quality

**Performance Goals**: first token < 5 s; cancel < 1 s; a turn's non-model work
< 150 ms

**Constraints**: one shared context size for every model call; extraction returns
null on failure and the caller falls back to plain conversation; arithmetic in code

**Scale/Scope**: ~45 backend files, ~15 mobile files

## Constitution Check (v2.1.0)

| Principle | Status | How |
|---|---|---|
| I. Store per context | PASS | Conversations owns its collections; profile, plan, training and streak arrive through query ports |
| II. n8n | PASS | Untouched |
| III. Local-first LLM | PASS | Ollama only; models and context size from settings; extraction grammar-constrained; arithmetic in code |
| IV. Forward-only migrations | PASS | `migrate-mongo` script; drift 4 → 5 guarded with the re-pull trick for immutable messages |
| V. Single public surface | PASS | `/ws` behind Caddy |
| VI. Multi-user, principals | PASS | Socket rooms per member; service principals refused on `/ws` |
| VII. Test-then-verify | PASS | The list under Testing; fixtures relative to `Date.now()` |
| VIII. YAGNI | PASS | No web search, no voice, no tool loop |
| IX. Contexts, slices, ports | PASS | One slice per responsibility; the intent executor dispatches commands through the bus, never another context's repository |
| X. Commands / queries / streams | PASS | The turn is a stream; the actions it takes are commands; history is a query |
| XI. Times belong to the user | PASS | `resolveRelativePhrase` + `preferSoonestDay` ported; the prompt carries the member's date, time and zone |
| XII. Configuration | PASS | `chat.historyLimit`, `chat.ratePerMin`, `chat.dailyQuotaTokens`, `llm.*` are registry keys |

## Design

### Context layout

```text
contexts/conversations/
├── domain/
│   ├── conversation.aggregate.ts    # create, rename, pin, archive, clearUpTo, protect (coach/planner)
│   ├── message.ts                   # immutable value + per-member seq
│   ├── intent.ts                    # the understood instruction: name + typed args
│   ├── relative-time.ts             # ported: EN/AR phrases, Arabic-Indic digits, preferSoonestDay
│   └── ports: conversation.repository.ts · message.repository.ts · sequence.port.ts · quick-question.repository.ts
├── infrastructure/ mongo-*.repository.ts · mongo-sequence.ts (counters $inc) · schemas · mappers · in-memory-*.ts
├── application/
│   ├── prompt-assembler.ts          # builds system + history from ProfileSummaryQuery, TodayPlanQuery, StreakQuery, NextSessionQuery
│   ├── intent-extractor.ts          # llm.extract with the JSON schema; returns null on failure
│   ├── intent-executor.ts           # maps an intent to a CommandBus dispatch + a templated confirmation
│   └── turn-runner.ts               # the one place a turn's steps are ordered, shared by the socket and the batch
└── features/
    ├── send-message/ (WS) cancel/ (WS) batch/ (REST)
    ├── create-conversation/ rename/ pin/ archive/ clear/ delete/ (delete refuses coach and planner)
    ├── add-quick-question/ remove-quick-question/
    └── conversations/ messages/ quick-questions/     (queries)
```

`TurnRunner` is the antidote to v1's junction box: it orders the steps and calls a
collaborator for each, so `send-message` and `batch` share one implementation and no
step knows about another.

```text
1. persist the member's message (sequence port)                        → MessageSent
2. if conversation is coach AND a check-in is awaited → capture-checkin-reply (P3 command)
       recorded → templated reply, done.   unclear → continue
3. intent = IntentExtractor.extract(text, now, tz)                      → chat.intent
4. if intent is set/list/cancel/record and it belongs elsewhere:
       relative times resolved in code, required fields checked (ask if missing),
       CommandBus.execute(...) in the owning context, templated confirmation, done
5. if the conversation is pinned and the intent does not belong there → create a new
       conversation, emit moved, and continue there
6. PromptAssembler.build(kind) → llm.chat(stream) → chat.token…                → chat.done
7. persist the assistant message + usage
```

Prompt files live in `apps/backend/prompts/`: `coach.md`, `planner.md`, `chat.md`,
`intent.md` with `{{var}}` substitution. The profile line is built by
`ProfileSummaryQuery` (P1): only filled fields, BMI computed in code, allergies
rendered as "MUST NOT eat X — allergic". Today's plan and the streak come from the
Rhythm queries. Everything the member did not record is simply absent.

### Injection safety (FR-014)

Quoted text, pasted articles and any content that did not come from the member's own
keystrokes is wrapped in a delimited block in the prompt and the extraction call is
made only over the member's own message. Intents are executed from a typed structure,
never from free text, so a document that says "cancel all reminders" cannot act.

### Rate and allowance

`chat.ratePerMin` throttles per member; `chat.dailyQuotaTokens` is summed from
`usage_log` per UTC day (the one deliberate use of UTC, as in v1) and returns a clear
`quota` error naming the reset.

### Mobile

`features/chat`: conversation list with the pinned section divider, chat screen with
streaming bubbles, quick-question chips, stop button, markdown for assistant messages
only, moved-conversation handling, offline composition queued into the outbox and
flushed through the batch endpoint. Drift 4 → 5 adds `conversations` and `messages`
(pull by `seq`) plus the v1 re-pull trick: existing rows are marked and re-pulled
rather than backfilled, because messages are immutable.

### Frontend and extension

Neither gets chat in this phase (the admin portal shows usage in P10; the extension
stays task-and-meeting focused) — deliberately, to keep the phase's surface small.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `TurnRunner` shared by two entry points | v1 had two entry points that independently reimplemented the same tail and drifted | Duplicating the sequence in the socket handler and the batch handler recreates the exact v1 defect |
| Intent extraction as a second model call | A grammar-constrained call is orders of magnitude faster and cannot monologue; v1 measured 528 s → seconds | A single free-form call that also acts (unbounded, unsafe, unverifiable) |

## Verification gate

```powershell
pnpm --filter @botvy/backend test          # intent fixtures, protected refusals, seq monotonicity, cancel, quota, prompt assembly, injection
node apps/backend/test/intent-fixture.mjs  # against the live model: 40 sentences, EN + AR
cd apps/mobile; flutter test; flutter analyze
# manual: "remind me to call Dad in two hours" → correct local time; ask the coach a protein question →
#         uses the recorded weight; stop mid-answer; send offline then reconnect; try to delete Coach → refused
docker compose stop ollama-proxy 2>$null   # or stop the host service: chat degrades, reminders unaffected
```

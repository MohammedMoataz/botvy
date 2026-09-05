# Implementation Plan: Knowledge Ingestion & Suggestions (P7)

**Branch**: `021-knowledge-ingestion` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/021-knowledge-ingestion/spec.md`; blueprint data-model §2.7,
contracts `rest-commands.md` (Knowledge), `internal.md` (ingest), `events.md`;
research R-16, P-07.

## Summary

The Knowledge context: a link with a state machine, a worker pipeline that fetches,
extracts, summarises and stores, playlist expansion into child links, and a saga that
turns an upcoming session plus relevant readings into a proposed session the member
can accept. All model work happens in the worker, off the request path.

## Technical Context

**Primary Dependencies**: `@mozilla/readability`, `jsdom`, `youtubei.js`,
`p-queue` (bounded concurrency); mobile — none new (media through the existing signed
proxy)

**Storage**: MongoDB `links`, `knowledge_docs`, `suggestions`; phone drift `links`
(add/remove push, pull), suggestions read over GraphQL only (not synced)

**Testing**: vitest — kind detection, playlist expansion once, duplicate detection,
state transitions including failure and retry cap, chunked summarisation over a long
fixture, suggestion generation gated by the preference, injection containment; a
manual fixture set of 10 articles for SC-004

**Performance Goals**: article end to end < 3 min; concurrency bounded so chat
latency is unaffected (one ingestion at a time by default, an Owner setting)

**Constraints**: no member ever waits on a screen; fetched content is data, never
instruction; media is proxied

**Scale/Scope**: ~40 backend files, ~14 mobile files, ~4 frontend files

## Constitution Check (v2.1.1)

| Principle | Status | How |
|---|---|---|
| I. Store per context | PASS | Knowledge owns its three collections; it reads sessions through Training's port and writes back by dispatching a Training command on accept |
| II. n8n | PASS | Ingestion is event-driven in the worker; n8n only observes if the Owner subscribes |
| III. Local-first LLM | PASS | Summarisation and suggestion drafting use the local model with a schema for the draft; failures are tolerated and resumed |
| IV. Forward-only migrations | PASS | One `migrate-mongo` script; drift 7 → 8 guarded |
| V. Single public surface | PASS | Outbound fetching happens from the worker, which has no inbound route |
| VI. Multi-user, principals | PASS | Every link is a member's; the Owner's queue view is admin-scoped |
| VII. Test-then-verify | PASS | The state machine and the preference gate are specced; summary quality is a reviewed fixture, stated as such |
| VIII. YAGNI | PASS | No reader view, no highlights, no search |
| IX. Contexts, slices, ports | PASS | Fetchers and extractors are ports with adapters, so a source type can be added without touching the pipeline |
| X. Commands / queries / streams | PASS | Add/retry/accept are commands; links and suggestions are queries; state changes reach clients as nudges |
| XI. Times belong to the user | PASS | `forDate` on a suggestion is the member's local date |
| XII. Configuration | PASS | `knowledge.maxAttempts`, `maxChars`, `playlistMaxItems`, `concurrency` are registry keys; `aiSuggestions` is a member preference |

## Design

### Pipeline as ports

```text
contexts/knowledge/
├── domain/
│   ├── link.aggregate.ts        # save, detectKind, beginFetch, beginExtract, beginSummarise, finish, fail, retry
│   ├── reading.ts               # extracted text/transcript + summary + key points + media refs
│   ├── suggestion.aggregate.ts  # propose, accept, dismiss
│   └── ports: link.repository.ts · reading.repository.ts · suggestion.repository.ts
│              source-fetcher.port.ts (fetch(url) → RawSource) · content-extractor.port.ts · summariser.port.ts
├── infrastructure/
│   ├── mongo-*.repository.ts · schemas · mappers · in-memory-*.ts
│   ├── http-source-fetcher.ts (undici, redirect and size limits, SSRF guard shared with media)
│   ├── readability-extractor.ts (jsdom + @mozilla/readability)
│   ├── youtube-source.ts (youtubei.js: video metadata, transcript, playlist listing)
│   └── llm-summariser.ts (map-reduce over 2–4K-token chunks, key points via schema)
└── features/
    ├── add-link/ retry-link/ remove-link/
    ├── ingest-link/            # worker: the pipeline, one state transition per step
    ├── expand-playlist/        # worker: children created once, idempotent on (userId, normalizedUrl)
    ├── generate-suggestion/    # worker saga on training.SessionScheduled
    ├── accept-suggestion/ dismiss-suggestion/
    └── links/ link/ suggestions/ admin-queue/     (queries)
```

Each step is its own transition with its own event (`LinkStateChanged`), so a
failure is always attributable and a retry always resumes from a known state rather
than starting over blindly.

### Injection containment (FR-013)

Fetched text is stored and later placed into a prompt inside a clearly delimited block
labelled as untrusted source material. The intent extractor from P4 is never run over
it. The suggestion draft is produced with a JSON schema, so the model's output is a
typed structure — a document that says "cancel all reminders" cannot become an action.

### Suggestion saga

On `training.SessionScheduled` with `aiSuggestions` enabled and the session at least a
day away: find the member's finished readings whose tags overlap the session's sport
or focus (recency-weighted, at most five); ask the model for a session draft with a
schema (`title`, `focus`, `exercises[]`, `rationale`); store a `pending` suggestion
citing the readings; raise `SuggestionReady`, which becomes an alert and a coach
message. Nothing is generated when the preference is off — the saga returns before any
query runs, which is what SC-003 measures.

`accept-suggestion` dispatches Training's `update-session` with the draft's exercises
and marks the suggestion accepted with the resulting session id; `dismiss` records it
so the same session is not proposed again.

### Clients

**Mobile**: `features/knowledge` inside Athlete — add link (paste or share-sheet),
list with state chips and retry, detail with summary, key points, media gallery
(through the signed proxy) and a link out; suggestions inbox with accept and dismiss.
The suggestions toggle already exists in preferences (P1) and is honoured here.

**Frontend (admin)**: the ingestion queue across members with reasons, attempts,
retry and clear.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Fetcher, extractor and summariser as ports | YouTube and articles need different acquisition but the same pipeline; a third kind will come | Branching inside one function makes each new source type a rewrite of the pipeline |
| Playlist children as their own links | Each video has its own state, its own summary and its own failure | One blob per playlist means one failure kills everything and no per-video summary |

## Verification gate

```powershell
pnpm --filter @botvy/backend test    # kind detection, expansion once, duplicates, transitions, retry cap,
                                     # chunked summarisation, preference gate, injection containment
node apps/backend/test/ingest-fixture.mjs   # 10 article fixtures → reviewer judges faithfulness (SC-004)
cd apps/mobile; flutter test; flutter analyze
# manual: save an article and a 3-video playlist → all reach done; break one URL → failed with a reason and
#         a working retry; with an upper-body session tomorrow → a suggestion citing a saved source; accept →
#         the session holds it; turn suggestions off → nothing is generated
```

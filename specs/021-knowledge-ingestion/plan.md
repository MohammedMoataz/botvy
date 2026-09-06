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

**Primary Dependencies**: `@mozilla/readability`, `jsdom`, `youtubei.js`; mobile — none
new (media through the existing signed proxy). Concurrency defaults to one ingestion at
a time, which is a counter and an await, not a queue library.

**Storage**: MongoDB `links`, `knowledge_docs`, `suggestions`; phone drift `links`
(add/remove push, pull), suggestions read over GraphQL only (not synced)

**Testing**: vitest — kind detection, playlist expansion once, duplicate detection,
state transitions including failure and retry cap, the stalled re-queue leaving
`attempts` alone, both schema-decode fallbacks, chunked summarisation over a long
fixture, suggestion generation gated by the preference, injection containment; a
manual fixture set of 10 articles for SC-004 and SC-006

**Performance Goals**: article end to end < 3 min; concurrency bounded so chat
latency is unaffected (one ingestion at a time by default, an Owner setting)

**Constraints**: no member ever waits on a screen; fetched content is data, never
instruction; media is proxied

**Scale/Scope**: ~40 backend files, ~14 mobile files, ~4 frontend files

## Constitution Check (v2.1.1)

| Principle | Status | How |
|---|---|---|
| I. Store per context | PASS | Knowledge owns its three collections and touches no other; it learns of sessions from `training.SessionScheduled` and from Training's query handler, and reports an accepted suggestion as `knowledge.SuggestionAccepted`, which Training consumes |
| II. n8n | PASS | Ingestion is event-driven in the worker; n8n only observes if the Owner subscribes |
| III. Local-first LLM | PASS | Summarisation and suggestion drafting run on the local model, named by `llm.summarizeModel` and sized by the one `llm.numCtx`; the schema-decoded passes both fall back to a plain reply when decoding fails, and an outage is resumed rather than failed |
| IV. Forward-only migrations | PASS | One `migrate-mongo` script; drift 7 → 8 guarded |
| V. Single public surface | PASS | Outbound fetching happens from the worker, which has no inbound route |
| VI. Multi-user, principals | PASS | Every link is a member's; the Owner's queue view is admin-scoped |
| VII. Test-then-verify | PASS | The state machine and the preference gate are specced; summary quality is a reviewed fixture, stated as such |
| VIII. YAGNI | PASS | No reader view, no highlights, no search |
| IX. Contexts, slices, ports | PASS | Fetchers and extractors are ports with adapters, so a source type can be added without touching the pipeline; everything that leaves the context leaves as an event or a query, never as another context's command or collection |
| X. Commands / queries / streams | PASS | Add/retry/accept are commands; links and suggestions are queries; state changes reach clients as nudges |
| XI. Times belong to the user | PASS | `forDate` on a suggestion is the member's local date |
| XII. Configuration | PASS | `knowledge.maxAttempts`, `maxChars`, `playlistMaxItems`, `maxLinksPerDay`, `concurrency` and `stuckAfterMinutes` are registry keys, as are `llm.summarizeModel` and `llm.numCtx`; `aiSuggestions` is a member preference; no limit is written in code |

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
│   └── llm-summariser.ts (map-reduce, chunk size derived from llm.numCtx, model llm.summarizeModel)
└── features/
    ├── add-link/ retry-link/ remove-link/
    ├── ingest-link/            # worker: the pipeline, one state transition per step
    ├── requeue-stalled/        # worker sweep: rows parked mid-pipeline go back to queued
    ├── expand-playlist/        # worker: children created once, idempotent on (userId, normalizedUrl)
    ├── generate-suggestion/    # worker saga on training.SessionScheduled
    ├── accept-suggestion/ dismiss-suggestion/ record-suggestion-outcome/
    ├── admin-clear-link/       # admin: drop a stuck entry, write the audit row
    └── links/ link/ suggestions/ admin-queue/     (queries)
```

Each step is its own transition with its own event (`LinkStateChanged`), so a
failure is always attributable and a retry always resumes from a known state rather
than starting over blindly. The last transition raises `knowledge.LinkIngested`, which
is what tells the playlist rollup a child is finished and what the coach's "I read …"
message hangs off; without it the whole tail of the pipeline is a silent write.

### When nobody is looking (FR-016, FR-017)

The pipeline's states double as its crash log. A worker killed between two transitions
leaves a row in `fetching`, `extracting` or `summarising` with nothing driving it, and
`LinkAdded` is consumed once, so nothing would ever come back for it. `requeue-stalled`
runs on the worker tick, claims rows in those three states whose `updatedAt` is older
than `knowledge.stuckAfterMinutes`, and puts them back to `queued` — `attempts`
untouched, because a machine that died is not a link that failed. The same rule covers a
model outage: the summarise step throws, the row is left where it is rather than marked
failed, and the sweep brings it round again on the next tick. Retries are therefore
automatic and the backoff is the sweep interval itself; only a genuine rejection by the
source (a 404, a paywall, an unparseable page) spends an attempt, and those stop at
`knowledge.maxAttempts`.

`ingest-link` stamps `ops_heartbeats['knowledge.ingest']` on every completed run, and
`/health` reports the job degraded when that stamp goes stale or when the oldest
`queued` row has been waiting longer than the same threshold — a queue nobody is
draining looks exactly like an idle queue otherwise.

### Three edges the pipeline has to name

A playlist child whose video the member already saved on its own collides with the
unique `(userId, normalizedUrl)` index. The existing entry is adopted — `parentLinkId`
is set to the playlist and nothing is re-read — which keeps FR-005 true and leaves the
group complete; creating a second row would break the index and refusing the parent
would punish the member for having good taste twice.

A video with no transcript finishes rather than fails: the summary is built from title,
description and duration alone and the document records that it had no transcript, so
the member is told what they are reading instead of being handed a blank. A page that
genuinely cannot be read — a login wall, a paywall — is still a plain failure.

`add-link` counts the member's saves for their local day against
`knowledge.maxLinksPerDay` and refuses past it; the count is per member, so one
enthusiast cannot starve the queue for everyone. Only the first
`knowledge.playlistMaxItems` videos of a playlist are taken and the member is told how
many were skipped — there is no "fetch the rest" command in this phase, which is the
YAGNI reading of a limit the Owner can simply raise.

### Injection containment (FR-013)

Fetched text is stored and later placed into a prompt inside a clearly delimited block
labelled as untrusted source material. The intent extractor from P4 is never run over
it. The suggestion draft is produced with a JSON schema, so the model's output is a
typed structure — a document that says "cancel all reminders" cannot become an action.

### One context size, and a way out of the schema

Summarisation is map-reduce, and the chunk size is not a number in the source: it is
`llm.numCtx` less the prompt frame and the reply budget, so every call to the model
uses the one configured context size. Ollama keys a loaded model by its context size, so
a second size anywhere in the pipeline reloads the model on every turn — measured at
39 s to first token in v1. The model itself is `llm.summarizeModel`.

Both schema-decoded passes need the plain-reply exit the constitution requires. When
the key-points pass fails to decode, the summary produced by the reduce step still
stands: the entry reaches `done` with the plain summary and an empty key-point list,
which is a thinner reading, not a failed one. When the suggestion draft fails to decode,
nothing structured is stored — a half-parsed draft must never become exercises the
member can accept — and the model's plain reply is delivered instead as a coach message
naming the sources it drew on. That second half is a decision this plan takes rather
than inherits: the constitution says the fallback is a plain reply, and the only honest
home for a plain reply about training material is the coach chat.

### Suggestion saga

On `training.SessionScheduled` with `aiSuggestions` enabled and the session at least a
day away: find the member's finished readings whose tags overlap the session's sport
or focus (recency-weighted, at most five); ask the model for a session draft with a
schema (`title`, `focus`, `exercises[]`, `rationale`); store a `pending` suggestion
citing the readings; raise `SuggestionReady`, which becomes an alert and a coach
message. Nothing is generated when the preference is off — the saga returns before any
query runs, which is what SC-003 measures. `SuggestionReady` is consumed by
Notifications, which raises the `suggestion` alert, and by Conversations, which posts
the coach message — Knowledge sends neither itself.

`accept-suggestion` marks the suggestion accepted and raises
`knowledge.SuggestionAccepted{ suggestionId, sessionId? }` with the draft; Training's
consumer fills the named session or creates one. Knowledge never dispatches Training's
command and never opens Training's collections. The session id comes back one of two
ways: when the member accepted into a session they already had, the accept command
carried it and it is recorded on the spot; when Training created one, Knowledge fills
`acceptedSessionId` from the `training.SessionScheduled` raised for the same member,
date and sport — correlating on that triple is this plan's choice, because the event
contract carries no suggestion id and the contract is not ours to widen.
`record-suggestion-outcome` then closes the loop the event catalogue already promises:
`training.SessionCompleted`, `SessionCancelled` and `SessionSkipped` for a session an
accepted suggestion produced record what became of it. `dismiss` records the refusal so
the same session is not proposed again.

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
                                     # stalled re-queue, schema fallbacks, chunked summarisation,
                                     # preference gate, injection containment
node apps/backend/test/ingest-fixture.mjs   # 10 article fixtures → reviewer judges faithfulness (SC-004),
                                            # summary ≤ 150 words with title, length and link (SC-006)
cd apps/mobile; flutter test; flutter analyze
# manual: save an article and a 3-video playlist → all reach done; break one URL → failed with a reason and
#         a working retry; kill the worker mid-summarise → the entry returns to waiting and finishes, attempts
#         unchanged, and /health reads degraded while it is stuck; with an upper-body session tomorrow → a
#         suggestion citing a saved source; accept → the session holds it; turn suggestions off → nothing is
#         generated; clear an entry from the admin queue → it leaves the member's list and an audit row exists
```

# Tasks: Knowledge Ingestion & Suggestions (P7)

**Input**: `spec.md`, `plan.md`; blueprint data-model §2.7, contracts.

**Task ids are phase-local**: the `T7xx` series below belongs to this phase alone. The
blueprint's `tasks.md` runs its own `T###` series, and a shared number there means
something else entirely — never cross-reference the two by id.

**Tests**: mandatory for the state machine, playlist expansion, duplicates, retry cap,
the stalled re-queue, both schema-decode fallbacks, chunked summarisation, the
preference gate and injection containment.

## Phase 1 — Domain and ports

- [ ] T701 `contexts/knowledge/domain/`: `link.aggregate.ts` (save, detectKind, the five transitions, fail with reason, retry with attempt cap), `reading.ts`, `suggestion.aggregate.ts`, repository ports, and the three pipeline ports (`source-fetcher`, `content-extractor`, `summariser`)
- [ ] T702 [P] `infrastructure/`: mongo adapters (unique partial index on `(userId, normalizedUrl)`), schemas, mappers, in-memory adapters and fake pipeline adapters for specs
- [ ] T703 [P] URL normalisation and kind detection (article, website, video, playlist) with a fixture table of 30 URLs

## Phase 2 — Acquisition adapters

- [ ] T710 [P] `http-source-fetcher.ts` — undici with timeout, redirect limit, size cap, content-type check and the SSRF guard shared with the media proxy; spec: a login page is not stored as an article
- [ ] T711 [P] `readability-extractor.ts` — jsdom + `@mozilla/readability`, title, author, published date, text capped at `knowledge.maxChars`, image references collected (images only this phase; embedded video and audio are not collected)
- [ ] T712 [P] `youtube-source.ts` — `youtubei.js`: video metadata and transcript, playlist listing capped at `knowledge.playlistMaxItems`; documents the platform-terms caveat in a header comment and in `SETUP.md`; spec: a video with no transcript returns its metadata with the transcript null and the extractor marks the document transcript-less rather than raising
- [ ] T713 [P] `llm-summariser.ts` — map-reduce with `llm.summarizeModel`, chunk size derived from `llm.numCtx` less the prompt frame and reply budget so only one context size is ever loaded, then key points via a JSON schema; spec: a chunk never exceeds the derived budget when `llm.numCtx` changes, key points that fail to decode leave the plain summary standing with an empty key-point list, and a model outage propagates as "not now" rather than as a failure

## Phase 3 — The pipeline (US1, US2)

- [ ] T720 `features/add-link/` — save with `queued`, detect kind, raise `LinkAdded`; duplicate returns the existing entry; refuse a save past `knowledge.maxLinksPerDay` counted over the member's local day, with a reason the client can show; `features/remove-link/` tombstones and removes children; `features/retry-link/` resets to `queued` with `attempts + 1` and refuses past `knowledge.maxAttempts`; spec: the quota counts a member's own day through `shared/time`, refuses the next save and leaves everything already queued running
- [ ] T721 `features/ingest-link/` (worker, on `LinkAdded` and the internal endpoint) — fetch → extract → summarise → done, one transition per step each raising `LinkStateChanged`, `knowledge.LinkIngested{ linkId, docId, tags }` on the last one; a rejection by the source stores the reason and stops, a model or network outage leaves the row in its current state for the sweep; bounded by `knowledge.concurrency`; stamps `ops_heartbeats['knowledge.ingest']` on every run; specs cover every transition, the `LinkIngested` payload, and an outage leaving `attempts` untouched
- [ ] T722 `features/expand-playlist/` — create one child link per video up to `knowledge.playlistMaxItems`, idempotent; a video the member already saved standalone is adopted by setting its `parentLinkId` rather than duplicated; the parent rolls up on its children's `LinkIngested` and records how many videos were skipped; spec: expanding twice creates no duplicates, and adopting an existing link neither re-reads it nor violates the unique index
- [ ] T723 [P] Queries `links(status, kind)`, `link(id)` with its reading and media, and GraphQL `ingestionQueue(status)` across members for the admin portal — the read P10's queue screen consumes
- [ ] T724 [P] Media references served through the existing signed proxy; spec: the client never receives a source host URL
- [ ] T725 `features/requeue-stalled/` (worker tick) — claim rows in `fetching`, `extracting` or `summarising` whose `updatedAt` is older than `knowledge.stuckAfterMinutes` and return them to `queued` without touching `attempts`; `/health` reports `knowledge.ingest` degraded when its heartbeat is stale or the oldest `queued` row has waited past the same threshold; spec: fixture rows aged relative to `Date.now()`, a killed mid-summarise row comes back and finishes, a row inside the threshold is left alone
- [ ] T726 [P] `features/admin-clear-link/` — `DELETE /admin/knowledge/:linkId` (admin) removes the entry, its reading and its children and writes the `audit_log` row; spec: the member's list loses it too and the audit row names the administrator and the reason

## Phase 4 — Suggestions (US3)

- [ ] T730 `features/generate-suggestion/` — worker saga on `training.SessionScheduled`, only for sessions at least a day away: return immediately when `aiSuggestions` is off (spec asserts no query runs), otherwise select up to five relevant readings by sport and tags with recency weighting, ask the model at the one configured `llm.numCtx` for a schema-constrained draft, store `pending`, raise `SuggestionReady`; spec: a draft that fails to decode stores no suggestion and sends the model's plain reply as a coach message instead, and a session less than a day away produces nothing
- [ ] T731 [P] `features/accept-suggestion/` — mark accepted and raise `knowledge.SuggestionAccepted{ suggestionId, sessionId? }` with the draft for Training to fill or create the session; record `acceptedSessionId` from the accept command when the member named a session, otherwise from the `training.SessionScheduled` that carries this `suggestionId` back (the event payload names it, so nothing is matched on member, date and sport); `features/dismiss-suggestion/` — mark dismissed so the same session is not proposed again; specs cover both paths to the session id and assert Knowledge dispatches no Training command
- [ ] T732 [P] Query `suggestions(status)`; `SuggestionReady` is consumed by Notifications for the `suggestion` alert (P2) and by Conversations for the coach message (P4) — Knowledge raises it and sends neither
- [ ] T733 Injection containment: source text enters prompts only inside a delimited untrusted block; the P4 intent extractor never sees it; spec: a fixture article containing an instruction produces no action
- [ ] T734 [P] `features/record-suggestion-outcome/` — on `training.SessionCompleted`, `SessionCancelled` and `SessionSkipped`, record what became of the suggestion that produced that session; spec: an outcome for a session no suggestion produced is ignored, and a repeated event is idempotent

## Phase 5 — Clients

- [ ] T740 Drift 7 → 8: `links` table (add/remove push, pull), guarded branch, ladder test extended; sync adapter registered
- [ ] T741 `features/knowledge` in Athlete — add link (paste and Android share-sheet), list with state chips and retry, detail with summary, key points, media gallery and a link out
- [ ] T742 Suggestions inbox — accept into the session, dismiss; honours the preferences toggle
- [ ] T743 [P] Frontend admin: the `ingestionQueue` read from T723 with reasons and attempts, retry and the clear command from T726 with its confirmation

## Phase 6 — Polish

- [ ] T750 [P] Read every limit from the P0 registry — `knowledge.maxAttempts`, `maxChars`, `playlistMaxItems`, `maxLinksPerDay`, `concurrency`, `stuckAfterMinutes`, and the model keys `llm.summarizeModel` and `llm.numCtx`; spec: a value changed in settings takes effect without a restart and no limit has a default of its own in this context
- [ ] T751 [P] `test/ingest-fixture.mjs` + 10 saved article fixtures for the faithfulness review (SC-004), asserting on the same run that each summary is at most 150 words and carries the source's title, its length and a link out (SC-006)
- [ ] T752 [P] `SETUP.md` section on the platform-terms caveat
- [ ] T753 [P] `purge-on-deleted` handler for `links`, `knowledge_docs`, `suggestions` on `identity.UserDeleted`; spec
- [ ] T754 Record gate evidence including the fixture review; open `022-nutrition-daily-plan`

## Dependencies

T701 → T702/T703 → T710–T713 → T720 → T721 → T722; T725 and T726 follow T721, T723
follows T702. T730, T731 and T734 need T721 and Training's `SessionScheduled` (P6).
T740 → T741 → T742. T743 needs T723 and T726.

## Verification gate

1. `pnpm --filter @botvy/backend test` — every transition, expansion idempotency,
   duplicates, retry cap, the stalled re-queue, both schema fallbacks, chunking, the
   preference gate, injection containment.
2. `node apps/backend/test/ingest-fixture.mjs` — record the faithfulness review and the
   one-screen check (SC-004, SC-006).
3. `cd apps/mobile && flutter test && flutter analyze`.
4. Manual: save an article and a three-video playlist → all reach done inside the
   stated times; break a URL → failed with a reason and a retry that works; with an
   upper-body session tomorrow → a suggestion citing a saved source; accept → the
   session holds it, editable; turn suggestions off → nothing is generated and the
   worker logs show no query for that member.
5. Manual: kill the worker mid-summarise → `/health` shows `knowledge.ingest` degraded
   while the row sits, the sweep returns it to waiting inside `stuckAfterMinutes`, and
   it finishes with its attempt count unchanged (SC-007).
6. Manual: clear an entry from the admin queue → it disappears from the member's list
   and the `audit_log` row names the administrator.

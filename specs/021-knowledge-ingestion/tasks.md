# Tasks: Knowledge Ingestion & Suggestions (P7)

**Input**: `spec.md`, `plan.md`; blueprint data-model §2.7, contracts.

**Tests**: mandatory for the state machine, playlist expansion, duplicates, retry cap,
chunked summarisation, the preference gate and injection containment.

## Phase 1 — Domain and ports

- [ ] T701 `contexts/knowledge/domain/`: `link.aggregate.ts` (save, detectKind, the five transitions, fail with reason, retry with attempt cap), `reading.ts`, `suggestion.aggregate.ts`, repository ports, and the three pipeline ports (`source-fetcher`, `content-extractor`, `summariser`)
- [ ] T702 [P] `infrastructure/`: mongo adapters (unique partial index on `(userId, normalizedUrl)`), schemas, mappers, in-memory adapters and fake pipeline adapters for specs
- [ ] T703 [P] URL normalisation and kind detection (article, website, video, playlist) with a fixture table of 30 URLs

## Phase 2 — Acquisition adapters

- [ ] T710 [P] `http-source-fetcher.ts` — undici with timeout, redirect limit, size cap, content-type check and the SSRF guard shared with the media proxy; spec: a login page is not stored as an article
- [ ] T711 [P] `readability-extractor.ts` — jsdom + `@mozilla/readability`, title, author, published date, text capped at `knowledge.maxChars`, image references collected
- [ ] T712 [P] `youtube-source.ts` — `youtubei.js`: video metadata and transcript, playlist listing capped at `knowledge.playlistMaxItems`; documents the platform-terms caveat in a header comment and in `SETUP.md`
- [ ] T713 [P] `llm-summariser.ts` — map-reduce over 2–4K-token chunks, then key points via a JSON schema; resumable when the model is unavailable

## Phase 3 — The pipeline (US1, US2)

- [ ] T720 `features/add-link/` — save with `queued`, detect kind, raise `LinkAdded`; duplicate returns the existing entry; `features/remove-link/` tombstones and removes children; `features/retry-link/` resets to `queued` with `attempts + 1` and refuses past `knowledge.maxAttempts`
- [ ] T721 `features/ingest-link/` (worker, on `LinkAdded` and the internal endpoint) — fetch → extract → summarise → done, one transition per step each raising `LinkStateChanged`; on failure store the reason and stop; bounded by `knowledge.concurrency`; specs cover every transition and a resume after a model outage
- [ ] T722 [P] `features/expand-playlist/` — create one child link per video, idempotent, parent finishes when its children do; spec: expanding twice creates no duplicates
- [ ] T723 [P] Queries `links(status, kind)`, `link(id)` with its reading and media, `admin-queue`
- [ ] T724 [P] Media references served through the existing signed proxy; spec: the client never receives a source host URL

## Phase 4 — Suggestions (US3)

- [ ] T730 `features/generate-suggestion/` — worker saga on `training.SessionScheduled`: return immediately when `aiSuggestions` is off (spec asserts no query runs), otherwise select up to five relevant readings by sport and tags with recency weighting, ask the model for a schema-constrained draft, store `pending`, raise `SuggestionReady`
- [ ] T731 [P] `features/accept-suggestion/` — dispatch Training's `update-session` with the draft, mark accepted with the session id; `features/dismiss-suggestion/` — mark dismissed so the same session is not proposed again; specs cover both
- [ ] T732 [P] Query `suggestions(status)`; `SuggestionReady` becomes an alert and a coach message (P2 and P4 mechanisms)
- [ ] T733 Injection containment: source text enters prompts only inside a delimited untrusted block; the P4 intent extractor never sees it; spec: a fixture article containing an instruction produces no action

## Phase 5 — Clients

- [ ] T740 Drift 7 → 8: `links` table (add/remove push, pull), guarded branch, ladder test extended; sync adapter registered
- [ ] T741 `features/knowledge` in Athlete — add link (paste and Android share-sheet), list with state chips and retry, detail with summary, key points, media gallery and a link out
- [ ] T742 [P] Suggestions inbox — accept into the session, dismiss; honours the preferences toggle
- [ ] T743 [P] Frontend admin: ingestion queue with reasons, attempts, retry and clear

## Phase 6 — Polish

- [ ] T750 [P] Registry keys `knowledge.maxAttempts`, `maxChars`, `playlistMaxItems`, `concurrency` with schemas and descriptions
- [ ] T751 [P] `test/ingest-fixture.mjs` + 10 saved article fixtures for the faithfulness review (SC-004)
- [ ] T752 [P] `SETUP.md` section on the platform-terms caveat and the `yt-dlp` fallback
- [ ] T753 [P] `purge-on-deleted` handler for `links`, `knowledge_docs`, `suggestions` on `identity.UserDeleted`; spec
- [ ] T754 Record gate evidence including the fixture review; open `022-nutrition-daily-plan`

## Dependencies

T701 → T702/T703 → T710–T713 → T720 → T721 → T722. T730 needs T721 and Training's
`SessionScheduled` (P6). T740 → T741 → T742.

## Verification gate

1. `pnpm --filter @botvy/backend test` — every transition, expansion idempotency,
   duplicates, retry cap, chunking, the preference gate, injection containment.
2. `node apps/backend/test/ingest-fixture.mjs` — record the faithfulness review.
3. `cd apps/mobile && flutter test && flutter analyze`.
4. Manual: save an article and a three-video playlist → all reach done inside the
   stated times; break a URL → failed with a reason and a retry that works; with an
   upper-body session tomorrow → a suggestion citing a saved source; accept → the
   session holds it, editable; turn suggestions off → nothing is generated and the
   worker logs show no query for that member.

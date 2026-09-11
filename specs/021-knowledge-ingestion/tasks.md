# Tasks: Knowledge Ingestion & Suggestions (P7)

**Input**: `spec.md`, `plan.md`; blueprint data-model §2.7, contracts.

**Task ids are phase-local**: the `T7xx` series below belongs to this phase alone. The
blueprint's `tasks.md` runs its own `T###` series, and a shared number there means
something else entirely — never cross-reference the two by id.

**Tests**: mandatory for the state machine, playlist expansion, duplicates, retry cap,
the stalled re-queue, both schema-decode fallbacks, chunked summarisation, the
preference gate and injection containment.

## Phase 1 — Domain and ports

- [x] T701 `contexts/knowledge/domain/`: `link.aggregate.ts` (save, detectKind, the five transitions, fail with reason, retry with attempt cap), `reading.ts`, `suggestion.aggregate.ts`, repository ports, and the three pipeline ports (`source-fetcher`, `content-extractor`, `summariser`)
- [x] T702 [P] `infrastructure/`: mongo adapters (unique partial index on `(userId, normalizedUrl)`), schemas, mappers, in-memory adapters and fake pipeline adapters for specs
- [x] T703 [P] URL normalisation and kind detection (article, website, video, playlist) with a fixture table of 30 URLs

## Phase 2 — Acquisition adapters

- [x] T710 [P] `http-source-fetcher.ts` — undici with timeout, redirect limit, size cap, content-type check and the SSRF guard shared with the media proxy; spec: a login page is not stored as an article
- [x] T711 [P] `readability-extractor.ts` — jsdom + `@mozilla/readability`, title, author, published date, text capped at `knowledge.maxChars`, image references collected (images only this phase; embedded video and audio are not collected)
- [x] T712 [P] `youtube-source.ts` — `youtubei.js`: video metadata and transcript, playlist listing capped at `knowledge.playlistMaxItems`; documents the platform-terms caveat in a header comment and in `SETUP.md`; spec: a video with no transcript returns its metadata with the transcript null and the extractor marks the document transcript-less rather than raising
- [x] T713 [P] `llm-summariser.ts` — map-reduce with `llm.summarizeModel`, chunk size derived from `llm.numCtx` less the prompt frame and reply budget so only one context size is ever loaded, then key points via a JSON schema; spec: a chunk never exceeds the derived budget when `llm.numCtx` changes, key points that fail to decode leave the plain summary standing with an empty key-point list, and a model outage propagates as "not now" rather than as a failure

## Phase 3 — The pipeline (US1, US2)

- [x] T720 `features/add-link/` — save with `queued`, detect kind, raise `LinkAdded`; duplicate returns the existing entry; refuse a save past `knowledge.maxLinksPerDay` counted over the member's local day, with a reason the client can show; `features/remove-link/` tombstones and removes children; `features/retry-link/` resets to `queued` with `attempts + 1` and refuses past `knowledge.maxAttempts`; spec: the quota counts a member's own day through `shared/time`, refuses the next save and leaves everything already queued running
- [x] T721 `features/ingest-link/` (worker, on `LinkAdded` and the internal endpoint) — fetch → extract → summarise → done, one transition per step each raising `LinkStateChanged`, `knowledge.LinkIngested{ linkId, docId, tags }` on the last one; a rejection by the source stores the reason and stops, a model or network outage leaves the row in its current state for the sweep; bounded by `knowledge.concurrency`; stamps `ops_heartbeats['knowledge.ingest']` on every run; specs cover every transition, the `LinkIngested` payload, and an outage leaving `attempts` untouched
- [x] T722 `features/expand-playlist/` — create one child link per video up to `knowledge.playlistMaxItems`, idempotent; a video the member already saved standalone is adopted by setting its `parentLinkId` rather than duplicated; the parent rolls up on its children's `LinkIngested` and records how many videos were skipped; spec: expanding twice creates no duplicates, and adopting an existing link neither re-reads it nor violates the unique index
- [x] T723 [P] Queries `links(status, kind)`, `link(id)` with its reading and media, and GraphQL `ingestionQueue(status)` across members for the admin portal — the read P10's queue screen consumes
- [x] T724 [P] Media references served through the existing signed proxy; spec: the client never receives a source host URL
- [x] T725 `features/requeue-stalled/` (worker tick) — claim rows in `fetching`, `extracting` or `summarising` whose `updatedAt` is older than `knowledge.stuckAfterMinutes` and return them to `queued` without touching `attempts`; `/health` reports `knowledge.ingest` degraded when its heartbeat is stale or the oldest `queued` row has waited past the same threshold; spec: fixture rows aged relative to `Date.now()`, a killed mid-summarise row comes back and finishes, a row inside the threshold is left alone
- [x] T726 [P] `features/admin-clear-link/` — `DELETE /admin/knowledge/:linkId` (admin) removes the entry, its reading and its children and writes the `audit_log` row; spec: the member's list loses it too and the audit row names the administrator and the reason

## Phase 4 — Suggestions (US3)

- [x] T730 `features/generate-suggestion/` — worker saga on `training.SessionScheduled`, only for sessions at least a day away: return immediately when `aiSuggestions` is off (spec asserts no query runs), otherwise select up to five relevant readings by sport and tags with recency weighting, ask the model at the one configured `llm.numCtx` for a schema-constrained draft, store `pending`, raise `SuggestionReady`; spec: a draft that fails to decode stores no suggestion and sends the model's plain reply as a coach message instead, and a session less than a day away produces nothing
- [x] T731 [P] `features/accept-suggestion/` — mark accepted and raise `knowledge.SuggestionAccepted{ suggestionId, sessionId? }` with the draft for Training to fill or create the session; record `acceptedSessionId` from the accept command when the member named a session, otherwise from the `training.SessionScheduled` that carries this `suggestionId` back (the event payload names it, so nothing is matched on member, date and sport); `features/dismiss-suggestion/` — mark dismissed so the same session is not proposed again; specs cover both paths to the session id and assert Knowledge dispatches no Training command
- [x] T732 [P] Query `suggestions(status)`; `SuggestionReady` is consumed by Notifications for the `suggestion` alert (P2) and by Conversations for the coach message (P4) — Knowledge raises it and sends neither
- [x] T733 Injection containment: source text enters prompts only inside a delimited untrusted block; the P4 intent extractor never sees it; spec: a fixture article containing an instruction produces no action
- [x] T734 [P] `features/record-suggestion-outcome/` — on `training.SessionCompleted`, `SessionCancelled` and `SessionSkipped`, record what became of the suggestion that produced that session; spec: an outcome for a session no suggestion produced is ignored, and a repeated event is idempotent

## Phase 5 — Clients

- [x] T740 Drift 7 → 8: `links` table (add/remove push, pull), guarded branch, ladder test extended; sync adapter registered
- [x] T741 `features/knowledge` in Athlete — add link (paste and Android share-sheet), list with state chips and retry, detail with summary, key points, media gallery and a link out
- [x] T742 Suggestions inbox — accept into the session, dismiss; honours the preferences toggle
- [x] T743 [P] Frontend admin: the `ingestionQueue` read from T723 with reasons and attempts, retry and the clear command from T726 with its confirmation

## Phase 6 — Polish

- [x] T750 [P] Read every limit from the P0 registry — `knowledge.maxAttempts`, `maxChars`, `playlistMaxItems`, `maxLinksPerDay`, `concurrency`, `stuckAfterMinutes`, and the model keys `llm.summarizeModel` and `llm.numCtx`; spec: a value changed in settings takes effect without a restart and no limit has a default of its own in this context
- [x] T751 [P] `test/ingest-fixture.mjs` + 10 saved article fixtures for the faithfulness review (SC-004), asserting on the same run that each summary is at most 150 words and carries the source's title, its length and a link out (SC-006)
- [x] T752 [P] `SETUP.md` section on the platform-terms caveat
- [x] T753 [P] `purge-on-deleted` handler for `links`, `knowledge_docs`, `suggestions` on `identity.UserDeleted`; spec
- [x] T754 Record gate evidence including the fixture review; open `022-nutrition-daily-plan`

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

---

## Gate evidence

Run on 2026-09-11 against the live `botvy-v2` stack after a clean image rebuild
and a `--force-recreate`, with the compiled code confirmed *inside* the
container before the gate ran — a failed build followed by a restart of the
previous image looks exactly like a successful deploy. Every command below was
executed; the numbers are its output, not a summary of it.

### Unit and static

```
pnpm --filter @botvy/backend test
  Test Files  88 passed (88)
       Tests  1465 passed (1465)

pnpm --filter @botvy/backend typecheck
  tsc --noEmit -p tsconfig.build.json && tsc --noEmit -p tsconfig.json
  (clean)

pnpm lint
  Found 0 warnings and 0 errors.
  Finished in 10.2s on 593 files with 102 rules using 12 threads.

pnpm --filter @botvy/frontend typecheck     (clean)

cd packages/sdk; npx vitest run
  Test Files  3 passed (3)   Tests  91 passed (91)

node infra/verify-esm.mjs
  PASS  the backend has been built
  PASS  app.module.js loads under plain node
  PASS  worker.module.js loads under plain node
  3/3 checks passed

cd apps/mobile; flutter test
  356 tests, All tests passed!
cd apps/mobile; flutter analyze
  No issues found!
```

`pnpm lint` and not `npx oxlint`: the bare command discovers `.oxlintrc.json`,
which this repo does not have, and runs 99 built-in rules over the whole tree —
`legacy/` included — instead of the 102 the config defines. The three
`no-restricted-imports` overrides that enforce constitution IX are among the
three it loses. 102 rules over 593 files above is the proof they ran.

**The cross-context rule was probed rather than assumed.** `knowledge` was added
to its pattern list in this change — twelve patterns, 144 across twelve contexts
— and the rule was tested by writing a file that should fail:

```
apps/backend/src/contexts/training/features/probe-lint/probe.ts
  import { LinkRepository } from '../../../knowledge/domain/knowledge.repositories.js';

  x eslint(no-restricted-imports): '../../../knowledge/domain/knowledge.repositories.js'
    import is restricted from being used by a pattern.
  help: Constitution IX: a context may not import another context. …
```

Deleted immediately afterwards. A lint rule nobody has seen fire is a comment.

### The platform

```
node infra/verify.mjs
  PASS  containers healthy — 8 services
  PASS  exactly one public port — caddy:0.0.0.0:8090
  PASS  health reports both stores — status=ok postgres=true mongo=true ollama=true push=true
  PASS  no stale jobs — 8 jobs fresh
  PASS  bootstrap is safe to run again — second run changed nothing
  5/5 checks passed in 13s
```

Eight jobs rather than seven: `knowledge.ingest` is this phase's, stamped every
five minutes by `workflows/knowledge_ingest.json`. `bootstrap.mjs` reported
"6 files: 1 created, 5 updated, 1 activated".

### The phase

```
node infra/verify-p7.mjs
  24/24 checks passed against http://127.0.0.1:8090
```

Every requirement the gate reaches, with the numbers it reported:

| Check | Evidence |
|---|---|
| saving answers at once with its kind and a queued state (FR-001) | `status=200 kind=article state=queued` |
| the article is read, summarised and stored (SC-001) | `52 s, summary 448 chars` — the requirement is three minutes |
| the summary answers "is this worth my time" on one screen (SC-006) | `62 words, source 7999 chars` |
| the same link saved twice is answered, not read twice (FR-005) | `duplicate=true id=the one they had` — a `utm_*` parameter and a fragment away from the first |
| a link Botvy cannot read fails with a reason and an attempt count (FR-003) | `status=failed attempts=1 reason=Botvy will not fetch that address: refused an internal hostname.` |
| a failed link can be tried again (FR-003) | `status=200 state=queued` |
| retrying stops at the Owner's limit (FR-004) | `409 {"code":"attempts_exhausted","message":"This link has been refused 2 times; the limit is 1."}` |
| a link pointing inside the compose network is refused (constitution V) | `mongo:27017 → failed; n8n:5678 → failed; 127.0.0.1:8080/internal → failed; 169.254.169.254 → failed` |
| a save past the day's quota is refused with a reason (FR-015) | `429 {"code":"daily_quota", … "limit":6}` |
| the links already queued are untouched by the refusal (FR-015) | `before=6 after=6` |
| `/internal/knowledge/ingest` refuses a member's token (constitution VI) | `refused`, and an unauthenticated REST call is 401 |
| the drain runs and reports what it did | `{"requeued":0,"ingested":0,"failed":0,"ms":8}` |
| the pass stamps a heartbeat `/health` can report (FR-017) | `stale=false lastError=none` |
| `/media` refuses a URL this installation did not sign (FR-008) | `status=400` |
| `/media` refuses a signed URL pointing inside the network (FR-008) | `status=400` |
| a member with suggestions off gets none (SC-003) | `suggestions=0` |
| a suggestion cites the member's own sources (FR-009) | `sources=1` |
| accepting a suggestion fills the session it was about (FR-010) | `status=200 session=aa43b812-…` |
| links travel over `/sync` with their state and their document pointer | `links=6`, and no summary on the wire |
| a push that tries to edit a link is refused as invalid, never as stale | `reason=invalid` |
| the Owner sees the queue across members, with reasons (FR-014) | `rows=5` |
| an ordinary member cannot read the queue | `forbidden` |
| the Owner can clear an entry, and it leaves the member's list (FR-014) | `status=200 documents=0` |
| deleting the account purges the links and their documents | `status=200` |

The two settings the gate changes — `knowledge.maxLinksPerDay` and
`knowledge.maxAttempts` — were confirmed back at 20 and 3 afterwards, along
with the other four.

### The ten-article fixture (SC-004, SC-006)

`node apps/backend/test/ingest-fixture.mjs`, against the real extractor, the
real summariser and `qwen2.5:3b-instruct` at 8 K context. The ten articles are
fixed text rather than downloaded pages, for the reason the fixture states: a
fixture that fetches a real page grades somebody else's server, goes red on a
bad afternoon, and leaves a reviewer comparing a summary against an article that
has since been rewritten.

```
SC-006, measured over 10 fixtures:
  longest summary : 137 words (limit 150)
  slowest         : 111818 ms
  key points      : 10/10 decoded

SC-006: every summary is within the limit and names its source.
```

**SC-004 — the faithfulness review: 8 of 10, which is exactly the bar.**

Read against the source, with the two failures named rather than rounded away:

| Fixture | Verdict | Note |
|---|---|---|
| progressive-overload | faithful | All four levers, the one-variable rule, the three weeks. A garbled clause about density; nothing false |
| against-stretching | **not faithful** | Adds "a warm-up … seems more effective for preventing injury". The source says stretching does *not* prevent injury and claims nothing for the warm-up either |
| zone-two | faithful | Every number right: 185, 111–130, three hours, 2×90 = 3×60, the drift upward |
| protein-numbers | **not faithful** | **Invents "20 grams per meal for older trainees, 16 for younger"**. The source says nearer 2.0 g/kg past sixty. The numbers look like a distortion of the 32/43 g distribution figures |
| push-pull-legs | faithful | Drops the sets and reps; states nothing false |
| sleep-and-lifting | faithful | Misses the mechanism; the claims it keeps are right |
| deload | faithful | Keeps the author's hedge, which is the point of that fixture |
| swimming-technique | faithful | All four drills, correctly |
| short-note | faithful | The shortest article, and the one the extractor defect was found on |
| not-about-training | faithful | Deliberately off-topic, and summarised as such |

Both failures are the **same** failure: the model adding a numeric or causal
claim the source did not make, in an article whose own claims were numerical.
That is the known weakness of this installation's model and the same one the
intent corpus already records; a bigger *instruct* model is the fix, and it is
the outstanding item P4 and P6 both carry.

Two things make this number weaker than it looks, and are worth writing down
rather than leaving to be discovered:

- **The reviewer was the implementer.** Somebody who knows what the fixture was
  written to contain reads a summary differently from somebody who does not. An
  independent read of the same ten is listed as outstanding below.
- **Eight of ten is the bar and eight is what it scored.** One more article
  going the way `protein-numbers` did would put it under, and the failures are
  not random: they cluster on the articles that are mostly numbers.

### Five defects the phase found, all fixed in it

**1. The single commonest duplicate was two entries.** URL normalisation is what
makes FR-005 true, and its tracking-parameter list named `fbclid`, `gclid` and
eleven others and **not `utm_*`** — so an article arriving from a newsletter and
the same article arriving from a friend were two links and two readings, which
is precisely the case the requirement exists for. Found by the thirty-URL
fixture table on its first run, which is the argument for the table. Fixed as a
*prefix* rather than five more names, because the convention is open-ended and
listing the five everybody knows is how the sixth silently does it again. The
same fix exposed a second bug beside it: `URLSearchParams.keys()` is a live
iterator over the list `delete` mutates, so two adjacent tracking parameters
left the second one in place.

**2. A cookie banner became the first sentence of the summary.** Readability
scores relatively: on a long article a consent banner is noise beside the body,
and on a short one it is a comparable block of text. The ten-article fixture's
shortest piece came back with *"We use cookies to improve your experience"* as
the opening of its extracted text — and the summariser reads what it is given,
so a 3B model duly wrote about cookies. It cost twice over, because the banner's
seventy-odd characters also pushed a genuinely thin page over the minimum, so a
page that should have been refused was summarised instead.

`stripChrome` now removes `script`, `style`, `noscript`, `nav`, `footer` and
anything whose class or id names a cookie or a consent, **before** Readability
scores. The class match is deliberately narrow: every widening is a chance to
delete somebody's article, so `aside` and `form` are left alone.

The minimum moved **400 → 200** in the same change, because the two numbers were
always coupled and only one of them was visible: 400 had been tuned against
pages that still had their banner padding them. With the chrome stripped, 400
refused a genuine three-sentence post and called it a login wall — a worse
failure than the one it guarded against, since a member is told their article is
a paywall. The refusal's wording was softened for the same reason. Nine cases in
`knowledge-extraction.spec.ts` pin both halves, and they run under `pnpm vitest`
rather than only in the fixture: a rule that holds only when somebody remembers
to run something is a rule that stops holding.

**3. Retry did nothing for up to five minutes.** Found by the gate, and it is
the clearest thing the gate bought. `knowledge.LinkAdded` is raised once, at
creation, so a link sent back to the queue — by a member pressing Retry, by the
Owner's force-requeue, or by the stall sweep recovering it — sat there until the
next five-minute tick. FR-003's "offers to try again" is not a promise about the
next five minutes. The relay now also dispatches `knowledge.LinkStateChanged`,
and the saga acts **only** on a `queued` status: the event fires on every
transition, so anything wider would have the pipeline calling itself once per
step. Two tests, one for each half.

**4. The body cap only stopped at a chunk boundary.** `readCapped` broke out of
its read loop *after* appending the chunk that crossed the cap, so a source
delivering its whole body in one chunk overshot completely. Bounded in
production by one network chunk and unbounded in principle; its spec caught it
by constructing a `Response` from a four-megabyte string. The decoded text is
cut to the cap after the loop now.

**5. A module exported a provider it does not own.** `KnowledgeModule` listed
`MemberContextPort` among its exports — it comes from `ProfileModule` — and Nest
refused to build the graph in both roles. Caught by `app.module.spec.ts`, which
is exactly what that spec is for: the failure is an exception at boot that no
typecheck sees.

### Three mistakes in the gate itself, worth recording

All three are the class P5 and P6 both recorded: **a gate reporting a working
feature as broken.**

- **It read `body.rejected` where the server serves `rejections`.** A correct
  refusal showed up as an accepted edit — the same shape as P5's `limit`-where-
  the-schema-said-`first` and P6's `slotId`.
- **Its failure fixture produced the wrong kind of failure.** It used
  `https://p7-gate.invalid/article`, and a DNS failure is indistinguishable from
  *this machine having no DNS* — so the fetcher maps it to `unavailable`, leaves
  the row for the stall sweep, and spends no attempt. Which is exactly FR-016
  working, and exactly the wrong fixture for a check about FR-003. It uses an
  address the SSRF guard refuses now: the same shape, deterministically, with no
  network and no waiting.
- **Its article had no article in it.** `https://example.com/` carries about a
  hundred and twenty characters of body text, below the extractor's minimum, so
  the gate reported "this machine could not read it" when the machine had read
  it perfectly. It reads an RFC now, and the skip message distinguishes *never
  settled* from *reached and refused* — because those are different problems and
  the first version said the same thing about both.

### Contract corrections, and which way round each mistake was

`packages/contracts/schema.graphql` and the event schemas are generated, and
therefore the truth. Where the blueprint disagreed with what can be built, the
blueprint was corrected in this change:

- **`knowledge.SuggestionAccepted` could not work as typed.** The catalogue
  typed it `{ suggestionId, sessionId? }` while its own consumer column said
  "Training → fill/create session". There is no session content in a pointer,
  and following it would mean Training reading `suggestions` — the boundary
  violation the event exists to prevent, and the same defect P2 shipped when
  `TaskScheduled` omitted `title`. It carries the whole draft now.
- **Accept *fills*; it does not create.** A suggestion is generated *from* a
  session and always has one, so the creating half of
  `POST /suggestions/:id/accept` was unreachable — and building it would have
  meant inventing an hour of the day the member never chose, which principle XI
  forbids.
- **`SuggestionDraft.exercises` is `[SuggestedExercise!]!`, not `[Exercise!]!`.**
  `Exercise` is Training's type and a Knowledge `features/` file declaring it is
  what `no-restricted-imports` refuses. Exactly P6's correction to
  `Program.sourceLinks`, in the other direction. The shapes differ anyway: a
  suggestion has targets and can never have actuals.
- **`LinkIngested.docId` is nullable.** An expanded playlist's parent finishes
  with children rather than a document.
- **`POST /internal/knowledge/ingest` was added.** `contracts/internal.md` named
  only the per-link route, and two requirements written after it need a periodic
  pass: FR-016, because a link left mid-read must come back on its own, and
  FR-017, because a job that stops running must be visible and a heartbeat only
  exists if something stamps it. There is nothing for a per-link route to stamp.
- **`training.SessionScheduled` finally carries `suggestionId`.** The catalogue
  promised it in P0 — "present when the session came from an accepted
  suggestion, so Knowledge can record the outcome without guessing" — and
  nothing wrote it, because nothing set the field until now.

### Two things the plan asked for and this phase declined

Both are recorded here rather than done quietly.

**The coach message on `LinkIngested` and `SuggestionReady`.** The catalogue has
Conversations posting one for each. The rhythm writes its touches into the chat
because the *question* would otherwise exist only inside a notification — v1's
lesson, where a member who opened the app was expected to answer something that
was nowhere on screen. Neither of these has a question: a link has a row in a
list, and a suggestion has a card with Use this and No thanks on it. A line
about every link a member saves is Botvy narrating its own background work. The
one path that *does* write into the chat is the opposite case — a draft the
model would not produce structurally, where there is no card to show and its
plain words are the only honest thing to deliver.

**The second route to `acceptedSessionId`.** T731 describes Training creating a
session and Knowledge correlating the id back from `SessionScheduled`. That
route is unreachable as built, because there is no case in which an accepted
suggestion has nowhere to go — and a correlation path with no caller is a path
nothing is testing. What survives from the note is its point, which is honoured:
nothing is ever matched on member, date and sport.

### Two departures from the task list, both narrower than they read

- **`requeue-stalled` is a method on `IngestLinkSaga`, not its own slice
  (T725).** The sweep needs the same repository, the same settings key and the
  same unit of work as the drain, and it has to run *before* it — a link a dead
  worker left behind is read in the same pass rather than waiting another tick.
  Splitting it would have produced a second class the drain has to call and a
  second place to read `knowledge.stuckAfterMinutes`.
- **`fail` increments `attempts`; `retry` does not (T720).** The task says
  "reset to `queued` with `attempts + 1`", which is the same arithmetic read
  from the other end and becomes a double count if `fail` also increments.
  Counting on `fail` also means a link that has failed once shows an attempt
  count of one, which is the number FR-003 asks to be shown beside the reason.

### Still outstanding, and not closed by this gate

- **An independent faithfulness review** of the ten fixtures. The 8/10 above was
  scored by the implementer; see the note beside it.
- **The intent corpus** is 56 cases against a threshold of 51, unmet on
  `qwen2.5:3b-instruct`. This phase's two SC-004 failures are the same weakness
  in the same model, so the fix is the same one: a bigger *instruct* model, and
  `qwen3` is not it.
- **A real playlist end to end.** The gate covers expansion, adoption and
  idempotency in unit specs; the twenty-minute ten-video figure in SC-001 has
  not been measured against YouTube on this machine.
- **RTL screenshots and the manual handset walkthrough**, open since P2 and
  needing a physical Android device. The saved-links screens and the suggestions
  inbox join the list.
- **A native review of the Arabic strings.** This phase adds thirty to the phone
  and thirteen to the portal.
- **SC-003's ninety-second logging (P6) and SC-004 (P5)** both still need a
  person with a phone.
- **Deleting the old Firebase key**, deferred by the Owner.

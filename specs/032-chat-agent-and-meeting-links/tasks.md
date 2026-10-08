# Tasks: Meeting links with previews, and a chat that can change anything

**Input**: `spec.md`, `plan.md`.

**Task ids** are local to this phase.

## Phase 1 — Spec
- [x] T3201 `spec.md`, `plan.md`, `tasks.md`; `ws-chat.md` gains `chat.confirm`
  and the `confirm` card

## Phase 2 — Meeting links (US1)
- [x] T3210 Aggregate refuses a link-shaped location without `http(s)`
  (`location_link_scheme`). `spec:` scheme table
  — `domain/location-link.ts`; schedule, edit and override locations; 400 over
  REST and `invalid` over sync through the existing mappings.
  `meetings-location-link.spec.ts`, one case in `meetings-sync.spec.ts`
- [x] T3211 Mobile: a link-shaped address opens directly. `test:` widget
  — `location_link.dart`; the address tile reads as a link;
  `test/meeting_link_test.dart`
- [x] T3212 Extension: a link-shaped address is an `<a>`. `test:` component
  — `lib/meeting-links.ts` `safeHref` (the Join button too);
  `test/meeting-links.spec.ts` renders to static markup

## Phase 3 — Preview (US2)
- [x] T3220 `link-preview` slice: SSRF-guarded fetch, OG parse, coordinates from
  map URLs, Nominatim behind `meetings.geocodeEnabled`/`meetings.geocodeUrl`,
  `link_previews` cache. `spec:` URL table, SSRF hop, cache, setting off
  — TTLs are `meetings.previewTtlDays`/`previewFailureTtlDays`; the cache is
  shared, keyed by a hash, TTL-indexed (migration `20261008000000`); our own
  outages are not cached. `meetings-link-preview.spec.ts`
- [x] T3221 GraphQL `linkPreview` in `RESOLVERS`; `schema.graphql` regenerated

## Phase 4 — Preview clients (US2)
- [x] T3230 Mobile: preview card and `flutter_map` thumbnail with OSM attribution
  — `lib/ui/link_preview_card.dart` (kit), shown in the meeting's action sheet
- [x] T3231 Extension: preview card and "View on map"

## Phase 5 — Fixes
- [x] T3240 `add_meal` in `ACTIONS`. `spec:` through `TurnRunner`
- [x] T3241 Meeting and session cards carry ISO `at`. `spec:` adapter

## Phase 6 — Read view (US3)
- [x] T3250 `<now>` block gains tasks, reminders, meetings, sessions, meals,
  slots, capped. `spec:` contents and prefix stability

## Phase 7 — Write intents (US4)
- [x] T3260 `edit`, `complete`, `delete`, `cancel` with `target`; candidate
  finders per target; executor branches. `spec:` per target, ambiguity

## Phase 8 — Confirmation (US4)
- [x] T3270 `chat_proposals`; executor proposes; `chat.confirm`; typed yes/no in
  the same conversation; claim-then-apply; expiry; re-read. `spec:`

## Phase 9 — Prompts and evaluation
- [x] T3280 `intent.md`, `planner.md`; corpus +~30 cases; live fixture score

## Phase 10 — Mobile chat
- [x] T3290 Confirm card with Yes/No over the socket. `test:` widget

## Phase 10b — Saved links (added 2026-10-08, the Owner)
- [x] T3295 A saved link's pictures open full screen (pinch/double-tap zoom,
  swipe, caption); the address, links in the summary and key points, the
  playlist's videos and "Open original" open externally (http(s) only).
  `test:` `test/ui/media_viewer_test.dart`

## Results (2026-10-08, live qwen2.5:3b-instruct, num_ctx 8192)

| | Pre-032 prompt | 032 |
|---|---|---|
| The 61 pre-existing cases | 33/61 | **37/61** |
| The 29 new cases (edit, complete, delete, targeted cancel, near misses) | — | 13/29 |
| All 90 | — | **50/90** (gate: 81) |
| Silent time errors | 0 | **0** |
| Extraction p95 | 3.9 s | 4.4 s |

SC-001 is **not met**, and the prompt was not tuned to the corpus to meet it
(plan B5). What the misses are: an edit read as a create ("push the tax filing
task to tomorrow" → `set_task`), a question read as an instruction ("when is
my dentist appointment?" → `set_reminder`), and the pre-existing body/schedule
scope confusion. None of them changes anything unasked: a mis-read edit or
delete is a proposal the member declines, and a mis-read create is the
behaviour before 032.

Found and fixed on the way, each with a spec: extraction had no token ceiling
(`llm.extractMaxTokens`); the fixture hard-coded num_ctx 4096 against the
registry's 8192 and graded a truncated prompt; a question is never a change
(`isQuestion`); "٤ العصر" was 14:00 (`afternoonHour`, the sentence's stated
hour wins).

## Phase 11 — Release (on the Owner's word)
- [ ] T3299 Version 2.5.0, phone build 8

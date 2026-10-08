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
- [ ] T3240 `add_meal` in `ACTIONS`. `spec:` through `TurnRunner`
- [ ] T3241 Meeting and session cards carry ISO `at`. `spec:` adapter

## Phase 6 — Read view (US3)
- [ ] T3250 `<now>` block gains tasks, reminders, meetings, sessions, meals,
  slots, capped. `spec:` contents and prefix stability

## Phase 7 — Write intents (US4)
- [ ] T3260 `edit`, `complete`, `delete`, `cancel` with `target`; candidate
  finders per target; executor branches. `spec:` per target, ambiguity

## Phase 8 — Confirmation (US4)
- [ ] T3270 `chat_proposals`; executor proposes; `chat.confirm`; typed yes/no in
  the same conversation; claim-then-apply; expiry; re-read. `spec:`

## Phase 9 — Prompts and evaluation
- [ ] T3280 `intent.md`, `planner.md`; corpus +~30 cases; live fixture score

## Phase 10 — Mobile chat
- [ ] T3290 Confirm card with Yes/No over the socket. `test:` widget

## Phase 11 — Release (on the Owner's word)
- [ ] T3299 Version 2.5.0, phone build 8

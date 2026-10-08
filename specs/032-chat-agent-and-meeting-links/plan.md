# Implementation Plan: Meeting links with previews, and a chat that can change anything

## Context

Two requests from the Owner (2026-10-08):

1. **Meeting links.** A physical meeting whose address is a link (a pasted
   `maps.app.goo.gl/…`) should open that link, and both online and physical
   meetings should show a preview.
   - Today meetings already store `location {onlineLink, address}`
     (`backend/src/contexts/meetings/domain/recurrence-expander.ts:24`), and the
     phone's detail sheet has "Join" and "Open in map"
     (`mobile/lib/features/meetings/presentation/meetings_page.dart:252-287`).
   - But `openMeetingLocation` (`:426-457`) sends an address that is a URL into a
     `geo:0,0?q=` search, which breaks it.
   - No preview or Open Graph code exists anywhere.
2. **A chat that can read and write everything.**
   - Today one grammar-constrained call picks one of 11 intents (`intent.ts`
     `INTENT_SCHEMA`), and code executes it.
   - The chat can only create, plus cancel tasks/reminders, merge training
     slots, and complete today's session.
   - It cannot edit, reschedule, complete, cancel meetings or delete anything.
   - The model cannot see meetings, reminders, the meal plan or sessions; it gets
     only today's tasks, a training line, a meal line and the streak.

**Owner's decisions:**
- **Approach:** expand intents and keep the safe design. The model names an
  intent, code resolves ids and writes, and confirmations are templated from what
  was stored.
- **Confirmation:** edits, reschedules, cancels and deletes ask for confirmation
  first; creates apply at once.
- **Preview:** an Open Graph card plus a map thumbnail.
- **Place link:** a URL in the address field is detected automatically, with no
  schema change.

Spec-kit feature `032-chat-agent-and-meeting-links` goes on its own branch, with
`spec.md`, `plan.md` and `tasks.md`. Phases follow.

## Part A — Meeting links and previews

### A1. A link in the address opens as a link
- **Mobile:** in `meetings_page.dart` `openMeetingLocation`, if `address` is
  link-shaped, `launchUrl` it directly (external app); otherwise keep the
  `geo:` → Google Maps search.
  - Show the link tile as tappable text, so the member can see it is a link.
  - The link-shape test reuses the logic of the backend's `linkish` heuristic
    (`intent-executor.ts:1024-1041`). It is duplicated in Dart, since it crosses a
    language boundary.
- **Extension:** `extension/entrypoints/sidepanel/Meetings.tsx:115` shows the
  address as plain text. Render it as `<a target=_blank rel="noreferrer noopener">`
  when it is link-shaped.
- **Backend:** the aggregate (`meeting.aggregate.ts:628-638`) accepts only an
  `http(s)` scheme for `onlineLink`, and for an address that is link-shaped.
  - It refuses `javascript:`/`file:` with a new code, `location_link_scheme`.
  - Today nothing validates the scheme, and the extension renders the link as an
    `href`.

### A2. Preview endpoint: `GET /api/v1/meetings/link-preview?url=`
This is a new slice: `backend/src/contexts/meetings/features/link-preview/`.

- **Answer:** `{ url, title?, siteName?, image?, place?: { lat, lng, label? } }`.
- **Fetch:**
  - Each hop goes through the shared SSRF guard (`checkTarget` /
    `checkResolvedTarget` in `backend/src/shared/media/media.signing.ts:54,114`).
  - Redirects are followed by hand, at most 5. The timeout and byte cap mirror
    `knowledge/infrastructure/http-source-fetcher.ts`, as a small adapter in
    meetings `infrastructure/`.
  - It is a second copy, so it is duplicated rather than imported across
    contexts (CLAUDE.md rule).
- **Parse:** jsdom without scripts, like `readability-extractor.ts`. It reads
  `og:title`, `og:site_name`, `og:image` (resolved absolute) and falls back to
  `<title>`.
- **Place coordinates, in order:**
  1. From the final URL after redirects: Google `@lat,lng`, `q=`/`ll=lat,lng`,
     `!3d…!4d…`; OSM `mlat/mlon`; `geo:`. A short `maps.app.goo.gl` link resolves
     through the redirect chain. This costs nothing and contacts no one new.
  2. Otherwise, for a plain-text address, geocode with Nominatim, behind settings:
     - `meetings.geocodeEnabled` (default `true`) and `meetings.geocodeUrl`
       (default the public Nominatim).
     - A descriptive `User-Agent`, at most 1 request/s (a process-wide queue), and
       a permanent cache.
     - Privacy note: this sends the address text to OSM. It is documented in the
       spec and SETUP, and the operator can switch it off.
- **Cache:** a `link_previews` Mongo collection keyed by
  `sha256(normalised url or address)`. It holds the result or a failure with
  `fetchedAt`, so a dead link is not retried for 7 days.
  - The `schemas.spec.ts` exemption list gets a reason: it is server-only, has no
    `userId` and is shared.
- **Address previews:** a query param `address=` for a text address returns
  `place` only.
- **Auth:** JWT user principal; rate-limited by the existing limits.
- **Contracts:** a REST read is a query, and the constitution says reads go
  through GraphQL. So expose it as a GraphQL query `linkPreview(url, address)` in
  `RESOLVERS`, and regenerate `packages/contracts/schema.graphql` after a build.

### A3. Clients show the preview
- **Mobile, meeting detail sheet:**
  - Fetch through the SDK/GraphQL client when online. Render a card (site name,
    title, `Image.network` thumbnail) under the Join/Open tile.
  - Offline or on failure, show the plain tile only.
  - Map thumbnail: when `place` comes back, show a small non-interactive
    `flutter_map` with OSM tiles, a pin, and the required "© OpenStreetMap"
    attribution. Tapping it opens the same link or search.
  - New dependency: `flutter_map` (BSD-3), with `latlong2`. Tiles carry the app's
    user agent, per the OSM tile policy.
  - Every value comes from `BotvySpace`/`BotvyRadius`, so the
    `check_ui_literals.sh` checks stay green.
- **Extension:** the same card (title, site, image) in `Meetings.tsx`. No map,
  because the side panel is narrow; a "View on map" link instead.

## Part B — Chat that can read and change everything

### B1. The model can see the member's data (read view)
Extend the `<now>` block that 031 built (`prompt-assembler.ts`). It sits at the
end, so the prompt cache stays intact. New, capped sections:
- Overdue and next-3-days tasks
- Reminders in the next 48 h
- Meetings and sessions in the next 7 days (title, local time, place)
- Today's meals and this week's training slots

Each is bound through `MemberDayPort` adapters in
`conversations/infrastructure/chat.adapters.ts` to the existing published queries:
- `TasksQueryHandler`, `RemindersQueryHandler`
- `MeetingOccurrencesQueryHandler`, `SessionsQueryHandler`
- `MealsQueryHandler` / today-plan, `AthleteProfileQueryHandler`

The coach and planner templates get the day block today; free chats get it too,
but trimmed. Total cap is about 350 tokens, so a turn costs about 3 s of extra
reading at worst; this cost is measured in the plan's verification.

### B2. Write intents
These are generic verbs over a `target`, so the enum stays small for the 3B model.
They are added to `INTENT_SCHEMA` and to `ACTIONS`, with arguments whitelisted the
way they already are.
- **`edit`** with `{ target: task|reminder|meeting|session|meal|slot, match, title?, when?, durationMin?, onlineLink?, address?, priority?, notes? }`.
  Moving a meeting means `when`; a series asks whether "this one" or "all".
  - task → `UpdateTaskHandler` / defer
  - reminder → `ManageReminderHandler.update`
  - meeting → `UpdateMeetingHandler` (series) or `MoveOccurrenceHandler` (one occurrence)
  - session → update-session
  - meal → `ReplaceTodayMealHandler` / `UpdateMealHandler`
  - slot → set-slots with the slot replaced
- **`complete`** with `{ target: task|reminder|meeting|session, match }`, mapped to
  the complete handlers.
- **`cancel`** is extended to `target: task|reminder|meeting|session|slot`. The
  old shape with no target keeps working (task or reminder).
- **`delete`** with `{ target, match }`. It is a soft delete through the
  existing delete handlers, which are restorable. It never touches the status
  (CLAUDE.md rule).
- **Ids are always resolved in code.** Each target gets a
  `find<Target>Candidates(match, now)` method on the ports, built over the
  published queries, the same way `findCancellable` does today. No candidate
  means it says so; more than one means it asks which (as today,
  `intent-executor.ts:322-341`).
- **Ports:** `PlannerActionsPort`, `MeetingActionsPort`, `TrainingActionsPort`
  and `NutritionActionsPort` in `domain/chat.ports.ts` gain the new methods. They
  are bound in `chat.adapters.ts` to other contexts' **query handlers and command
  handlers**, the pattern that already exists. Reaching for another context's
  feature service stays forbidden.
- **The rule stays:** "an action never reaches the model". Every reply is
  templated from what was stored, in English and Arabic like the existing
  templates.

### B3. Confirmation for edits and deletes
- **Proposals:**
  - For `edit`, `cancel` (now also meetings and sessions), `delete`, and
    `complete` on meetings and sessions, the executor resolves the item and does
    not write.
  - It stores a **proposal** in a new `chat_proposals` collection:
    `{ _id, userId, conversationId, intent, targetId, changes, expiresAt (+15 min), status }`,
    with `userId` and `updatedAt` per the schemas rule.
  - The turn then emits a `chat.card` of kind `confirm` with a summary, rendered
    from the stored item and the changes.
- **Accepting:** the member taps **Yes** or **No**, which is a new socket event
  `chat.confirm {proposalId, accept}` (added to `contracts/ws-chat.md`).
  - The REST batch path gets the same command.
  - Typing "yes" or "no" while a proposal is open in that conversation is also
    accepted. It reuses the whole-word classifier approach of the check-in, and is
    limited to the conversation as the check-in is.
- **Applying:** a proposal is applied once. The write is claimed atomically: the
  proposal status moves `open → applied` first. It is refused if it has expired,
  and the item is re-read when applying. If the item changed since, it asks
  again. The confirmation is templated from what was stored.
- **Creates** (`set_task`, `set_reminder`, `set_meeting`, `add_meal`,
  `record_metric`, `update_profile`, `set_slots`) still apply at once, as today.

### B4. Fixes found during the scan (each gets a test and is named in the commit)
- `add_meal` is missing from `ACTIONS` (`intent.ts:217-227`), so it never runs.
- Meeting and session card times are sent as display strings
  (`chat.adapters.ts:462,653`), so the phone shows no time. Send ISO times, as
  tasks do.

### B5. Prompts and evaluation
- `ai/prompts/intent.md`: new bullets and examples for `edit`, `complete`,
  `delete` and `cancel` with targets. The examples must not be copied from the
  corpus; the spec assertion already enforces this.
- `planner.md`: the line "You cannot create or cancel anything" stays true. The
  model itself still writes nothing. Reword it so it doesn't deny a feature that
  now exists: it may say "ask me to change it".
- `backend/test/intent-fixture.mjs` corpus (`intent-cases.json`): add about 30
  cases, in English and Arabic, for the new intents and targets. Half are
  near-misses that must stay `chat`; questions like "when is my meeting?" are a
  read, not an edit.
  - The gate stays: at least 90%, zero silent time errors, p95 under 5 s.
  - If the 3B model drops below the gate, report the score rather than tune the
    prompt to the test.

### B6. Mobile chat
- `chat_page.dart` `_CardAnswer`: a confirm card with Yes/No. It sends
  `chat.confirm` through the socket client in `chat_cubit.dart`, and the card
  greys out once answered.
- Offline: the buttons are disabled with "connect to confirm", because a proposal
  lives on the server.

## Critical files
- **Backend:**
  - `contexts/meetings/domain/meeting.aggregate.ts`
  - New `contexts/meetings/features/link-preview/*`
  - `contexts/meetings/infrastructure/` preview fetcher and geocoder
  - `shared/persistence/mongo/schemas.ts` (+ `schemas.spec.ts`)
  - `contexts/conversations/domain/{intent.ts,chat.ports.ts}`
  - `application/{intent-executor.ts,prompt-assembler.ts,turn-runner.ts}`
  - `infrastructure/chat.adapters.ts`
  - `ws/chat.gateway.ts`
  - `shared/settings/settings.registry.ts`
  - `graphql/graphql.module.ts`
  - `contracts.generate.ts`
- **AI:** `ai/prompts/{intent,planner,coach,chat}.md`,
  `backend/test/intent-cases.json`
- **Mobile:** `features/meetings/presentation/meetings_page.dart`,
  `features/chat/{presentation/chat_page.dart,application/chat_cubit.dart}`,
  `pubspec.yaml`
- **Extension:** `entrypoints/sidepanel/Meetings.tsx`
- **Docs:** `specs/032-*`, `SETUP.md` (geocoding privacy and switch),
  `contracts/ws-chat.md`, `ai/README.md`

## Phases (one commit or more each)
1. **Spec:** `spec.md`, `plan.md`, `tasks.md`, and the `ws-chat.md` contract
   change.
2. **Meeting links:** A1 (scheme validation, address-link opening) on backend,
   mobile and extension.
3. **Preview:** A2 endpoint with cache and geocoder, plus GraphQL and the
   regenerated contracts.
4. **Preview clients:** A3 on mobile (card and `flutter_map`) and the extension.
5. **Chat fixes:** B4.
6. **Read view:** B1.
7. **Write intents:** B2 (`edit`, `complete`, `delete`, extended `cancel`) with
   ports and adapters.
8. **Confirmation:** B3 (proposals, `chat.confirm`, typed yes/no).
9. **Prompts and evaluation:** B5, running the fixture against live Ollama.
10. **Mobile chat:** B6 confirm card.
11. **Release:** version bump 2.5.0, phone build 8, CI, tag, release notes.
    This happens only on the Owner's say-so at the end.

## Verification
- `pnpm typecheck`, `pnpm lint` (and probe it with a cross-context import that
  must fail), `pnpm format:check`, `pnpm vitest`, and `pnpm lint:contexts`.
- **Backend specs:**
  - The link scheme is refused.
  - Coordinate extraction is tested against a table of real map URL shapes.
  - SSRF: a private IP is refused on a redirect hop.
  - Cache hit; Nominatim is not called when coordinates are in the URL, and not
    called when the setting is off.
  - Each new intent target resolves and asks when there are two matches.
  - A proposal is applied once and expires.
  - A typed "yes" in a different conversation does nothing.
  - The payload carries every field its consumer reads.
- `app.module.spec.ts` resolves the graph in both roles. Also check the new
  resolver appears in the regenerated `schema.graphql`.
- **Live:** run `backend/test/intent-fixture.mjs` against Ollama and record the
  score. Measure the turn cost of the larger `<now>` block (prompt-read seconds)
  as in 031.
- **Mobile:**
  - `flutter analyze`, `flutter test` (meeting link opening, preview card states,
    confirm card), `tool/check_ui_literals.sh`.
  - A drift schema check: no drift change is expected; verify `schemaVersion` is
    unchanged.
- **Extension:** `pnpm --filter extension test` and the e2e for the meetings
  panel.
- **End to end on the stack:**
  - Create a meeting with a `maps.app.goo.gl` address: tapping it opens Maps, and
    the preview shows the place and the map.
  - Ask the chat "move my dentist meeting to 5pm tomorrow": a confirm card
    appears, Yes changes it, and the calendar shows the new time after sync.

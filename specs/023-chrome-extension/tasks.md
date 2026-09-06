# Tasks: Chrome Extension (P9)

**Input**: `spec.md`, `plan.md`; blueprint `contracts/sync.md`, `ws-chat.md`.

**Tests**: vitest for every branch in the shared stores and the worker's session
handling; Playwright for every user flow.

**Task ids** are phase-local. The blueprint's `tasks.md` carries its own T### series
covering the same ground at one line per phase; its T901–T903 are not these T901–T903
and nothing cross-references them by number. Paths under `entrypoints/`, `lib/` and
`components/` are relative to `apps/extension/`; `packages/` paths are the monorepo's.

## Phase 1 — Shared stores

- [ ] T901 `packages/sdk`: finish `TasksStore`, `MeetingsStore`, `SyncStore` (cursor, pending ops, rejection handling, `full` sweep, attempt cap of five) so the phone's rules are implemented once; spec: a `stale` rejection overwrites the local row from the server copy and clears `pendingOp`, a `protected` rejection is never retried as stale, the delete sweep runs only when `full` is true and skips rows with a pending operation, and a row that reaches five attempts stops being sent and turns up as `blocked`
- [ ] T902 [P] `packages/sdk`: `SocketClient` reconnect policy usable from a service worker (no `window`, no timers that assume a page); sends `sync.subscribe { entities }` on connect and debounces `sync.nudge` by 2 s; spec: successive failures back off up to the ceiling and reset after one clean connection, a nudge burst inside the debounce window produces one sync, and nothing in the module touches `window` or `document`
- [ ] T903 [P] `packages/sdk`: day helpers — "today" and the seven-day meeting window resolved against a given time zone; spec: a member in `Asia/Riyadh` at 23:30 UTC gets the following day's boundaries and a member in `America/New_York` at the same instant gets the current one, with fixtures built from `Date.now()`

## Phase 2 — Storage and state

- [ ] T910 `lib/db.ts` — Dexie version 1 → 2: `tasks`, `labels`, `meetings`, `calendar_events`, `pending_ops`, `meta`; upgrade function with a documented wipe-and-refetch fallback
- [ ] T911 [P] `lib/session.ts` — tokens, the Botvy address, and the cached profile zone and language in `chrome.storage.local`, never entity data; the single `clearAll()` over Dexie and storage that sign-out uses
- [ ] T912 [P] Panel store construction on mount, hydration from Dexie, and a `chrome.runtime` message listener for nudges

## Phase 3 — Sign-in, session and privacy (US4)

- [ ] T950 Sign-in with email and password, and Google through `chrome.identity.launchWebAuthFlow`; registers the device with `installId` and kind `chrome_extension`; the token lifecycle from plan.md — refresh before a woken worker uses the session, refresh and reconnect on `auth.expiring` or a `token_expired` disconnect, single-flight so the panel and the worker cannot revoke each other's family; spec: an expired token plus a `token_expired` disconnect produces exactly one refresh and one reconnect, two callers refreshing at once make one call, and a refresh refused with `401` ends signed-out with the pending operations still in Dexie
- [ ] T953 [P] Read `profile { timezone locale displayName }` over GraphQL at sign-in and again from the panel when the stored copy is over a day old, into `chrome.storage.local`; every view and form resolves its dates through T903 with that zone; spec: with the browser fixed to one zone and the profile in another, the Today list is the profile's day and the browser's zone is never read
- [ ] T951 [P] Optional host permission requested at sign-in for the member's Botvy origin only; manifest requests `sidePanel`, `storage`, `alarms`, `contextMenus`, `identity`, `notifications` and nothing more, and does not opt into private windows
- [ ] T952 [P] Sign-out: `POST /auth/logout` with the refresh token, then `DELETE /devices/:id` for this install, then `clearAll()` from T911 — both calls best-effort with a bounded wait so an offline sign-out still clears; spec: the order survives a failing network and still clears; Playwright asserts empty Dexie and storage, and the refresh token is refused afterwards

## Phase 4 — Background worker (US1, US5)

- [ ] T920 `entrypoints/background.ts` — install/startup wiring, `chrome.alarms` every minute, refresh-then-connect when signed in, `sync.subscribe` on connect, debounced `sync.nudge` handling, sync on panel open, and `chrome.notifications` on `alert.fired` (FR-015; P2's sweep raises it); spec-by-Playwright: suspend the worker, change data on another client, reopen the panel → current
- [ ] T921 [P] Sync driver with the four-state status model from plan.md (in step, catching up, offline, blocked) surfaced to the panel, `blocked` covering a refused row and a row past five attempts; spec: a refused push shows as blocked with the server's version beside the local one, and a retry from the strip re-sends it

## Phase 5 — The panel (US1, US3)

- [ ] T930 Today view — tasks with checkboxes, priority marks, label chips, complete with undo, and an in-panel detail sheet for opening one; "today" from T903 and T953's zone
- [ ] T931 [P] Next view — meetings for the next seven days with join button, location, and preparation blocks
- [ ] T932 [P] Add form — task, reminder and meeting with the fields FR-002 lists; optimistic write to Dexie plus a pending op
- [ ] T933 [P] Status strip — state, last sync, unsent count, blocked count with a per-item retry or discard, force retry; calls itself out of step past five minutes
- [ ] T934 [P] Settings row — Botvy address, sign out (calls T952's flow)
- [ ] T935 [P] English and Arabic message catalogues for every string the panel shows, direction from T953's `locale`, `dir="rtl"` on the panel root for Arabic (blueprint FR-O03, SC-009)

## Phase 6 — Capture (US2)

- [ ] T940 Context menus: selection → task or reminder; page → save link or task; the page address written into the item's notes, and a selection over 120 characters trimmed at the last word boundary with the whole text in the notes; spec: a short selection is untouched, a long one is cut at a word and keeps everything in the notes, and a single 120-character word is cut hard rather than dropped
- [ ] T941 [P] Keyboard command opens the panel's Add form pre-filled with the selection

## Phase 7 — Release

- [ ] T960 Playwright suite: sign in, add, complete, capture, offline then reconnect, sign out — written alongside each flow, run last
- [ ] T961 [P] `.github/workflows/extension.yml` builds and zips on tag; optional Web Store upload behind a repository variable; store listing text explaining each permission (a deliverable whether or not the submission happens in this phase)
- [ ] T962 Record gate evidence; open `024-web-admin-public`

## Dependencies

T901/T902/T903 → T910/T911/T912 → T950/T953 → T951/T952 → T920 → T921 → T930–T935.
T940 needs T920's menus. Sign-in gates the panel and capture, which is why Phase 3 sits
ahead of them. T960 runs last but is written alongside each flow.

## Verification gate

1. `pnpm --filter @botvy/sdk test` — vitest green, including the conflict, sweep,
   backoff, refresh, day-boundary and trim cases.
2. `pnpm --filter @botvy/extension build && pnpm --filter @botvy/extension test:e2e` —
   every flow green.
3. Manual: complete a task in the panel → the phone shows it completed within ten
   seconds; select a sentence on a page → right-click → add as task → the task carries
   that title with the page address in its notes; add twenty items with the network off
   → reconnect → twenty items, no duplicates; leave the panel closed for an hour,
   reopen → current within a second; switch the profile's language to Arabic → the
   panel is Arabic and right-to-left within a day; sign out → Dexie and
   `chrome.storage` are empty and the browser is gone from the member's devices.
4. Load the zipped build in a clean Chrome profile and confirm the requested
   permissions match the manifest list exactly.

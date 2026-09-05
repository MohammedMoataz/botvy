# Tasks: Chrome Extension (P9)

**Input**: `spec.md`, `plan.md`; blueprint `contracts/sync.md`, `ws-chat.md`.

**Tests**: Playwright for every user flow; vitest for the shared stores.

## Phase 1 — Shared stores

- [ ] T901 `packages/sdk`: finish `TasksStore`, `MeetingsStore`, `SyncStore` (cursor, pending ops, rejection handling, `full` sweep, attempt cap) so the phone's rules are implemented once; vitest for the conflict and sweep behaviour
- [ ] T902 [P] `packages/sdk`: `SocketClient` reconnect policy usable from a service worker (no `window`, no timers that assume a page)

## Phase 2 — Storage and state

- [ ] T910 `lib/db.ts` — Dexie version 1 → 2: `tasks`, `labels`, `meetings`, `calendar_events`, `pending_ops`, `meta`; upgrade function with a documented wipe-and-refetch fallback
- [ ] T911 [P] `lib/session.ts` — tokens and settings in `chrome.storage.local`, never entity data; `clearAll()` used by sign-out
- [ ] T912 [P] Panel store construction on mount, hydration from Dexie, and a `chrome.runtime` message listener for nudges

## Phase 3 — Background worker (US5)

- [ ] T920 `entrypoints/background.ts` — install/startup wiring, `chrome.alarms` every minute, socket connect when signed in, `sync.nudge` handling, sync on panel open, `chrome.notifications` on `alert.fired`; spec-by-Playwright: suspend the worker, change data on another client, reopen the panel → current
- [ ] T921 [P] Sync driver with a status model (in step, catching up, offline, blocked) surfaced to the panel

## Phase 4 — The panel (US1, US3)

- [ ] T930 Today view — tasks with checkboxes, priority marks, label chips, complete with undo, tap-through to details; "today" computed in the member's profile time zone
- [ ] T931 [P] Next view — meetings for seven days with join button, location, and preparation blocks
- [ ] T932 [P] Add form — task, reminder and meeting with the same fields the phone offers; optimistic write to Dexie plus a pending op
- [ ] T933 [P] Status strip — state, last sync, unsent count, force retry
- [ ] T934 [P] Settings row — Botvy address, sign out (clears Dexie and storage)

## Phase 5 — Capture (US2)

- [ ] T940 Context menus: selection → task or reminder; page → save link or task; long selections trimmed to a title with the full text in notes and the page address kept
- [ ] T941 [P] Keyboard command opens the panel's Add form pre-filled with the selection
- [ ] T942 [P] "Save link" hidden when the Knowledge feature is not present in the connected Botvy (capability probe on sign-in)

## Phase 6 — Sign-in and privacy (US4)

- [ ] T950 Sign-in with email and password, and Google through `chrome.identity.launchWebAuthFlow`; silent renewal; re-prompt only on failure
- [ ] T951 [P] Optional host permission requested at sign-in for the member's Botvy origin only; manifest requests `sidePanel`, `storage`, `alarms`, `contextMenus`, `identity`, `notifications` and nothing more
- [ ] T952 [P] Sign-out clears every cached item; Playwright asserts empty Dexie and storage

## Phase 7 — Release

- [ ] T960 [P] Playwright suite: sign in, add, complete, capture, offline then reconnect, sign out
- [ ] T961 [P] `.github/workflows/extension.yml` builds and zips on tag; optional Web Store upload behind a repository variable; store listing text explaining each permission
- [ ] T962 Record gate evidence; open `024-web-admin-public`

## Dependencies

T901/T902 → T910/T911/T912 → T920 → T930–T934. T940 needs T920's menus. T950 gates
everything behind sign-in. T960 last but written alongside each flow.

## Verification gate

1. `pnpm --filter @botvy/extension build && pnpm --filter @botvy/extension test:e2e` —
   every flow green.
2. Manual: complete a task in the panel → the phone shows it completed within ten
   seconds; add twenty items with the network off → reconnect → twenty items, no
   duplicates; leave the panel closed for an hour, reopen → current within a second;
   sign out → Dexie and `chrome.storage` are empty.
3. Load the zipped build in a clean Chrome profile and confirm the requested
   permissions match the manifest list exactly.

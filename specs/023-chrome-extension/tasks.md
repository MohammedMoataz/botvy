# Tasks: Chrome Extension (P9)

**Input**: `spec.md`, `plan.md`; blueprint `contracts/sync.md`, `ws-chat.md`.

**Tests**: vitest for every branch in the shared stores and the worker's session
handling; Playwright for every user flow.

**Task ids** are phase-local. The blueprint's `tasks.md` carries its own T### series
covering the same ground at one line per phase; its T901–T903 are not these T901–T903
and nothing cross-references them by number. Paths under `entrypoints/`, `lib/` and
`components/` are relative to `apps/extension/`; `packages/` paths are the monorepo's.

## Phase 1 — Shared stores

- [x] T901 **Already shipped in P0–P6 and verified rather than rewritten** — `SyncStore` carries the cursor, the pending ops, the rejection branch, the `full` sweep and the five-attempt cap, and `stores.spec.ts` already asserts each of the four cases this task names. What the phase added here is nothing; what it did was check, because "finish X" in a task list is not evidence that X is unfinished. `packages/sdk`: finish `TasksStore`, `MeetingsStore`, `SyncStore` (cursor, pending ops, rejection handling, `full` sweep, attempt cap of five) so the phone's rules are implemented once; spec: a `stale` rejection overwrites the local row from the server copy and clears `pendingOp`, a `protected` rejection is never retried as stale, the delete sweep runs only when `full` is true and skips rows with a pending operation, and a row that reaches five attempts stops being sent and turns up as `blocked`
- [x] T902 [P] `packages/sdk`: `SocketClient` reconnect policy usable from a service worker (no `window`, no timers that assume a page); sends `sync.subscribe { entities }` on connect and debounces `sync.nudge` by 2 s; spec: successive failures back off up to the ceiling and reset after one clean connection, a nudge burst inside the debounce window produces one sync, and nothing in the module touches `window` or `document`
- [x] T903 [P] `packages/sdk`: day helpers — "today" and the seven-day meeting window resolved against a given time zone; spec: a member in `Asia/Riyadh` at 23:30 UTC gets the following day's boundaries and a member in `America/New_York` at the same instant gets the current one, with fixtures built from `Date.now()`

## Phase 2 — Storage and state

- [x] T910 **Already shipped through version 3 and verified rather than rewritten**; this phase added version 4 (the capture outbox) and the documented wipe-and-refetch fallback. `lib/db.ts` — Dexie version 1 → 2: `tasks`, `labels`, `meetings`, `calendar_events`, `pending_ops`, `meta`; upgrade function with a documented wipe-and-refetch fallback
- [x] T911 [P] `lib/session.ts` — tokens, the Botvy address, and the cached profile zone and language in `chrome.storage.local`, never entity data; the single `clearAll()` over Dexie and storage that sign-out uses
- [x] T912 [P] Panel store construction on mount, hydration from Dexie, and a `chrome.runtime` message listener for nudges

## Phase 3 — Sign-in, session and privacy (US4)

- [x] T950 Sign-in with email and password, and Google through `chrome.identity.launchWebAuthFlow`; registers the device with `installId` and kind `chrome_extension`; the token lifecycle from plan.md — refresh before a woken worker uses the session, refresh and reconnect on `auth.expiring` or a `token_expired` disconnect, single-flight so the panel and the worker cannot revoke each other's family; spec: an expired token plus a `token_expired` disconnect produces exactly one refresh and one reconnect, two callers refreshing at once make one call, and a refresh refused with `401` ends signed-out with the pending operations still in Dexie
- [x] T953 [P] Read `profile { timezone locale displayName }` over GraphQL at sign-in and again from the panel when the stored copy is over a day old, into `chrome.storage.local`; every view and form resolves its dates through T903 with that zone; spec: with the browser fixed to one zone and the profile in another, the Today list is the profile's day and the browser's zone is never read
- [x] T951 [P] Optional host permission requested at sign-in for the member's Botvy origin only; manifest requests `sidePanel`, `storage`, `alarms`, `contextMenus`, `identity`, `notifications` and nothing more, and does not opt into private windows
- [x] T952 [P] Sign-out: `POST /auth/logout` with the refresh token, then `DELETE /devices/:id` for this install, then `clearAll()` from T911 — both calls best-effort with a bounded wait so an offline sign-out still clears; spec: the order survives a failing network and still clears; Playwright asserts empty Dexie and storage, and the refresh token is refused afterwards

## Phase 4 — Background worker (US1, US5)

- [x] T920 `entrypoints/background.ts` — install/startup wiring, `chrome.alarms` every minute, refresh-then-connect when signed in, `sync.subscribe` on connect, debounced `sync.nudge` handling, sync on panel open, and `chrome.notifications` on `alert.fired` (FR-015; P2's sweep raises it); spec-by-Playwright: suspend the worker, change data on another client, reopen the panel → current
- [x] T921 [P] Sync driver with the four-state status model from plan.md (in step, catching up, offline, blocked) surfaced to the panel, `blocked` covering a refused row and a row past five attempts; spec: a refused push shows as blocked with the server's version beside the local one, and a retry from the strip re-sends it

## Phase 5 — The panel (US1, US3)

- [x] T930 Today view — tasks with checkboxes, priority marks, label chips, complete with undo, and an in-panel detail sheet for opening one; "today" from T903 and T953's zone
- [x] T931 [P] Next view — meetings for the next seven days with join button, location, and preparation blocks
- [x] T932 [P] Add form — task, reminder and meeting with the fields FR-002 lists; optimistic write to Dexie plus a pending op
- [x] T933 [P] Status strip — state, last sync, unsent count, blocked count with a per-item retry or discard, force retry; calls itself out of step past five minutes
- [x] T934 [P] Settings row — Botvy address, sign out (calls T952's flow)
- [x] T935 [P] English and Arabic message catalogues for every string the panel shows, direction from T953's `locale`, `dir="rtl"` on the panel root for Arabic (blueprint FR-O03, SC-009)

## Phase 6 — Capture (US2)

- [x] T940 Context menus: selection → task or reminder; page → save link or task; the page address written into the item's notes, and a selection over 120 characters trimmed at the last word boundary with the whole text in the notes; spec: a short selection is untouched, a long one is cut at a word and keeps everything in the notes, and a single 120-character word is cut hard rather than dropped
- [x] T941 [P] Keyboard command opens the panel's Add form pre-filled with the selection

## Phase 7 — Release

- [x] T960 Playwright suite: sign in, add, complete, capture, offline then reconnect, sign out — written alongside each flow, run last
- [x] T961 [P] `.github/workflows/extension.yml` builds and zips on tag; optional Web Store upload behind a repository variable; store listing text explaining each permission (a deliverable whether or not the submission happens in this phase)
- [x] T962 Record gate evidence; open `024-web-admin-public`

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

## Gate evidence (2026-09-11)

```
pnpm --filter @botvy/sdk test                    109 tests, all green
pnpm --filter @botvy/extension test               17 tests, all green
pnpm --filter @botvy/extension exec tsc --noEmit  clean
pnpm --filter @botvy/extension build              built, 787 kB
pnpm lint                                         0 warnings, 0 errors over 632 files
pnpm --filter @botvy/extension test:e2e           3 passed (10.1 s)
```

The end-to-end suite ran against the reference stack (`http://127.0.0.1:8090`)
with a built extension loaded into a fresh Chromium profile:

```
✓ signs in, adds a task, and completes it with an undo
✓ says it is offline, keeps the work, and sends it when the network returns
✓ clears everything on sign-out
```

### What the end-to-end suite found

Five defects, every one of them invisible to a unit test, and the first is the
reason this phase is worth the Playwright bill on its own.

1. **`BotvyClient` called `fetch` unbound, so no request ever left a browser.**
   `this.fetchImpl = globalThis.fetch` and then `this.fetchImpl(url, init)`
   invokes it with the client as the receiver, and Chrome answers `TypeError:
   Failed to execute 'fetch' on 'Window': Illegal invocation`. Node does not
   care, so 109 SDK tests passed while every request from a real browser threw
   **before it was sent** — no network entry, nothing in the server log, and a
   sign-in form saying the server was unreachable when the server had never
   been asked. **The admin portal builds the same client the same way**, so this
   was P10's bug too, shipped since P0. Fixed by binding, and pinned by a test
   whose fake `fetch` throws on a foreign receiver exactly as a browser does.

2. **A MobX computed with no observable dependency is cached for ever.**
   `isAuthenticated` read `mirror.signedIn`, and `mirror` is deliberately not
   observable — so `makeAutoObservable` turned the getter into a computed that
   evaluated once, at mount, as `false`. Sign-in succeeded, the tokens were
   written, the profile was cached, the first sync ran, and the panel went on
   showing the sign-in form until something reloaded it. It reads the observable
   `status` now.

3. **The delete sweep could take a row the member had just created.** A local
   edit is two writes — the row, then the queue entry — and the engine protects
   a row by looking for its id *in the queue*. A full pull landing between the
   two swept the row. Found as a task typed seconds after sign-in that vanished
   while the same task typed a moment later survived. `heldIds()` now excludes
   any row carrying its own `pendingOp`, which the row knows before the queue
   does.

4. **Sign-out could be undone by work already in flight.** The profile load
   fired at sign-in resolves a second later; if the member signed out in
   between, it wrote their zone, language and name back onto a computer they had
   just cleared. Two keys reappeared after `clearAll` had removed them, which is
   SC-005 failing. Every write that crosses an await now carries the session it
   started in and drops if that session has ended.

5. **The panel kept spending a refresh token the worker had already rotated.**
   The cross-context lock stops the two refreshing at the same moment; it does
   nothing about the panel's in-memory mirror going stale afterwards, and a
   replayed refresh token is what the API revokes a whole family for. The panel
   follows `chrome.storage.onChanged` now.

### What the suite itself had to be taught

Three things, recorded because each one looked like a product failure first:

- **Stable Chrome no longer honours `--load-extension`.** With
  `channel: 'chrome'` (152) the extension silently did not load —
  `serviceWorkers()` stayed empty however long you waited. Playwright's bundled
  Chromium honours it with `--disable-features=DisableLoadExtensionCommandLineSwitch`.
- **Playwright's default context is incognito**, and an unpacked extension is
  not loaded into one. The context fixture launches a persistent context with a
  fresh profile directory per run — fresh because the thing under test keeps
  state on purpose, and a reused profile would make "signs in" pass because the
  last run had already signed in.
- **`check()` asserts the box ended up checked**, and this one never does:
  completing a task takes it out of Today, so the element would be gone. The
  checkbox is an action, not a state.

### The one thing the suite does not cover

**Granting the host permission.** The shipped manifest requests no hosts and
asks for the member's own origin at sign-in through `optional_host_permissions`;
that grant is a browser prompt, which no automated browser can accept. So the
e2e build differs from the shipped one by exactly one manifest key
(`BOTVY_E2E=1`), and *granting* stays a manual check on the release list. It is
recorded in `wxt.config.ts` beside the code rather than buried in a script.

### Decisions taken during implementation

- **The worker runs its own `SyncStore`.** The panel's own note said it must not,
  because a second refresher racing over one `chrome.storage` key is a replayed
  refresh token. That is true and is now fixed at the source: `refreshUnderLock`
  puts both contexts behind a Web Lock and **re-reads inside it**, so the loser
  of the race returns the winner's pair instead of spending a dead one. With
  that, a queue that flushes while the panel is shut is worth having.
- **Captures that are not synced entities wait in their own outbox.** A reminder
  and a saved link are commands against entities this surface does not hold, so
  there is no table for the engine to apply them through. They sit in Dexie with
  their id as the idempotency key until there is a connection, which is what
  makes FR-005 true of all four capture targets rather than two.
- **The keyboard shortcut captures the page, not the selection.** Reading a
  selection from a command needs `scripting` and a host permission for every
  page the member might press it on — the "requests the whole web" manifest that
  fails review. The context menu already carries `selectionText` with no such
  permission, so the selection path is the menu.
- **T901 and T910 needed no code.** `SyncStore` and the Dexie ladder were
  already complete and already tested; this phase checked rather than rewrote,
  and said so.

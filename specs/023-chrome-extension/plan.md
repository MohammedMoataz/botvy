# Implementation Plan: Chrome Extension (P9)

**Branch**: `023-chrome-extension` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/023-chrome-extension/spec.md`; blueprint `contracts/sync.md`,
`ws-chat.md` (`sync.nudge`), research R-20, R-21, R-25, P-06.

## Summary

Finish the extension skeleton from P0 into the desk companion: a side panel showing
today's tasks and the next meetings from a Dexie cache, quick capture through the
context menu and a keyboard shortcut, the same sync round trip the phone uses with an
entity subset, a live connection kept while the service worker is alive with alarm-based
reconnection, and honest sync state in the interface. No backend work beyond what the
earlier phases shipped.

## Technical Context

**Primary Dependencies**: WXT, React 19, MobX, Bootstrap 5, Dexie,
`socket.io-client`, `@botvy/sdk`, `@botvy/contracts`, `@botvy/tokens`; Playwright
for the end-to-end check

**Storage**: Dexie `tasks`, `labels`, `meetings`, `calendar_events`, `pending_ops`,
`meta` (cursor, install id); `chrome.storage.local` for tokens and settings only
(10 MB cap, never for entity data)

**Testing**: Playwright against a built extension — sign in, add a task, complete,
capture from a selection, go offline and reconnect, sign out and inspect storage;
vitest for the store logic in `@botvy/sdk`

**Performance Goals**: panel open to current data < 1 s warm; capture < 5 s

**Constraints**: the side panel re-mounts on every close, so no state lives in React
alone; the service worker is ephemeral, so the socket is opportunistic and never the
only path; permissions kept minimal for store review

**Scale/Scope**: ~30 extension files, ~6 files in `@botvy/sdk`

## Constitution Check (v2.1.0)

| Principle | Status | How |
|---|---|---|
| I. API owns data | PASS | The extension holds a cache, never a source of truth; every write is a command |
| II. n8n | PASS | Untouched |
| III. Local-first LLM | PASS | No inference surface here |
| IV. Forward-only migrations | PASS | Dexie version 1 → 2 with an upgrade function; a wipe-and-refetch fallback is acceptable for a cache and is documented |
| V. Single public surface | PASS | The extension talks only to the member's Botvy origin, declared in `host_permissions` |
| VI. Multi-user, principals | PASS | Tokens per browser profile; sign-out clears the cache |
| VII. Test-then-verify | PASS | Playwright covers the flows that unit tests cannot |
| VIII. YAGNI | PASS | No chat, no new-tab page, no history features |
| IX. Contexts, slices, ports | PASS (client) | Stores in `@botvy/sdk` are the shared layer; the panel has no business logic of its own |
| X. Commands / queries / streams | PASS | Writes are REST commands, reads come from the cache filled by sync, the socket only nudges |
| XI. Times belong to the user | PASS | "Today" is computed from the member's profile time zone, not the browser's |
| XII. Configuration | PASS | The Botvy address is a setting; nothing else is hard-coded |

## Design

### Surfaces

- **Side panel** (`entrypoints/sidepanel/`) — the whole product surface: Today
  (tasks with checkboxes, priority marks, label chips, undo), Next (meetings for seven
  days with a join button and location), Add (task, reminder, meeting), a sync status
  strip, and a settings row (address, sign out).
- **Popup** — only "Open panel" and sign-in, because a popup cannot stay open beside
  the work.
- **Background service worker** (`entrypoints/background.ts`) — context menus,
  keyboard command, the socket, the alarm, and the sync driver.

### State, given the panel re-mounts

MobX stores from `@botvy/sdk` are constructed in the panel on every mount and hydrate
from Dexie synchronously enough to paint in under a second; the authoritative state is
Dexie plus `chrome.storage.local`. Nothing is kept only in React. The panel triggers a
sync on mount (FR-006) and subscribes to `chrome.runtime` messages from the background
worker so a nudge that arrives while it is open refreshes it.

### Liveness without a permanent worker

```text
background:
  on install/startup     → create context menus, register the alarm (every 1 min)
  on alarm               → if signed in and the socket is closed → connect; if the last sync is stale → sync
  on socket sync.nudge   → sync, then message the panel if it is open
  on panel opened        → sync immediately
  on capture             → write a pending op to Dexie, sync, notify with chrome.notifications
```

The socket extends the worker's life while traffic flows, but nothing depends on it:
every path also works from the alarm and from opening the panel (R-21). Failures are
silent to the member except through the status strip.

### Sync

The same `POST /api/v1/sync` the phone uses, with
`entities: ['tasks','labels','meetings','calendar_events']` and
`installId` registered as a `chrome_extension` device. The conflict rule, the
full-snapshot rule and the rejection handling are the blueprint's; the client code is
the shared `SyncStore` so the phone's hard-won rules are not reimplemented in
JavaScript. Pending operations live in Dexie with the same `pendingOp` and
`pushAttempts` fields, and the status strip surfaces attempts that are stuck.

### Capture

`contextMenus` entries for a selection ("Add as task", "Add as reminder") and for the
page ("Save link", "Add page as task"), plus a `commands` shortcut opening the panel's
Add form pre-filled with the selection. A long selection becomes a trimmed title with
the full text in the notes and the page address kept (FR-003). Saving a link
dispatches the Knowledge command from P7 when that phase is present; the menu item is
hidden otherwise rather than failing.

### Privacy and permissions

Requested: `sidePanel`, `storage`, `alarms`, `contextMenus`, `identity`,
`notifications`, and `host_permissions` for the member's configured Botvy origin only
(set at sign-in through optional host permissions, so the store listing does not
request the whole web). Sign-out clears Dexie and `chrome.storage.local` for that
profile (FR-009, SC-005).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Three redundant liveness paths (socket, alarm, panel-open) | MV3 workers are ephemeral by design; any single path silently stops | Relying on the socket alone means a panel that is quietly hours out of date |
| Optional host permission granted at sign-in | The Botvy address differs per member and a broad host permission fails review | Requesting all-urls up front (rejected by review and unnecessary) |

## Verification gate

```powershell
pnpm --filter @botvy/extension build
pnpm --filter @botvy/extension test:e2e   # Playwright: sign in, add, complete, capture, offline, sign out
# manual: complete a task in the panel → the phone shows it within 10 s; add 20 items offline → reconnect →
#         20 items, no duplicates; sign out → inspect Dexie and chrome.storage: empty
```

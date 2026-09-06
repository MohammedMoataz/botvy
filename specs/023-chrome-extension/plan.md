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
vitest for everything with a branch — the store logic in `@botvy/sdk`, the socket's
reconnect and backoff, the refresh-then-reconnect path, the day boundary in the
member's time zone, and the title trim

**Performance Goals**: panel open to current data < 1 s warm; capture < 5 s

**Constraints**: the side panel re-mounts on every close, so no state lives in React
alone; the service worker is ephemeral, so the socket is opportunistic and never the
only path; permissions kept minimal for store review

**Scale/Scope**: ~30 extension files, ~6 files in `@botvy/sdk`

## Constitution Check (v2.1.1)

| Principle | Status | How |
|---|---|---|
| I. API owns data | PASS | The extension holds a cache, never a source of truth; every write is a command |
| II. n8n | PASS | Untouched |
| III. Local-first LLM | PASS | No inference surface here |
| IV. Forward-only migrations | PASS | Dexie version 1 → 2 with an upgrade function; a wipe-and-refetch fallback is acceptable for a cache and is documented |
| V. Single public surface | PASS | The extension talks only to the member's Botvy origin, declared in `host_permissions` |
| VI. Multi-user, principals | PASS | Tokens per browser profile; the access token is refreshed before every use of a woken worker and on `token_expired`; sign-out revokes the refresh token server-side, removes the device and clears the cache |
| VII. Test-then-verify | PASS | vitest on every branch (reconnect and backoff, refresh, day boundary, title trim, conflict and sweep); Playwright covers the flows unit tests cannot |
| VIII. YAGNI | PASS | No chat, no new-tab page, no history features |
| IX. Contexts, slices, ports | PASS (client) | Stores in `@botvy/sdk` are the shared layer; the panel has no business logic of its own |
| X. Commands / queries / streams | PASS | Writes are REST commands, reads come from the cache filled by sync, the socket only nudges |
| XI. Times belong to the user | PASS | "Today" is computed from the member's profile time zone, read from the query channel at sign-in and refreshed daily, never from the browser's |
| XII. Configuration | PASS | The Botvy address is a per-browser setting; the operator's knobs this phase reads (`reminders.tombstoneDays`) are already registered in P0; the rest are constants, listed below |

## Design

### Surfaces

- **Side panel** (`apps/extension/entrypoints/sidepanel/`) — the whole product
  surface: Today (tasks with checkboxes, priority marks, label chips, undo), Next
  (meetings for seven days with a join button and location), Add (task, reminder,
  meeting), a sync status strip, and a settings row (address, sign out). Opening an
  item expands a detail sheet inside the panel: there is no web app to deep-link into
  until P10, and sending the member out of the browser to their phone would defeat the
  point of the surface.
- **Popup** — only "Open panel" and sign-in, because a popup cannot stay open beside
  the work.
- **Background service worker** (`apps/extension/entrypoints/background.ts`) — context
  menus, keyboard command, the socket, the alarm, and the sync driver.

Every path under `entrypoints/`, `lib/` and `components/` in this plan and in
`tasks.md` is relative to `apps/extension/`; paths under `packages/` are the monorepo's
own.

### The member's own day, and their language

The sync subset the blueprint fixes for the extension is
`tasks`, `labels`, `meetings`, `calendar_events` — the profile is not in it, and the
extension must not widen a contract to get one field. So the two values it needs come
over the query channel: on sign-in the worker reads `profile { timezone locale
displayName }` and writes it to `chrome.storage.local`, and the panel refreshes it on
mount when the stored copy is more than a day old (FR-013). "Today", the seven-day
meeting window and every displayed time are computed from that zone through the shared
date helpers in `@botvy/sdk`; the browser's own zone is never consulted. A vitest fixes
the boundary case — a member in `Asia/Riyadh` at 23:30 UTC sees tomorrow's tasks, not
today's — with the fixture written relative to `Date.now()`.

`locale` drives the panel's strings and its direction: English and Arabic, `dir="rtl"`
on the panel root when the profile says Arabic, per blueprint FR-O03 and SC-009, which
admit no member-facing surface that ships English only. The strings live in one
message catalogue per language; the panel has few enough of them that no framework is
warranted.

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
  on alarm               → if signed in: ensure a fresh access token, then
                           if the socket is closed → connect and `sync.subscribe { entities }`;
                           if the last sync is older than 5 min → sync
  on socket sync.nudge   → debounce 2 s, sync, then message the panel if it is open
  on socket alert.fired  → show it with chrome.notifications (FR-015)
  on socket auth.expiring / disconnect 'token_expired'
                         → refresh, reconnect with the new token
  on panel opened        → sync immediately
  on capture             → write a pending op to Dexie, sync
```

The socket extends the worker's life while traffic flows, but nothing depends on it:
every path also works from the alarm and from opening the panel (R-21). Failures are
silent to the member except through the status strip.

### The token lifecycle

The worker is asleep most of the day and the access token lives fifteen minutes, so
the token in `chrome.storage.local` is stale far more often than not. Three rules,
and one branch each:

- **Waking on the alarm refreshes before it syncs.** The worker treats a token whose
  expiry is inside the next minute as already gone and calls `POST /auth/refresh`
  first; it never discovers the expiry as a 401 halfway through a push.
- **An expiry notice on the socket is a reconnect, not a death.** `auth.expiring`
  (60 s of warning) and a disconnect with reason `token_expired` both refresh and
  reconnect with the new token; the socket is never left dead waiting for the alarm,
  and a panel open at the time keeps its live updates.
- **A failed refresh is the only thing that asks the member for anything.** Refresh
  tokens rotate and reuse revokes the family, so refreshes are single-flight: one
  in-flight promise shared by every caller, because two concurrent refreshes from the
  panel and the worker would revoke each other. A refresh that comes back `401` clears
  the tokens, leaves Dexie alone — the member's unsent work is theirs — and puts the
  panel into the signed-out state with a prompt (FR-008).

A vitest drives this directly: an expired token plus a `token_expired` disconnect
must produce exactly one refresh call and one reconnect, and a `401` from refresh must
end signed-out with the pending operations still in Dexie.

### Sync

The same `POST /api/v1/sync` the phone uses, with
`entities: ['tasks','labels','meetings','calendar_events']` and
`installId` registered as a `chrome_extension` device. The conflict rule, the
full-snapshot rule and the rejection handling are the blueprint's; the client code is
the shared `SyncStore` so the phone's hard-won rules are not reimplemented in
JavaScript. Pending operations live in Dexie with the same `pendingOp` and
`pushAttempts` fields, and the status strip surfaces attempts that are stuck.

The status model has four values and each has a rule behind it: **in step** (the last
exchange succeeded and is under five minutes old), **catching up** (a sync is in
flight, or something is queued and being retried), **offline** (the last attempt could
not reach the member's Botvy, or the browser reports no network), and **blocked** —
the contract's stop condition, a row Botvy refused or one that has burned its five
attempts. Blocked is a member-visible state, not an internal one: the strip counts
them, opening one shows what Botvy kept beside what was typed here, and the member
retries or discards (FR-007, US5 scenarios 3 and 4). Nothing is ever discarded for
them.

### Capture

`contextMenus` entries for a selection ("Add as task", "Add as reminder") and for the
page ("Save link", "Add page as task"), plus a `commands` shortcut opening the panel's
Add form pre-filled with the selection. A selection longer than 120 characters is
trimmed at the last word boundary before that mark, the whole selection goes into the
notes, and the page address is written into the notes too — the blueprint's own gate
wording, and the only field every one of the four targets already has (FR-003). A
vitest covers the trim: under the limit untouched, over it cut at a word, and a single
120-character word cut hard.

"Save link" dispatches the Knowledge command from P7 unconditionally. There is no
capability probe: Knowledge ships in P7, three phases before this one, into the same
single deployment the member runs, so there is nothing to discover at runtime and a
probe would be an abstraction over one possibility (VIII).

### Privacy and permissions

Requested: `sidePanel`, `storage`, `alarms`, `contextMenus`, `identity`,
`notifications`, and `host_permissions` for the member's configured Botvy origin only
(set at sign-in through optional host permissions, so the store listing does not
request the whole web).

Sign-out is three steps in one order, and the order matters: `POST /auth/logout` with
the refresh token, then `DELETE /devices/:id` for this browser's install id, then
`clearAll()` over Dexie and `chrome.storage.local`. Clearing first would throw away the
credentials needed to do the other two and leave a live refresh token and a phantom
device behind — which is exactly the state the phase was leaving before (VI). Both
server calls are best-effort with a bounded wait: a member signing out on a plane still
gets their cache cleared, and the refresh token dies of its own rotation.
`clearAll()` lives in `lib/session.ts` and is the one implementation; the settings row
calls it, the sign-out flow tests it (FR-009, SC-005).

The manifest does not opt into private windows. If the member enables it themselves,
capture behaves identically — the pending operation goes to the same Dexie in the same
profile and nothing about the page is kept beyond what the member captured — so there
is no separate path to build or test here.

### Fixed values, and why each is fixed

| Value | Kind | Why |
|---|---|---|
| Alarm period, 1 minute | Constant | The browser floors alarms at a minute anyway; there is nothing to retune |
| Push attempt cap, 5 | Constant | The blueprint's sync contract states it for every client; the phone and the panel must agree or one of them retries forever |
| Stale threshold, 5 minutes | Constant | It is what the status strip means by "in step", not an operational tuning knob |
| Title trim, 120 characters | Constant | A panel line, not a policy |
| Nudge debounce, 2 s | Constant | Stated in the WebSocket contract |
| Deleted-item horizon | Operator key | Already registered in P0 as `settings.reminders.tombstoneDays`; the client only observes it through the `full` flag and never sends it |
| The Botvy address | Per-browser setting | Differs per member and per install; kept in `chrome.storage.local` |

No new `settings.extension.*` keys: an operator has no way to reach a browser that has
already been installed, so a key they could change would not take effect where it
matters.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Three redundant liveness paths (socket, alarm, panel-open) | MV3 workers are ephemeral by design; any single path silently stops | Relying on the socket alone means a panel that is quietly hours out of date |
| Optional host permission granted at sign-in | The Botvy address differs per member and a broad host permission fails review | Requesting all-urls up front (rejected by review and unnecessary) |

## Decisions taken in this plan

Four questions the analysis raised but did not settle, decided here from the
constitution and the blueprint: the detail view is an in-panel sheet because no web
surface exists to link to before P10; the capability probe is dropped because Knowledge
lands in P7 of the same deployment (VIII); the panel ships bilingual rather than
deferring Arabic, because blueprint FR-O03 and SC-009 admit no member-facing surface
that is English only; and private windows stay un-opted-in, since the behaviour there
would be identical and building for it would be building for nothing.

## Verification gate

```powershell
pnpm --filter @botvy/sdk test              # vitest: conflict, sweep, reconnect, refresh, day boundary, trim
pnpm --filter @botvy/extension build
pnpm --filter @botvy/extension test:e2e   # Playwright: sign in, add, complete, capture, offline, sign out
# manual: complete a task in the panel → the phone shows it within 10 s; select a sentence → right-click →
#         add as task → the task carries that title with the page address in its notes; add 20 items offline →
#         reconnect → 20 items, no duplicates; sign out → inspect Dexie and chrome.storage: empty, and the
#         browser is gone from the member's devices
```

# Contract: WebSocket (Socket.IO) — chat and real-time nudges

Path `/ws` (Socket.IO 4, default namespace `/`). One connection per client
session; the same socket carries chat streaming and server-initiated nudges.

## Handshake

```js
io(BASE, { path: '/ws', auth: { token: '<accessToken>', installId: '<uuid>' }, transports: ['websocket'] })
```

- `WsAuthGuard` validates the JWT during the handshake (same Passport strategy as
  REST/GraphQL). Failure → `connect_error` with `{ code: 'unauthorized' }` and the
  socket is closed; the client refreshes the access token over REST and reconnects.
- On success the socket joins room `user:<userId>` and, when `installId` is known,
  stamps `devices.lastSeenAt` (via Identity `TouchDeviceCommand`).
- Access tokens expire (15 min); the server emits `auth.expiring` 60 s before and
  disconnects with reason `token_expired` after; clients reconnect with a fresh token.
- Service principals are refused on `/ws`.

## Client → server

| Event | Payload | Ack |
|---|---|---|
| `chat.send` | `{ requestId: uuid, conversationId: uuid, clientId: uuid, text: string, composedAt: ISO }` | `{ ok: true, seq }` (user message stored) or `{ ok: false, error }` |
| `chat.cancel` | `{ requestId }` | `{ ok }` — aborts the model stream; partial answer is persisted with `intent: { cancelled: true }` |
| `sync.subscribe` | `{ entities: string[] }` | `{ ok }` — which entity names to nudge for (default: all) |
| `presence.ping` | `{}` | `{ serverTime }` — optional keepalive; extension uses it to extend its service-worker life |

Rate limit: `chat.send` ≤ `settings.chat.ratePerMin` per user; excess → `chat.error{ code: 'rate_limited' }`.

## Server → client (chat turn, in order)

| Event | Payload | Notes |
|---|---|---|
| `chat.accepted` | `{ requestId, conversationId, userSeq }` | user message persisted with its `seq` |
| `chat.intent` | `{ requestId, intent: 'chat'\|'set_task'\|'set_reminder'\|'set_meeting'\|'list'\|'cancel'\|'record_metric'\|'checkin'\|'web_search', args }` | emitted once the grammar-constrained extraction returns; `chat` = plain conversation |
| `chat.moved` | `{ requestId, fromConversationId, toConversationId, title }` | a turn started in `coach`/`planner` that is off-topic is moved to a new `free` conversation **before** the reply streams |
| `chat.token` | `{ requestId, text }` | one token or chunk; leading spaces preserved |
| `chat.heartbeat` | `{ requestId }` | every 15 s while the model is silent |
| `chat.done` | `{ requestId, assistantSeq, usage: { model, promptTokens, completionTokens }, actions: [{ type, id }] }` | `actions` lists commands executed in code (task/reminder/meeting ids) |
| `chat.error` | `{ requestId, code: 'model_unavailable'\|'rate_limited'\|'quota'\|'protected'\|'internal', message }` | user message is kept; no assistant message stored except for `model_unavailable` (a system note) |

Templated confirmations (intents executed in code) still arrive as `chat.token` +
`chat.done` so clients render one path.

## Server → client (unsolicited)

| Event | Payload | Trigger |
|---|---|---|
| `chat.message` | `{ conversationId, seq, role: 'assistant', content, kind: 'evening_prompt'\|'morning_briefing'\|'checkin_question'\|'suggestion' }` | Daily Rhythm / Knowledge wrote into the coach chat |
| `sync.nudge` | `{ entities: string[], reason: 'remote_edit'\|'server_job' }` | another device of the same user pushed changes, or a server job changed the user's data (plan, alert, suggestion). Clients debounce (2 s) and run a sync |
| `alert.fired` | `{ alertId, source, title, body, deepLink }` | the sweep sent a push for this user; connected web/extension clients show it locally |
| `auth.expiring` | `{ inSeconds }` | see handshake |

## Rooms

`user:<userId>` — all of a user's sockets. Admin sockets may join
`ops` (server pushes `ops.heartbeat` updates for the admin overview).

## Offline path

Messages typed offline are replayed with `POST /api/v1/conversations/batch`
(≤ 20 per call, grouped by conversation, one reply per conversation, interpreted
as of `composedAt`). The reply arrives in the REST response; connected sockets of
the same user also receive `sync.nudge{ entities: ['messages'] }`.

## Error codes (both directions)

`unauthorized`, `token_expired`, `forbidden`, `rate_limited`, `quota`,
`protected` (coach/planner conversation misuse), `model_unavailable`, `internal`.

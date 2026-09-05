# Contract: offline sync protocol v2

`POST /api/v1/sync` — one round trip pushes the client's outbox and pulls
everything that changed since its cursor. Used by the phone (all entities) and
the extension (tasks, labels, meetings, calendar events).

## Request

```jsonc
{
  "installId": "uuid",
  "since": "2026-09-05T20:14:03.123Z" | null,        // the server's `now` from the previous response, echoed verbatim
  "lastSeq": 1842 | null,                              // last message seq held
  "entities": ["tasks","labels","reminders","meetings","calendar_events","sessions","programs",
               "workouts","meals","links","conversations","messages","daily_plans","checkins",
               "profile","preferences","athlete_profile"],   // subset allowed
  "push": {
    "tasks":        [ { "op": "create"|"update"|"delete"|"restore"|"purge", "id": "uuidv7", "baseUpdatedAt": ISO|null, "updatedAt": ISO, "data": {…} } ],
    "labels":       [ … ], "reminders": [ … ], "meetings": [ … ], "calendar_events": [ … ],
    "sessions":     [ … ], "programs": [ … ], "workouts": [ … ], "meals": [ … ],
    "links":        [ { "op": "create"|"delete", … } ],
    "conversations":[ { "op": "upsert"|"delete"|"clear", … } ],
    "daily_plans":  [ { "op": "confirm"|"skip", "date": "YYYY-MM-DD", "taskIds": [] } ],
    "checkins":     [ { "op": "record", "date": "YYYY-MM-DD", "mood": 70, "adhered": true, "note": null } ],
    "profile":      { "patch": { … allowlisted fields … } },
    "preferences":  { "patch": { … } },
    "athlete_profile": { "patch": { … } }
  }
}
```

## Processing order (server)

1. Authenticate (user JWT). Resolve `principal.userId`.
2. **Apply pushes** entity by entity, in the order listed above (labels before
   tasks, programs before sessions, conversations before messages) — parents
   before children so a snapshot can never name a missing parent.
3. Compute `now = serverNow`, `cursor = now − 5 s` (the lag makes a transaction
   that committed just after the pull's read arrive twice rather than never; every
   apply on the client is an upsert by id, so a duplicate costs nothing).
4. Decide `full`: `since == null` **or** `since < now − purgeHorizon`
   (`settings.reminders.tombstoneDays`) → `full = true`, pull everything (tombstones
   included); otherwise pull `updatedAt > since` per entity.
5. Pull messages `seq > lastSeq`, paged 200, `moreMessages` flag; conversations
   are queried **after** messages so a message never names a thread the response
   does not carry.
6. Stamp `devices.lastSeenAt = now` (Identity command) — this is what lets the
   sweep skip devices that already hold their local alarms.
7. Emit `sync.nudge` to the user's **other** sockets when any push was accepted.

## Conflict rule (per pushed row, every entity)

```text
if op == purge and server row is not a tombstone      → reject 'not_deleted'
if server row missing and op == create                → accept (insert)
if server row missing and op != create                → reject 'gone'
if server row is protected (coach/planner delete)     → reject 'protected'   (never 'stale' — a stale verdict makes the phone retry forever)
if baseUpdatedAt == server.updatedAt                  → accept (no clock consulted — the ordinary case)
if min(updatedAt, now) >= server.updatedAt            → accept (newest wins; clamp stops a handset set to 2099)
else                                                  → reject 'stale' with the server row
```

Profile / preferences / athlete_profile patches skip the conflict check: the
fields a client may write and the fields server jobs write are disjoint sets.

Deletes set `deletedAt` only; `status` is never rewritten by a delete.

## Response

```jsonc
{
  "now": "2026-09-05T20:20:11.004Z",                  // echo back as `since` next time
  "full": false,
  "pull": {
    "tasks": [ …full rows incl. tombstones… ], "labels": [ … ], "reminders": [ … ], "meetings": [ … ],
    "calendar_events": [ … ], "sessions": [ … ], "programs": [ … ], "workouts": [ … ], "meals": [ … ],
    "links": [ … ], "conversations": [ … ], "daily_plans": [ … ], "checkins": [ … ],
    "profile": { … } | null, "preferences": { … } | null, "athlete_profile": { … } | null,
    "messages": [ { "seq": 1843, "conversationId": "…", "role": "assistant", "content": "…", "clientId": null, "composedAt": null, "createdAt": "…" } ],
    "moreMessages": false
  },
  "accepted": { "tasks": ["id", …], "reminders": [ … ], … },                       // exactly which pushes were applied
  "rejections": [ { "entity": "tasks", "id": "uuid", "reason": "stale"|"gone"|"protected"|"not_deleted"|"invalid", "server": { …row… } | null } ],
  "pendingAlerts": [ { "source": { "kind", "id", "occurrenceAt" }, "label", "notifyAt", "title", "body", "deepLink" } ]   // next 7 days, for local scheduling
}
```

## Client obligations

- Apply `rejections` **first**, branching on `entity` before touching any table;
  `server != null` → overwrite local row (and clear `pendingOp`); `server == null` →
  delete local row. Bump `pushAttempts`; stop re-sending after 5 attempts but never
  discard the user's edit silently (badge + tap-to-retry).
- Clear `pendingOp` only for ids listed in `accepted`.
- Apply pulls as upserts by id; set `baseUpdatedAt = row.updatedAt` from the
  server row only — never from a local edit.
- Run the **delete sweep** (remove local rows absent from the pull) **only when
  `full == true`**, and skip rows with a non-null `pendingOp`.
- Page messages while `moreMessages`, passing `since = now` on later pages so they
  stay deltas (cap 50 pages).
- After every sync, reschedule local alarms from `pendingAlerts` + local rows
  (`rescheduleAll()`), online or not.
- Store `now` as the cursor only after the whole apply committed in one local
  transaction.

## Extension subset

The extension sends `entities: ["tasks","labels","meetings","calendar_events"]`
and `installId` of kind `chrome_extension`; everything else is identical.

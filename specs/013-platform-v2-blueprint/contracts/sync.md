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
               "rhythm_state","profile","preferences","athlete_profile"],   // subset allowed
  "push": {
    "tasks":        [ { "op": "create"|"update"|"delete"|"restore"|"purge", "id": "uuidv7", "baseUpdatedAt": ISO|null, "updatedAt": ISO, "data": {…} } ],
    "labels":       [ … ], "reminders": [ … ], "meetings": [ … ], "calendar_events": [ … ],
    "sessions":     [ … ], "programs": [ … ], "workouts": [ … ], "meals": [ … ],
    "links":        [ { "op": "create"|"delete", … } ],
    "conversations":[ { "op": "upsert"|"delete"|"clear", … } ],
    // daily_plans, checkins and rhythm_state are PULL-ONLY -- see below
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
    "rhythm_state": { … } | null,                     // singleton, patch-shaped like profile
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

## The rhythm's three entities are pull-only

Added in P3, and none of them accepts a push — which is a correction to what
this file first said, so the reasoning is here rather than in a commit message.

| Entity | Shape | Pull | Push |
|---|---|---|---|
| `daily_plans` | row | changed since the cursor | **refused** (`invalid`) |
| `checkins` | row | changed since the cursor | **refused** (`invalid`) |
| `rhythm_state` | singleton patch, like `profile` | the one row, or null | **refused** (`invalid`) |

The two writes go over REST instead: `POST /rhythm/plans/:date/confirm`,
`POST /rhythm/plans/:date/skip` and `POST /rhythm/checkins`.

**Why not a push.** This file originally gave `daily_plans` and `checkins` a
push of named commands — `{ op: 'confirm' }`, `{ op: 'record' }` — which would
have needed a third protocol beside the row protocol and the patch protocol,
because those ops are not the five the conflict rule branches on. The thing a
third protocol buys is atomicity across entities in one round trip, and neither
of these needs it: confirming a plan adds and removes ids *within the plan* and
touches no task, and a check-in is one row of its own. So the push would have
been a protocol carrying no weight, and `plan.md` had already named REST "the
permanent path for the notification action" for the check-in — which is the same
call, made once.

They are still in `entities` and still in `pull`, because the phone holds a copy
and reads it offline. That is the whole point of them being here.

**A push to any of the three is refused with `invalid`, never `stale`.**
Retrying unchanged will fail again, and a stale verdict tells the phone to
overwrite its copy and retry — against a rule that is never going to accept it,
it would retry for ever. `rhythm_state` matters most: the three claim dates are
the server's once-a-day guarantee, and a phone that could write them could
suppress or re-fire its own member's evening.

**Neither `daily_plans` nor `checkins` carries a tombstone.** Neither aggregate
has a `deletedAt` and neither is ever deleted individually — they go only when
the account does. So the delete-sweep on a full snapshot must not read a missing
plan as a deletion, and the wire carries no `deletedAt` key for the phone to
branch on.

**Their `_id` is composite and server-shaped** (`"<userId>:<YYYY-MM-DD>"`), which
is the one place the phone must *not* mint a UUIDv7. The date is the identity,
so two devices that confirm the same day converge on one row by construction.

**`mood` and `adhered` are sent explicitly as `null`, never omitted.** A mood of
0 is a member having a terrible day and an absent mood is an unanswered half of
the question; an omitted key reads as "unchanged" to the phone's upsert, so a
member who cleared a mood would keep the old one for ever.

**Apply order** is 40 (`daily_plans`), 41 (`checkins`), 42 (`rhythm_state`) —
after tasks at 20. It has no consequence while all three are pull-only, and it
is stated so the ordering is a decision on the record rather than whatever the
module's provider list happened to be.

The extension sends `entities: ["tasks","labels","meetings","calendar_events"]`
and `installId` of kind `chrome_extension`; everything else is identical.

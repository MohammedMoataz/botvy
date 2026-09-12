# Parity — everything v1 did, and where it is now

Every capability the old system had, named against its equivalent in v2. The
point of the exercise is the **gaps**: a rewrite that quietly drops something
its users relied on is a rewrite they resent, and the only way to find out is to
walk the old requirements one at a time rather than from memory.

Sourced from `specs/001`–`012`, which are v1's own specifications and are the
closest thing to a complete list of what it promised.

**Status key** — ✅ in v2 and verified · 🔁 in v2 in a different shape (with the
reason) · ⛔ deliberately dropped (with the reason) · ⏳ owed.

---

## 001 · Foundation

| v1 | v2 | |
|---|---|---|
| compose stack at the repository root | `infra/docker-compose.yml`, project `botvy-v2` | 🔁 its own project name, so the two stacks stop sharing volumes |
| two PostgreSQL databases (`botvy`, `n8n`) | same, plus MongoDB for every non-Identity context | 🔁 |
| Postgres and n8n bound to loopback | Postgres publishes **nothing**; n8n still loopback | 🔁 stricter |
| Ollama native on the host for GPU | unchanged | ✅ |
| `qwen3:4b` pulled and answering | `llm.chatModel` in the registry; an instruct model for extraction | 🔁 `qwen3` is a thinking model and is not a drop-in for schema-constrained extraction |
| Cloudflare named tunnel | `cloudflared` profile, plus a quick-tunnel profile | ✅ |
| `.env.example` documenting every variable | `infra/.env.example`, and compose refuses to start without the required ones | ✅ |
| LAN-only compose profile | the tunnel is a profile, so leaving it off *is* LAN-only | 🔁 |

## 002 · Gateway core

| v1 | v2 | |
|---|---|---|
| register with email + password | `POST /api/v1/auth/register` | ✅ |
| short access token + rotating refresh | same, with reuse detection revoking the family | ✅ stronger |
| `user` and `admin` roles | same, plus a third principal kind for machines | ✅ |
| `GET /health` unauthenticated | same, and it now reports both stores, the model, push, every job, and the default password | ✅ |
| `POST /chat` | the WebSocket `chat.send`, streaming, cancellable | 🔁 a turn can now be stopped mid-answer, which `POST /chat` could not express |
| `GET /chat/history` | GraphQL `messages(conversationId, afterSeq)` | 🔁 |
| **rate limits per user/IP** | `limits.*` registry keys on REST, GraphQL, the socket and `/internal/*` | ✅ — and see the note below |
| LLM only through the local Ollama | unchanged | ✅ |
| published OpenAPI schema | `packages/contracts/openapi.json`, generated from the running app | ✅ |
| all database access through Prisma | Prisma for Identity, Mongoose for the rest, both behind repository ports | 🔁 |

> **The rate limits were the one real regression, and it lasted ten phases.** v1
> had them from its second feature; v2 had none at all until P11. Anything built
> on top of a rewrite inherits the rewrite's omissions, and this one was invisible
> because nothing failed — which is exactly why the parity walk is done against
> the old requirements rather than against a memory of them.

## 003 · Reminders and push

| v1 | v2 | |
|---|---|---|
| reminders from a chat sentence | the intent executor creates reminders, tasks, meetings and profile facts | ✅ wider |
| reminders stored per user with status | the Reminders context | ✅ |
| authenticated CRUD | REST commands + GraphQL reads | ✅ |
| `POST /devices` | `POST /api/v1/devices` | ✅ |
| `/internal/reminders/sweep` | `/internal/notifications/sweep`, claim-before-send | ✅ |
| `/internal/alerts` | same | ✅ |
| push through FCM | same, with the credential file mounted from `secrets/` | ✅ |
| two n8n workflow JSONs | `workflows/`, imported idempotently by `bootstrap.mjs` | ✅ |
| invalid FCM tokens pruned | same | ✅ |

## 004 · Workflows and the admin portal

| v1 | v2 | |
|---|---|---|
| `GET /workflows`, admin only | `GET /api/v1/admin/workflows` | ✅ |
| activate / deactivate / run now | same three, each audited | ✅ |
| next run computed from the schedule | **not shown** | ⛔ n8n's own API reports the schedule but not a reliable next-run for every trigger type, and a next-run that is sometimes wrong is worse than none. Last run *is* shown |
| admin endpoints require the admin role | same, plus `UsersOnly` so a machine caller is refused too | ✅ stronger |
| admin SPA served at `/admin` | the portal is the Next.js app at `/` behind the edge | 🔁 |
| n8n unreachable surfaces as an explicit error | 503 "not configured" and 502 "not answering", told apart on screen | ✅ stronger |

## 005 · Coaching

| v1 | v2 | |
|---|---|---|
| per-user coaching profile | the Profile context: body metrics, food likes and dislikes, allergies, symptoms | ✅ |
| profile updated from conversation | the `update_profile` intent | ✅ |
| profile read and update endpoints | REST + GraphQL | ✅ |
| one check-in per user per date | `checkins`, id `"<userId>:<date>"` | ✅ |
| a pending check-in expires | `awaitingCheckin` with its window | ✅ |
| streak and completion ratio | derived from the rows, never folded — a corrected answer rebuilds correctly | ✅ stronger |
| one workout record per user per date | the Training context's session logs | 🔁 richer: programs, weeks, sessions, sets |
| a daily program honouring the schedule | the training materialiser | ✅ |
| **a program must not violate a declared allergy** | the allergen gate, on meals and on anything the coach says | ✅ and wider |
| internal endpoints for the nightly cycle | `/internal/rhythm/tick` | ✅ |
| the n8n workflow driving it | `workflows/` | ✅ |
| every coaching time in the user's zone | constitution XI, enforced through `shared/time` | ✅ |

## 006 · Local-first and offline

| v1 | v2 | |
|---|---|---|
| device-side alarms from a local database | drift on the phone, same rule | ✅ |
| server sweep as fallback, skipping synced devices | same, `devices.lastSeenAt >= alert.plannedAt` | ✅ |
| an unreachable device leaves the alert unsent | same | ✅ |
| reminders, chat and outbox persist on the device | same, plus tasks, meetings, sessions, links and meals | ✅ wider |
| client-generated ids so a retry is a no-op | UUIDv7, minted by the client | ✅ |
| queued messages delivered in one batch | `POST /chat/batch` | ✅ |
| every user-facing time in the user's zone | constitution XI | ✅ |
| the app reports the handset's zone | same | ✅ |
| reminder update, status, delete | same | ✅ |
| finishing a reminder deletes its pending alerts | same | ✅ |
| operational values in `settings` | the registry, now with a control per key rendered in the portal | ✅ stronger |
| the app takes defaults from the gateway | `user_preferences` seeded from `settings.defaults.*` | ✅ |
| an unreadable FCM credential fails the boot | same | ✅ |
| the gateway records when the sweep and tick last ran | `ops_heartbeats`, every job, with staleness on `/health` and the overview | ✅ stronger |

## 007 · Rendering, search and images

| v1 | v2 | |
|---|---|---|
| assistant replies render as markdown | same | ✅ |
| links open externally, http(s) only | same | ✅ |
| one `num_ctx` for every call | `llm.numCtx`, and the reason is in `CLAUDE.md` | ✅ |
| `think` only to a model that supports it | same | ✅ |
| **web search from the chat** | **not in v2** | ⛔ dropped deliberately. v1 searched the public web from a coaching turn; v2's reading comes from links the member saved, which is the Knowledge context. The capability a member actually used — "read this and tell me about it" — is there and is better. Searching the open web from a self-hosted assistant is a different product decision, and if it returns it should return as its own feature with its own privacy note rather than as a parity item |
| a statement about the user is never searched | moot, with search gone | ⛔ |
| snippets stripped and truncated | the extraction pipeline does this for saved links | 🔁 |
| the source list built by the gateway | `knowledge_docs` carry their sources | 🔁 |
| a failed search falls through to an ordinary reply | moot | ⛔ |
| **images proxied, never hotlinked** | `/media` with a signed URL | ✅ |
| the proxy refuses non-public addresses, re-checked on every redirect | same, and now resolves the name as well as reading it | ✅ stronger |
| every proxy failure answers 404 | same | ✅ |
| relative and bare times resolved in code | `relative-time.ts`, with `mentionsAClock` guarding invented hours | ✅ stronger |

## 008 · Device-first sync

Every one of FR-001 to FR-018 carried over: one `POST /sync` both ways, a
server-issued cursor that lags real time, tombstones with a purge horizon,
newest-edit-wins with a base-timestamp check, a rejection naming its entity, one
rejected row not blocking the outbox, the delete sweep only against a full
snapshot, the drift migration ladder, and `wipe()` on sign-out. ✅

Two things are **stronger**: the write filter now carries `userId` as well as
`_id` — v1 could not have the cross-member write that fixed, because its ids were
server-minted — and the entity set is nine rather than two.

## 009 · Named chats

| v1 | v2 | |
|---|---|---|
| history scoped to one conversation | same | ✅ |
| the check-in short-circuit only in the coaching chat | same, and the rule is in `CLAUDE.md` | ✅ |
| exactly one coaching conversation per user | a partial unique index on `kind` for the two singletons | ✅ |
| the nightly cycle writes into it | the rhythm touches | ✅ |
| the phone mints the conversation id | same | ✅ |
| an unseen id is created, not rejected | same | ✅ |
| `conversationId` NOT NULL | same | ✅ |
| soft delete with a tombstone | same | ✅ |
| deleting a conversation deletes its messages | same, in one transaction | ✅ |
| every rejection names its table | same | ✅ |
| titles never written by the server | same | ✅ |
| the drift migration never deletes cached messages | same | ✅ |
| the coaching chat shows null-conversation messages | moot: v2 has no null-conversation messages | ⛔ |
| `/sync` reports whether more messages remain | same | ✅ |
| a message naming an unknown conversation is not applied | same | ✅ |
| the offline outbox sent in chunks | same | ✅ |

## 010 · Reminder states and undo

All eight carried over, including the one that matters most — **deleting never
changes the status**, because the status is the only record of whether something
was completed, cancelled or never dealt with, and the Deleted view exists to show
exactly that. ✅

## 011 · Coaching track and reminder actions

| v1 | v2 | |
|---|---|---|
| reactivate returns a reminder to active | same | ✅ |
| purge refused for a row that is not a tombstone | same | ✅ |
| purge travels through the sync push | same | ✅ |
| purge checked before the staleness rule | same | ✅ |
| clearing a chat records a watermark | `clearedUpToSeq` | ✅ |
| clearing bounded by the newest message at the time | same | ✅ |
| clearing drops local messages with no server id | same | ✅ |
| **a non-coaching message is moved out of the coaching chat** | `chat.moved` | ✅ |
| a moved message does not carry the coaching history | same | ✅ |
| an open check-in takes precedence | same | ✅ |
| a turn that stays uses the coach's prompt | same | ✅ |
| nothing is moved out of an ordinary chat | same | ✅ |

## 012 · Admin login and the coach's profile

| v1 | v2 | |
|---|---|---|
| seed `ADMIN_EMAIL` when the account is missing | same | ✅ |
| never reset an existing password | same | ✅ |
| a failed seed does not stop the gateway | same | ✅ |
| `ADMIN_EMAIL` matched literally, so a bare username works | same | ✅ |
| `POST /auth/password` requiring both passwords | same | ✅ |
| a new password at least 8 characters | same | ✅ |
| a warning on every boot while the default stands | same, plus `/health` and a banner on every portal page | ✅ stronger |
| the coaching prompt carries the profile | same | ✅ |
| BMI computed in code | same | ✅ |
| an unfilled field omitted, never sent as a placeholder | same | ✅ |
| the search prompt carries the profile too | moot, with search gone | ⛔ |

---

## Deliberately dropped, in one place

1. **Web search from the chat** (007). Replaced by saved-link reading, which is
   the use the capability actually served. Its three supporting requirements go
   with it.
2. **Next-run for a workflow** (004). n8n does not report one reliably for every
   trigger type, and a sometimes-wrong next-run is worse than none. Last run is
   shown instead.
3. **The null-conversation fallback** (009). An artefact of v1's migration from
   unscoped messages; v2 never had them.

Nothing else. Every other v1 requirement is present, and thirteen are stronger
than they were.

---

## Banned members ⏳

The parity item that cannot be signed off from a document: **a member banned in
the old system must still be banned in the new one.**

v2 started with a clean database at the Owner's choice, so no ban carried over
automatically. The check is therefore explicit, and it is `T1121`:

1. List every account v1 holds with `status = 'banned'` (or v1's equivalent
   column), by email.
2. For each, confirm v2 either has no such account, or has one whose status is
   `banned`.
3. Confirm by **attempting a sign-in** for each, and reading the refusal.
4. Record the names and the results here.

Step 3 is not decoration. A ban is a claim about behaviour, not about a column,
and the only evidence that satisfies it is the sign-in being refused.

> **Not yet done.** It needs both stacks running, and the old one is stopped
> pending `T1122`. The result belongs in this section.

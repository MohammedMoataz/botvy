<!-- SPECKIT START -->
The current plan is the v2 blueprint: `specs/013-platform-v2-blueprint/plan.md`
(technical), with `spec.md` (business), `research.md` (every stack decision and
its alternatives), `data-model.md`, `contracts/` and `tasks.md` (phases P0–P11).
Read those before proposing structure, technology or shell commands.
<!-- SPECKIT END -->

## Where things are

`specs/001`–`012` record what v1 built and why; `specs/013-platform-v2-blueprint`
is the whole-platform plan for v2, and each implementation phase (`014` onward)
is its own spec-kit feature on its own branch. `.specify/memory/constitution.md`
(v2.0.0) holds the twelve rules every change is held to — the API is the only
writer to either store and each bounded context owns its own; n8n holds one
credential and no data; migrations only go forward; one public port; three
principal kinds; bounded contexts talk through events; commands (REST), queries
(GraphQL) and streams (WebSocket) stay separate; times belong to the user;
secrets in env, operator knobs in `settings`, member knobs in preferences.

Setup, the environment contract and the verification steps for v1 live in
`SETUP.md`; v2's target loop is `specs/013-platform-v2-blueprint/quickstart.md`
until the foundation phase makes it real.

## Things that are easy to get wrong here

- **Times belong to the user, not the server.** Resolve every user-facing time
  against the profile's time zone through `shared/time`. The API must never read
  its own `TZ` for this; doing so once shifted every extracted reminder by three
  hours.
- **Alerts fire from the phone.** The device schedules its own alarms from its
  local database, so they work offline. The server sweep is the fallback and skips
  devices that have already synced (`devices.lastSeenAt >= alert.plannedAt`).
  Changing one side without the other either double-notifies or silently
  notifies nobody. The sweep **claims** a row atomically before sending.
- **Three kinds of configuration.** Secrets and connection details are
  environment variables. Anything an operator might retune is a key in the
  `settings` registry with a zod schema. Anything a member might want different
  is a `user_preferences` field seeded from `settings.defaults.*`. A hard-coded
  default is a bug.
- **A scheduled job that stops arriving must be visible.** Every job writes an
  `ops_heartbeats` row; `/health` and the admin overview report it stale after
  15 minutes. A silent 401 between n8n and the gateway once went unnoticed for
  days.
- **Two stores, no joins.** Identity (users, refresh tokens, devices, service
  clients) is PostgreSQL; everything else is MongoDB. A Mongo context asks
  Identity through a query handler and reacts to its events — it never opens a
  Prisma client. `userId` in Mongo is the Postgres uuid as a string.
- **A context never reads another context's collection.** Cross-context needs
  are a `QueryBus` call or an outbox event. If two slices need the same helper,
  duplicate it; move it to `shared/` on the third copy.
- **Handlers never import a database driver.** A context declares its repository
  and unit-of-work ports in `domain/`; only `infrastructure/` imports `mongoose`,
  `mongodb` or `@prisma/client`, one adapter per store. Handler specs bind the
  in-memory adapter. A new store is a new adapter set under `shared/persistence/`,
  never a handler change — the lint rule `no-restricted-imports` enforces it.
- **Domain events go through the outbox in the same transaction.** Publishing
  straight to the EventBus after `save()` loses events on a crash. Consumers are
  idempotent on `eventId`; the relay delivers at least once.
- **MongoDB unique indexes treat missing and null as one value.** Any uniqueness
  over an optional field (`clientId`, `nameLower`) needs a partial index with
  `$exists: true` — Postgres NULL-distinct semantics did not port.
- **Client-minted UUIDv7 ids for anything the phone can create offline.** The
  server accepts the client's id; a retried create is a no-op. Server-only
  collections use ObjectId.
- **Messages are immutable, and that is load-bearing.** They are pulled by
  `seq > lastSeq` (per-user counter) with no `updatedAt` and no tombstone —
  which is why the cursor is cheap, and why a column backfilled onto existing
  rows can never reach a device that already has them. Mark the cache and
  re-pull; never edit rows in place.
- **Recurrence is a rule plus exceptions, never expanded rows.** Store `dtstart`,
  `rrule`, `exdates[]`, `overrides[]`; expand for the requested window on read.
  A moved occurrence is an override, not an edit to the series. Recurring tasks
  carry a mode: from schedule vs from completion.
- **Two timestamps on a synced row mean two different things.** `updatedAt` is
  when this device last edited the row; `baseUpdatedAt` is the server's own
  value for the version it last pulled, and a local edit must never touch it.
  The API accepts a push outright while the base still matches — send the local
  time instead and every offline edit falls through to a clock comparison, which
  a slow handset loses.
- **The sync delete-sweep runs only against a full snapshot.** A delta lists
  what changed; treating it as the complete set deletes every row that simply
  did not change. Deletions arrive as tombstones instead.
- **A rejection from `/sync` carries the entity it came from.** Every entity
  shares the rejection shape, so the client branches on `entity` before touching
  any table; writing a refused meeting through the task path corrupts rather
  than crashes. `protected` is never reported as `stale` — a stale verdict makes
  the phone retry forever.
- **Deleting anything must not touch its status.** The status is the only record
  of whether it was completed, cancelled or never dealt with, and the Deleted
  view exists to show exactly that.
- **The check-in only listens in the coach chat.** `awaitingCheckin` is one flag
  per user, and the classifier matches whole words including `rest` and `not`.
  Without the conversation condition, an ordinary sentence in an unrelated chat
  records a missed day and zeroes the streak.
- **Claim the date, then send.** The rhythm tick sets `lastEveningPromptDate`
  before building the prompt, so a 5-minute tick asks once a day and a gateway
  that was down at 22:00 catches up instead of skipping the day.
- **The phone has a schema, and it breaks silently.** Any change to a drift table
  needs a `schemaVersion` bump *and* a matching branch in the `MigrationStrategy`
  in the same change. Drift's default `onUpgrade` throws, so the failure mode is
  every existing install refusing to open, taking unsent edits with it.
- **A column added to a table that a migration creates needs a version guard.**
  `createTable` builds it from *today's* definition, so a later unconditional
  `addColumn` fails with "duplicate column" on every upgrade from before that
  table existed. Guard it: `if (from >= N && from < M)`.
- **`pending_op != 'x'` is NULL for a clean row, and NULL is falsy.** Any drift
  filter meaning "not this pending operation" has to be written
  `pendingOp.isNull() | pendingOp.equals(x).not()`, or it hides every row that
  has no pending operation — which is nearly all of them. Bitten twice now.
- **The WebSocket authenticates in the handshake.** The JWT rides in the
  Socket.IO `auth` payload; service tokens are refused on `/ws`. Access tokens
  expire mid-connection — clients reconnect with a fresh token on
  `token_expired`, never keep a dead socket.
- **The extension's side panel re-mounts every time it is closed.** State lives
  in `chrome.storage` (tokens, settings) and Dexie (entities), never in React
  state alone; the service worker owns the socket and reconnects via
  `chrome.alarms`. FCM does not work in an extension — nudges come over the
  socket or on open.
- **PrimeReact is pinned to its MIT line.** PrimeTek's PrimeUI licence applies to
  later majors; read the licence before any major bump.
- **Ollama keys a loaded model by its context size.** Every call uses the one
  `llm.numCtx`; two sizes reload the model on every turn (measured 39 s to first
  token). Extraction uses `format` (JSON schema) so the model cannot monologue.
- **A green `nest build` can be incremental and prove nothing.** Before
  deploying, build clean — and then check the compiled code is actually *in the
  container*, because a failed `docker compose build` followed by
  `up -d --force-recreate` restarting the previous image looks exactly like a
  successful deploy.
- **A fixture pinned to a real date is a time bomb.** Alert planning drops a lead
  time whose moment has passed, so a fixture dated in the future starts failing
  the day the clock reaches it. Write time fixtures relative to `Date.now()`.
- **The seeded admin is `admin`/`admin` and the portal is public.** The API
  creates it when the `ADMIN_EMAIL` account is missing and never resets an
  existing one, so a changed password sticks. It warns on every boot until it is
  changed, via `POST /api/v1/auth/password`.

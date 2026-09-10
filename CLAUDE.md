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
(v2.1.1) holds the twelve rules every change is held to — the API is the only
writer to either store and each bounded context owns its own; n8n holds one
credential and no data; migrations only go forward; one public port; three
principal kinds; bounded contexts talk through events; commands (REST), queries
(GraphQL) and streams (WebSocket) stay separate; times belong to the user;
secrets in env, operator knobs in `settings`, member knobs in preferences.

`SETUP.md` is v2's: prerequisites, the environment contract, the run, the
verification gate, backups **and the restore for both stores**. v1's own guide
moved with it to `legacy/SETUP.md`.

The foundation phase has landed, so the layout in the blueprint is the layout on
disk: `apps/{backend,frontend,extension,mobile}`, `packages/{contracts,sdk,tokens}`,
`infra/` and `workflows/`. v1 lives whole under `legacy/` and is read-only — the
root tsconfig, oxlint, Prettier and `.gitattributes` all exclude it, and nothing
in the v2 tree imports from it. `infra/verify.mjs` is the phase gate as a command:
containers healthy, exactly one non-loopback published port, both stores answering,
and a second `bootstrap.mjs` run that changes nothing.

`enhancements/` holds one file per improvement that is **not** a defect and not
in any phase's scope — what it is, why it is not simply a bug, what leaving it
costs, and what fixing it would take. A real defect is fixed in the phase that
finds it, with a test, and named in the commit; it does not go there.

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
  default is a bug. What an operator may *not* edit is the registry entry's
  `readOnly` flag, never a key prefix: refusing `ops.*` at the endpoint also
  froze `ops.staleAfterMinutes`, which is exactly the knob an operator retunes.
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
  duplicate it; move it to `shared/` on the third copy. A handler that dispatches
  another context's *command* is the same violation wearing a bus — the write
  belongs to that context's own consumer of your event. Enforced now:
  `no-restricted-imports` refuses a cross-context relative import from any
  `domain/` or `features/` file. `infrastructure/` is the one layer allowed to
  know another context exists, because binding a local port to somebody else's
  query is its job — `admin-device.lookup.ts` and `admin-password.probe.ts` are
  the pattern to copy. Reaching for another context's *feature service* is a
  violation even in the permitted direction; a `*.query.ts` handler is the
  published surface.
- **A capability three phases each credit to another phase is a capability
  nobody builds.** The pinned `coach` and `planner` conversations were "created
  in P1" per P1 and P3, and built in P4, and the blueprint put the skeleton in
  P3 — so nothing created them and the daily touches wrote into a conversation
  that did not exist. Whenever a phase says a thing already exists, open the
  phase it names and find the task.
- **An event with consumers and no producer is dead documentation.** The
  catalogue listed `profile.ProfileUpdated` and `PreferencesChanged` with their
  reactions spelled out, and no phase raised them — so a member who changed time
  zone kept alerts, meetings and sessions on the old wall clock. Both halves of
  an event, the raise and the handler, land in the same review.
- **oxlint ignores `patterns` when `paths` is also present.** The driver-import
  rule was written with both, so its `mongoose/*` and `@prisma/client/*` half
  never ran and a deep import was refused by nothing for two phases. Everything
  in `no-restricted-imports` is a `patterns` group now — a bare specifier
  matches there too — and every change to that rule is probed by writing a file
  that should fail and checking it does. A lint rule nobody has seen fire is a
  comment.
- **Handlers never import a database driver.** A context declares its repository
  and unit-of-work ports in `domain/`; only `infrastructure/` imports `mongoose`,
  `mongodb` or `@prisma/client`, one adapter per store. Handler specs bind the
  in-memory adapter. A new store is a new adapter set under `shared/persistence/`,
  never a handler change — the lint rule `no-restricted-imports` enforces it.
- **Domain events go through the outbox in the same transaction.** Publishing
  straight to the EventBus after `save()` loses events on a crash. Identity's
  events go to PostgreSQL's `identity_outbox` in the same Prisma transaction and the
  relay forwards them; a post-commit write to Mongo would lose the event if the
  process died in between. Consumers are idempotent on `eventId`; the relay delivers
  at least once.
- **MongoDB unique indexes treat missing and null as one value.** Any uniqueness
  over an optional field (`clientId`, `nameLower`) needs a partial index with
  `$exists: true` — Postgres NULL-distinct semantics did not port. In P3 it
  landed on `conversations.kind`: a member has one `coach` and one `planner` and
  any number of `free` chats, so the index is partial on an `$in` of the two
  singletons rather than plain unique, which would have refused the second free
  chat in P4.
- **Every collection saved through `MongoRepositoryBase` must declare
  `updatedAt`.** The base writes it on every save for its optimistic filter, and
  Mongoose's `strict: true` **rejects an upsert naming an undeclared path
  outright** — the whole write fails. This has shipped twice: `AlertSchema` in
  P2, where no alert was ever created and the notification pipeline was dead for
  a phase, and `MessageSchema` in P3, where every rhythm touch saved its plan,
  raised its event, planned its alert and failed to write the sentence into the
  member's chat. Both times the unit suite was entirely green, because handler
  specs bind the in-memory adapter and it has no schema to be strict about.
  `shared/persistence/mongo/schemas.spec.ts` now asserts it, along with `userId`
  on member-owned collections and no schema declaring its own indexes. Adding a
  collection means adding it there or to the exemption list with a reason.
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
- **Claim the date, then send.** The rhythm tick sets the touch's claim date
  (`lastPlanPromptDate`, `lastEndOfDayDate`, `lastMorningBriefingDate`) before
  building the message, so a 5-minute tick fires each touch once a day and a gateway
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
- **The seeded admin is `ADMIN_EMAIL`/`ADMIN_PASSWORD` and the portal is
  public.** The API creates it when that account is missing and never resets an
  existing one, so a changed password sticks. It warns on every boot until it is
  changed; `POST /api/v1/auth/login` returns a token and
  `POST /api/v1/auth/password` changes it, and `mustChangePassword` on the
  sign-in response is how a client knows to insist.
- **`npx oxlint` is not this project's lint.** oxlint discovers
  `.oxlintrc.json`; this repo's config is `oxlint.json`, so the bare command
  silently runs 99 built-in rules over 476 files — `legacy/` included, since it
  loses the ignore list too — instead of the 102 the config defines, and the
  three `no-restricted-imports` overrides that enforce constitution IX are among
  the missing three. Use `pnpm lint`. A gate that records the bare command has
  recorded a check that did not check what it says.
- **A claim date only ever moves forward.** `hasClaimed` is equality and
  `isDue` is `claimed === null || claimed < date`; the tick and every claim use
  the second. A member who flies **west** has their local date go backwards, so
  equality reads yesterday's touch as unclaimed and sends a second copy three
  hours after the first. The forced prompt an operator triggers claims
  unconditionally, which is the path that would rewind the date.
- **A streak is derived from the check-in rows, never folded day by day.** A
  fold is idempotent for a repeated answer and wrong for a *corrected* one: a
  "no" changed to a "yes" within the window zeroes the counter and leaves
  nothing in the store that could rebuild the run. Patching one check-in is the
  normal case, not an edge one — the row id is `"<userId>:<date>"` precisely so
  a chat answer and a card tap are one row. `best` is the only part carried
  forward, because a longer run can sit outside the window.
- **`adhered` is nullable and a null verdict is not an answer.** A mood with no
  verdict is half the question answered, so anything asking "was today
  answered" must check for a real boolean and not for the row's existence — v1's
  `currentStreak` used `has(today)` because v1's rows could not be null, and
  ported unchanged it drops a nine-day streak to zero for a member who moves
  their mood slider and says nothing else. Same for the week strip: three
  states, never a `boolean[]`.
- **A rhythm touch's alert is planned for *now*, so the phone can never
  pre-schedule it.** `pendingAlerts` is `notifyAt >= now` with `sentAt: null`,
  because its job is handing the device alarms it can set itself — a correct
  rhythm alert never appears there, and it depends on the server sweep where a
  task or reminder does not. Two consequences: a gate looking for it in
  `pendingAlerts` reports a working pipeline as broken, and a gate must sweep
  **before** it pulls `/sync`, because the pull stamps `lastSeenAt` and the
  sweep then correctly skips a device that looks up to date.
- **An event's payload must carry every field its consumer reads.** A payload
  crosses the boundary as `unknown`, so the type system cannot say a field is
  missing and the fallback silently wins instead. P2's `TaskScheduled` and
  `TaskRescheduled` omitted `title`, so **every task notification in the product
  said "Task due"**; `TaskRescheduled` also omitted `allDay`, so
  `allDay === false` was false on every edit and the reconcile dropped the
  member's lead times. Build the payload from one method shared by every raise
  site, and assert the payload in a spec — asserting the consumer's behaviour
  passes with the fallback in place.
- **`defer` raises `TaskRescheduled` as well as `TaskDeferred`.** They say
  different things to different readers: the count is the rhythm's, the moment is
  Notifications'. Without both, a task swiped to tomorrow keeps tonight's alarm
  — and the nightly rollover does that to every unfinished task every night.
- **drift calls `onUpgrade` once, with the pair it has.** A branch guarded
  `from >= 2 && from < 3` is skipped entirely by `(from: 1, to: 3)`, so a v1
  install upgrading two versions came out with none of the tables that branch
  creates. `createTable` guards are `from < N`; the band shape belongs on
  `addColumn` alone, where it prevents the duplicate-column failure. Test the
  ladder from *every* prior version against the current schema, not from one.
- **The tick's counters are incremented after the touch returns**, so a touch
  that throws leaves the counter at zero while its earlier saves stand. n8n logs
  that response and it is the only record of what a 22:00 pass did — read the
  claim dates or the plan, not the counter, when asking whether a touch
  happened.
- **v2 is its own compose project, `botvy-v2`.** v1 declares `name: botvy`, and
  while v2 did too the pair were one project sharing `pg_data` and `n8n_data` —
  v2 served v1's live database and neither could run beside the other. Keep the
  names distinct, or a `docker compose up` in one tree recreates the other's
  containers on the other's data.

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
- **A repository's write filter must carry `userId`, not only `_id`.**
  `MongoRepositoryBase.save` is an upsert, because a client mints the id and an
  offline create is a save of a row the server has never seen — and its filter
  was `{ _id, updatedAt }`. So a `/sync` push naming an id belonging to another
  member matched their row and `$set` wrote over it, `userId` included. Live
  from P2 to P4, reachable for every client-minted-id entity, and invisible to
  every handler spec because the scoped *read* cannot see the row: from inside
  the adapter a foreign id and a never-before-seen id are identical. That is why
  the guard has to be in the filter and not in a check before it. The refusal is
  `ForeignRowError`, reported as `invalid` — never `stale`, which would send the
  phone into a retry loop against a rule that will never accept it.
- **An asset the code reads at runtime has to be copied into the image.** The
  prompt templates were not, so every chat turn in the container would have
  thrown on the first template read while the whole local suite passed. And
  resolve such a path by **walking up** from `import.meta.url` to the directory
  you want, never by counting `..`: the count agrees between `src/` and `dist/`
  only by accident of the build layout, and it breaks silently.
- **n8n blocks `$env` inside node expressions by default.** Every execution of
  every cron workflow failed with `access to env vars denied` until
  `N8N_BLOCK_ENV_ACCESS_IN_NODE: 'false'` was set — so no scheduled job had
  ever run on this installation. It was invisible because every gate calls
  `/internal/*` directly, which is the right thing for a gate to do and leaves
  the automation itself untested. The heartbeat rule caught it: `verify.mjs`
  reporting a job stale is the only reason anybody found out. **And check the
  variable names match**: the two cron workflows read
  `$env.BOTVY_SERVICE_TOKEN` while compose set `BOTVY_INTERNAL_TOKEN`, which is
  an empty `Bearer ` and the silent 401 that rule was written after.
- **A read that a client cannot reach is a read that does not exist.** A query
  handler with a spec and no GraphQL resolver happened in P2 and again in P4
  (`quickQuestions`). Adding a slice means adding it to `RESOLVERS` in
  `graphql/graphql.module.ts` *and* checking it appears in the regenerated
  `packages/contracts/schema.graphql` — that file is the proof.
- **`inConversation`-shaped reads sort ascending and then limit, which gives
  you the OLDEST n.** A prompt asking for "the last twenty messages" through
  one of those carries the member's *first* twenty for ever and never the
  previous turn. A "latest n" read is its own method — sort descending, limit,
  reverse — and not a boolean flag on the same one, which would leave two
  callers one typo apart from reading opposite ends of a transcript.
- **The turn stores the member's message before it builds the prompt.** That is
  deliberate (a refused turn leaves nothing; an accepted one is on the record),
  and it means the newest history row *is* the message the prompt exists to
  answer. Any history read for a prompt needs an exclusive upper bound, or the
  model is handed it twice and answers the undelimited copy.
- **A grammar beats an instruction.** `format` with a JSON schema is enforced;
  the prompt is advice. As a free string, `metric` came back empty from
  `record_metric` two times in three; as an `enum` of the two values the profile
  actually stores, the model fills it. Constrain the field rather than
  explaining it — and normalise whatever arrives anyway, because the schema is
  enforced by the *server* and a different backend or an older Ollama may not.
- **Never put a corpus sentence in the prompt that grades it.** The `scope`
  section was sharpened with sixteen examples and the score went 24 → 30; ten
  of those examples were lifted from `intent-cases.json`, and the honest score
  with different sentences was 29. Teaching to the test measures the model
  recognising strings it was just handed. The script that writes the examples
  now asserts none of them appears in the corpus.
- **A fixture must grade the pipeline, not the prompt.** The intent fixture
  first called the extraction prompt and graded its raw output — measuring the
  model's unaided performance at the one job `relative-time.ts` exists to take
  away from it. Six of its "silent time errors" were phrases the pipeline
  resolves correctly. It imports the **compiled** helpers now, which is also one
  more caller that would notice a runtime-only breakage in the built output.
- **`qwen3` is not a drop-in for extraction.** It is a thinking model: it emits
  a `thinking` field before its answer, which is exactly what `format` exists to
  prevent, and a schema-constrained call does not return in reasonable time. A
  bigger extraction model means a bigger **instruct** model.
- **An absolute millisecond budget in a test needs headroom for the machine, or
  it is flaky by construction.** Best-of-three is already the technique here;
  what it cannot fix is a ceiling calibrated on other hardware. Set it where it
  still catches the regression it was written for — a per-task widget rebuild
  takes a render to *seconds*, so 600 ms catches it with an order of magnitude
  to spare — and record the measured number beside it.
- **Two contexts that reference each other need `forwardRef`, and that is
  fine.** P3's rhythm writes into the coach chat; P4's chat reads the plan, the
  streak and the check-in. Both directions are ports bound in
  `infrastructure/`, so the cycle is a DI artifact and not a domain one — no
  aggregate on either side knows the other exists. Resist "fixing" it by
  turning one direction into an event: the rhythm composes the sentence, and an
  event carrying chat copy in a rhythm payload is worse than one `forwardRef`.
- **A shared client belongs in its own module, not in the first module that
  needed it.** `OllamaClient` was provided by `HealthModule` — reasonable while
  the only caller was the reachability probe, and wrong the moment the chat
  needed it, because a context importing `HealthModule` points the dependency
  backwards and drags a controller along with a client.
- **A stored instant does not remember what the member typed.** "18:00" in
  Cairo is one instant; read in Berlin the same instant is 17:00. So a
  recurrence expanded from `dtstart` alone lands a member who has flown at
  neither the time they chose nor the time they left behind — and it drifts
  again with every further move. Recovering the digits needs the instant *and*
  the zone it was written in, which is why `meetings.authoredTimezone` exists
  and is never changed afterwards. Both halves of FR-007 then fall out of one
  line: the wall-clock digits come from `lockTimezone ?? authoredTimezone`, and
  the clock they are read on is `lockTimezone ?? the member's current zone`. A
  pinned series keeps its instants when the member moves; an unpinned one keeps
  its digits and moves its instants, which is what Notifications re-plans.
- **`pnpm typecheck` ran one of the two TypeScript projects.**
  `tsconfig.build.json` excludes `**/*.spec.ts` because that is what ships, so
  a type error in a spec was invisible to every gate that recorded the command
  as green — three agents in one phase hit it independently, one having shipped
  a call with the wrong arity. The script runs both projects now. A check that
  cannot see half the tree has recorded something other than what it says.
- **An exception keyed by the rule's own moment means a move clears the
  *source's* skip, not the destination's.** `exdates` are matched against the
  dates the rule generates, *before* overrides are applied — so moving
  occurrence A onto occurrence B's instant needs nothing done about B's
  exclusion, and clearing the destination instead resurrects the occurrence the
  member cancelled: a member who skipped Tuesday and then dragged another
  meeting onto Tuesday ended up with two meetings and the cancelled one back.
  The case that genuinely needs clearing is skipping A and then moving **A** —
  without it the rule date is excluded, the override keyed to it is never
  reached, and the drag silently does nothing.
- **A controller declared in `AppModule` needs its handlers *exported* from the
  context module, not merely provided.** Nest resolves a controller's
  dependencies from the module that declares it, and the routes live in
  `AppModule` so the worker can import a context without gaining an HTTP
  surface. The failure is an `UnknownDependenciesException` at boot that no
  typecheck sees; `app.module.spec.ts` resolves the whole graph in both roles,
  which is what turns it into a red test instead of a red deploy.
- **`gen:contracts` runs `node dist/main.js`.** Regenerating without building
  first republishes the *previous* schema, silently and with a success message —
  the new resolvers and event payloads simply are not in it, and `schema.graphql`
  is the file everything else is checked against. The event catalogue in
  `contracts.generate.ts` is hand-maintained besides, so a new context's events
  need a row there as well as a producer; the sibling of "a read a client cannot
  reach does not exist" is a payload no subscriber can validate against.
- **Every new context is added to `oxlint.json`'s cross-context pattern list in
  the change that creates it.** The rule enumerates context names, so an absent
  one is unpoliced in the *reverse* direction: nothing stopped another context's
  `domain/` from importing `../../meetings/**` until the twelve patterns were
  added. And probe it — write a file that should fail and check the
  "Constitution IX" message actually appears. A lint rule nobody has seen fire
  is a comment.
- **A member preference is never read from the settings registry.** They agree
  for every member who has not changed it, which is exactly what makes the bug
  invisible: `defaults.meetingDurationMin` read through `SettingsService` gives
  the *installation* value, so the editor silently ignores what the member set.
  Constitution XII means a `user_preferences` field is reached through a port
  bound to Profile's published read, with the registry as the fallback for a
  member whose bootstrap row does not exist yet. And a stub for such a port must
  answer something *different* from the registry default, or the spec passes
  whichever source the handler used.
- **The script that was supposed to keep corpus sentences out of `intent.md` was
  never committed.** P4's notes say "the script that writes the examples now
  asserts none of them appears in the corpus"; it was ad-hoc, and three corpus
  sentences were still quoted verbatim in the prompt's `record_metric` and
  `update_profile` bullets — the leak was fixed in the `scope` table and nowhere
  else. It is a spec assertion now, so it runs on every `pnpm vitest`, which is
  the only version of that check worth having. A verification that lives in
  somebody's shell history has not been performed since.
- **Two capabilities sharing one "not yet" refusal becomes a lie when one of
  them ships.** `list` answered "coming in a later version" for `meetings` and
  `sessions` from the same branch, so building meetings left the chat denying a
  feature that existed. Split the branch when you build the first half, and let
  the refusal name only what is actually missing.
- **A port belongs to the context that needs the answer, not the one that gives
  it.** P6's plan said both of its cross-context tokens lived in Training's
  `domain/ports`, and that is upside down: `NextSessionPort` is Rhythm's and
  `TrainingSessionsPort` is Meetings', each bound in its own `infrastructure/`.
  Putting the token in the answering context inverts the dependency — Rhythm
  would import Training's domain to describe its *own* need — and it makes the
  null-returning stub impossible, because there would be nothing to declare it
  against. P3 and P5 both built it the right way round; only the sentence was
  wrong. What a context publishes is a **query handler**; the consumer declares
  the port.
- **`timezone` lives on the profile, not in preferences.** A member who moves
  raises `profile.ProfileUpdated`, and `PREFERENCE_FIELDS` has no `timezone` in
  it — so anything that must recompute on a zone change subscribes to
  `ProfileUpdated`, as the alert saga already did. P6's plan said the session
  materialiser would listen for `PreferencesChanged` naming the zone; written
  that way the recompute would never once have run, and a member who flew would
  have kept a fortnight of sessions on the clock of the city they left. Both
  events reach one method that branches on the field named, so the day
  `timezone` moves onto preferences nothing changes.
- **A guard's vocabulary needs a test for the false negatives, not only the
  true positives.** P5's `mentionsAMoment` refuses a model-supplied clock when
  the sentence names no moment. P6 found it *satisfied by a weekday* — "I do
  football on Fridays" names a moment — so a training-slot sentence kept an
  invented hour, which for a slot is a fortnight of alarms rather than one. The
  narrower `mentionsAClock` fixed that and immediately refused **"gym Monday and
  Wednesday at six"**, the feature's own headline example, because a spelled-out
  hour has no digit in it. Both directions are now pinned, and the number words
  are shared with the relative parser rather than listed twice. The errors are
  asymmetric — a false negative costs one question, a false positive costs an
  alarm nobody set — and asymmetric is not the same as free.
- **A fixture that grades the pipeline has to be updated when the pipeline
  gains a guard.** P4 fixed `intent-fixture.mjs` to apply the compiled
  `relative-time` *resolution*, and wrote the rule down. P5 then added
  `mentionsAMoment` and P6 `mentionsAClock`, and neither reached the runner — so
  it scored silent time errors against a pipeline that drops them, and the
  phase's own numbers were pessimistic for two phases. The fixture now asserts
  each helper is a function before it starts, because a missing export from a
  *compiled* module is `undefined` at the call site and nothing would otherwise
  say so.
- **A test that resolves each zone's own "today" flakes when the zones disagree
  about the date.** P3's two-zone case built Cairo's 22:00 and Berlin's 22:00
  from each zone's own current day; for the couple of hours after midnight in
  the eastern zone those are different dates, Cairo's instant lands *after*
  Berlin's, and the second tick goes backwards. Pin the day and ask both zones
  for the same one. A red line that depends on the hour the suite runs at
  teaches whoever sees it to ignore red, which costs more than the case was
  worth.
- **A derived id means a deletion is still found, so the create path must
  restore.** The session materialiser keys a slot's session on
  `uuidv5(userId:slotId:localDate)`, which is what makes creation an upsert and
  a redelivered event a no-op. It also means a *tombstoned* row answers the
  existence check — so a member who removed a slot and put it back would have
  had every session declined for ever as "already there". The pass restores and
  re-announces instead. Any derived-id collection has this corollary.
- **A contract can promise a field nothing serves, which is the mirror of a
  read no client can reach.** The blueprint SDL typed `PlanTraining.status` and
  `Program.sourceLinks: [Link!]!`; the first was never generated and the second
  cannot be — `Link` is another context's type, and a `features/` file declaring
  it is what `no-restricted-imports` refuses. Both had sat unread since the
  planning phase. `packages/contracts/schema.graphql` is the generated file and
  therefore the truth; when the blueprint disagrees with it, correct the
  blueprint and say which way round the mistake was, because the next reader
  will otherwise implement the promise.
- **A DTO property with no class-validator decorator does not exist.** The
  global pipe runs `whitelist: true` with `forbidNonWhitelisted: true`, and
  *whitelisted* means "carries at least one decorator" — so a bare
  `value!: unknown` makes the endpoint answer `400 property value should not
  exist` to every request, including the correct one. `PatchSettingDto` was
  written that way deliberately (the settings registry's own zod schema is the
  validator) and **the only write path to the registry refused the only field it
  takes**, which made every key a hard-coded default for three phases.
  `@Allow()` declares a property and validates nothing, which is the intent.
  Invisible to the suite, because handler specs bind handlers directly and never
  go through the pipe — a controller taking an unconstrained body needs a spec
  that runs the real `ValidationPipe` against its DTO.
- **A warning that promises a replacement must be produced by the code that
  replaces.** `POST /programs/:id/apply` listed five planned sessions it would
  overwrite, took the member's `force` — and the materialiser filled a session
  *only at the moment it created it*, so nothing that already existed was ever
  rewritten. The warning and the action were two arithmetics over the same rule
  and only one of them ran. They now share the predicate (`isUntouched`), the
  window (never the past) and the source (`fill`); a list the member agreed to
  and a set of rows actually written that can disagree is worse than no warning,
  because they believe it happened.
- **An external source says "no" in two ways, and collapsing them breaks the
  retry limit in one direction or the other.** The source refusing — a 404, a
  paywall, a login wall, a page that parses to nothing — spends an attempt and
  leaves the row `failed` with a reason the member can read. *Our* end failing —
  the network, the model, a container that was restarted — must spend nothing
  and leave the row where it is, for the sweep to bring round again. Read the
  first as "try later" and a dead URL is retried for ever; read the second as a
  refusal and one restart exhausts the retry limit of every link in flight. The
  split lives at the **adapter**, because only it knows which it got: a pipeline
  guessing from a message string gets it wrong the first time somebody changes a
  library. And an *unexpected* error is treated as a refusal, because that is
  the bounded direction — a bug read as "try later" loops through the sweep at
  four in the morning for the life of the installation.
- **"Is the queue draining" can only be asked before the pass.** The first
  version of P7's health check asked afterwards and always answered yes, because
  a drain moves every row it touches out of `queued` — including the ones it
  defers, which leave as `fetching` and are the stall sweep's business. A link
  still `queued` when a pass *begins* is one every pass since it was saved failed
  to take, and that is the only moment the difference is visible. Its spec caught
  it answering healthy for a queue stuck for three hours.
- **A loader that walks up looking for a directory must not live in a directory
  of that name.** `renderPrompt` moved from Conversations to `shared/prompts/`
  and the walk promptly found *itself*: the first candidate above the module is
  `shared/prompts`, which exists, so every template read resolved to the folder
  holding the loader and twenty-five chat tests failed with `ENOENT …
  src/shared/prompts/coach.md`. It is `shared/templates/` now. A search that
  stops at the first match of a name cannot be given a same-named home, and
  renaming keeps the search simple instead of adding a rule about which match to
  ignore.
- **A constructor parameter typed `typeof fetch` is `Function` to Nest, and a
  default value does not save it.** `design:paramtypes` emits `Function`, so the
  container tries to resolve it and the module fails to build with an
  `UnknownDependenciesException` at boot that no typecheck sees. Either construct
  the class with a `useFactory` — which is what both of P7's source fetchers do —
  or make it an assignable property, which is what `MediaController` does so its
  spec can substitute one. `app.module.spec.ts` is what turns either mistake into
  a red test rather than a red deploy.
- **A drift `@DataClassName` annotates the class that follows it, so a table
  inserted between the two silently renames both.** P7's `Links` table landed
  after `@DataClassName('LocalMessage')` and before `class Messages`: the
  annotation attached to `Links`, `Messages` regenerated as `Message`, and six
  files that had compiled for three phases stopped. Generated code is where this
  shows up and `flutter analyze` is where it is caught; the fix is to put a new
  table somewhere no annotation is dangling and give it its own.
- **A tracking-parameter list needs prefixes, not names.** URL normalisation is
  what makes "do not read the same article twice" true, and the first version of
  P7's list named `fbclid`, `gclid` and eleven others and *not* `utm_*` — so the
  single most common case, an article from a newsletter, was two entries. The
  thirty-URL fixture table caught it on its first run, which is the argument for
  the table. `utm_` is open-ended by design, so it is matched as a prefix.
  Deleting while iterating `URLSearchParams.keys()` is the other half: it is a
  live iterator over the list `delete` mutates, so two adjacent tracking
  parameters leave the second one in place.
- **v2 is its own compose project, `botvy-v2`.** v1 declares `name: botvy`, and
  while v2 did too the pair were one project sharing `pg_data` and `n8n_data` —
  v2 served v1's live database and neither could run beside the other. Keep the
  names distinct, or a `docker compose up` in one tree recreates the other's
  containers on the other's data.
- **A word matcher that is not a substring search still has to survive English
  word endings.** The allergen gate matches whole words on purpose — `nut`
  inside `donut` would withhold a member's breakfast for ever — and word
  equality plus a crude plural is not enough: **"buttered toast" and "creamy
  mushroom pasta"** are ordinary ways to write a meal, and a dairy-allergic
  member would have been handed both. A prefix match with a four-character floor
  covers `-ed`, `-y` and whatever comes next without a stemmer, and the floor is
  what keeps `nut` from matching `nutmeg`. Found by a fifty-phrasing corpus on
  its first run, which is the argument for the corpus: **half of it has to be
  the cases that must *not* match**, or a gate that matched everything would
  pass every "is it caught" case and leave the member with a permanently
  withheld day.
- **A withholding reason is a code, never a rendered sentence.** P3 stored
  `"Meals: none planned — the model was unavailable"` into `daily_plans.mealLine`
  — an English sentence written into a row an Arabic-reading member syncs, by a
  handler whose own comment said the phone would render it. The line and the
  reason are separate columns now and every surface renders the three codes
  itself. The same rule caught a second thing: the plan's "read the reason from
  `todayMeals` when online, fall back to a plain sentence when not" is a member
  on a plane being told less than a member on wifi, for one string. A synced
  column costs nothing and says the same thing everywhere.
- **A column carried by the aggregate, the view, the resolver and the sync
  adapter and written by nothing is not a column, it is four places to be
  wrong.** `daily_plans.workoutLine` sat that way from P3 to P8. The sibling of
  "an event with consumers and no producer": when a phase adds a field it cannot
  fill yet, the phase that fills it has to be named in the field's own comment,
  or nobody ever does.
- **A gate that registers a member and immediately patches their preferences
  loses a race no real client loses.** The preferences row is written by the
  outbox consumer, so the patch answers 404 — correct behaviour — and every
  check after it silently ran against the installation default instead of the
  member's choice. Wait for the row. The general form: anything a gate does in
  the same second as registration is racing the relay, and the symptom is a
  feature reported broken in a mode nobody selected.
- **`/rhythm/tick` does nothing at four in the afternoon, and that is the
  point.** A gate that needs a plan row must use the operator's forced prompt
  (`POST /internal/rhythm/prompt {userId, kind}`), which ignores the time of day
  and the claim date — the tick is a clock, and asking it to produce a touch out
  of hours is asking it to be wrong.
- **`POST /sync` takes no `full` flag.** A full snapshot is a request with no
  `since`; an invented field is a 400 for the whole request, because the DTO runs
  under `forbidNonWhitelisted`. And the response serves rows under `pull`, not
  under `entities` — `entities` is what the *request* names. Both mistakes read
  as "this entity does not sync".

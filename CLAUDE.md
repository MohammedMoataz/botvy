<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

## Where things are

The specs in `specs/` are the record of what was built and why; the newest one
describes the current shape of the system. `.specify/memory/constitution.md`
holds the rules every change is held to — the gateway is the only writer to the
database, n8n holds one credential and no data, migrations only go forward.

Setup, the environment contract and the verification steps live in `SETUP.md`.

## Things that are easy to get wrong here

- **Times belong to the user, not the server.** Resolve every user-facing time
  against `CoachingProfile.timezone`. The gateway must never read its own `TZ`
  for this; doing so once shifted every extracted reminder by three hours.
- **Reminders fire from the phone.** The device schedules its own alarms from
  its local database, so they work offline. The server sweep is the fallback
  and skips devices that have already synced. Changing one side without the
  other either double-notifies or silently notifies nobody.
- **Anything an operator might retune belongs in the `settings` table**, not in
  a constant and not in the environment. Environment variables are for secrets
  and connection details. Add the key to `settings.registry.ts` with a schema.
- **A scheduled job that stops arriving must be visible.** The sweep and the
  coaching tick write `ops.*` rows; `/health` and the admin portal report them
  as stale. A silent 401 between n8n and the gateway once went unnoticed for
  days.

- **The phone has a schema, and it breaks silently.** Any change to
  `apps/mobile/lib/src/db/database.dart` needs a `schemaVersion` bump *and* a
  matching branch in the `MigrationStrategy` in the same file. Drift's default
  `onUpgrade` throws, so the failure mode is every existing install refusing to
  open, taking unsent reminders with it.

- **Two timestamps on a reminder mean two different things.** `updatedAt` is
  when this device last edited the row; `baseUpdatedAt` is the server's own
  value for the version it last pulled, and a local edit must never touch it.
  The gateway accepts a push outright while the base still matches — send the
  local time instead and every offline edit falls through to a clock
  comparison, which a slow handset loses.

- **The sync delete-sweep runs only against a full snapshot.** A delta lists
  what changed; treating it as the complete set deletes every reminder that
  simply did not change. Deletions arrive as tombstones instead.

- **Messages are immutable, and that is load-bearing.** They are pulled by
  `id > lastMessageId` with no `updatedAt` and no tombstone, which is why the
  cursor is cheap — and why a column backfilled onto existing rows can never
  reach a device that already has them. The v3 drift migration works around it
  by marking the cache and re-pulling, not by editing rows in place.

- **The check-in only listens in the coaching chat.** `awaitingCheckin` is one
  flag per user, and the classifier matches whole words including `rest` and
  `not`. Without the conversation condition, an ordinary sentence in an
  unrelated chat records a missed day and zeroes the streak.

- **Deleting a reminder must not touch its status.** The status is the only
  record of whether it was completed, cancelled or never dealt with, and the
  Deleted view exists to show exactly that. `remove()` writing `cancelled`
  alongside the tombstone erased it and made every restore a lie.

- **`pending_op != 'x'` is NULL for a clean row, and NULL is falsy.** Any drift
  filter meaning "not this pending operation" has to be written
  `pendingOp.isNull() | pendingOp.equals(x).not()`, or it hides every row that
  has no pending operation — which is nearly all of them. Bitten twice now.

- **A column added to a table that a migration creates needs a version guard.**
  `createTable` builds it from *today's* definition, so a later unconditional
  `addColumn` for one of its columns fails with "duplicate column" on every
  upgrade from before that table existed. Guard it: `if (from >= N && from < M)`.

- **A green `nest build` can be incremental and prove nothing.** Before
  deploying, build clean (`rm -rf dist`) — and then check the compiled code is
  actually *in the container*, because `docker compose build` failing and
  `up -d --force-recreate` restarting the previous image looks exactly like a
  successful deploy.

- **A rejection from `/sync` carries the table it came from.** Both entities
  share the rejection shape, so the device has to branch on `entity`; writing a
  refused chat through the reminder path corrupts rather than crashes.

- **A fixture pinned to a real date is a time bomb.** `planNotifications` drops
  a lead time whose moment has passed, so a reminder fixture dated in the future
  starts failing the day the clock reaches it — for reasons unrelated to any
  change. Write reminder fixtures relative to `Date.now()`.

- **The seeded admin is `admin`/`admin` and the portal is public.** The gateway
  creates it when the `ADMIN_EMAIL` account is missing and never resets an
  existing one, so a changed password sticks. It warns on every boot until it is
  changed, via `POST /auth/password`.

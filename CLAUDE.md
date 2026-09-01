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

- **A rejection from `/sync` carries the table it came from.** Both entities
  share the rejection shape, so the device has to branch on `entity`; writing a
  refused chat through the reminder path corrupts rather than crashes.

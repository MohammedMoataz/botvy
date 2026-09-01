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

# Defects found by running, not reading

Foundation phase (P0), `specs/014-foundation`.

Every bug in this phase that only appeared once something actually ran. This file is the argument for the verification gate existing at all: none of these were visible in review.

---

Recorded because they are the argument for the verification gate existing at all.

- **The backend could not start.** `AppModule` registered three global guards
  and never provided the `JwtVerifier` they depend on.
- **That failure printed nothing, twice over.** Nest exits the process itself
  when a module fails to initialise, so `logger: false` reduced a real error to
  a bare exit code; and `process.exit()` discards unflushed output when stdout
  is a pipe — which it is under pnpm and under every CI runner — so even the
  error handler's own message was written and thrown away.
- **The in-memory repository kept rows a failed transaction wrote**, and threw a
  different error type than the store adapters. Either would have let a handler
  pass its own spec and lose data against a real database. The repository
  contract test caught both on its first run.
- **The service-client seed reported a rotated token as unchanged**, because it
  verified the hash *after* writing it. An operator rotating
  `INTERNAL_SERVICE_TOKEN` would have seen nothing confirming it took effect.
- **The build script never ran `nest build`**, because it nested a `pnpm` call
  that is not on PATH when the outer pnpm comes from corepack.
- **The environment schema refused the administrator login this project
  documents.** `ADMIN_EMAIL` was validated as an email address, and the
  documented default is the literal `admin`. Both roles crash-looped on their
  first real boot before a line of application code ran.
- **The frontend image could not resolve `@botvy/sdk`.** Its Dockerfile built
  `@botvy/tokens` and not the SDK, whose `exports` map points into `dist/`.
- **The image reference was invalid because a GitHub owner may contain
  capitals and a Docker tag may not.** The same bug was in `release.yml`, which
  used `github.repository_owner` verbatim; both lowercase it now.
- **`pnpm deploy --legacy` is a pnpm 10 flag** and this repository pins 9.15,
  so the backend image never reached its runtime stage.
- **The backup container had been restart-looping since it was written.** It
  ran `crontab` and `cron`, and `mongo:8` ships neither:
  `/bin/bash: line 2: crontab: command not found`. Nothing was being backed up,
  and nothing said so.
- **Nothing ran `infra/backup-postgres.sh` at all.** The script was written and
  committed; no compose service referenced it. FR-005 asks for a nightly backup
  of *each* store, and only one store had a container.
- **`GET /health` does not exist.** The compose healthcheck for `backend` polls
  it, so the container can never become healthy, and `caddy` depends on
  `backend: service_healthy` and therefore never starts at all. See §6.
- **The backend image could not run the migrations it is asked to run.**
  `bootstrap.mjs` applies the PostgreSQL migrations with `prisma migrate deploy`
  inside the container, and `prisma` was a devDependency while the Dockerfile
  builds its runtime tree with `pnpm deploy --prod`. Checked against the image
  rather than reasoned about: `node_modules/.bin` held `migrate-mongo` and
  nothing else. A fresh host's first bootstrap would have failed at the step
  that creates every table.
- **Neither gate script read `.env`, so their defaults were what ran.** The API
  base was port 80 while `EDGE_PORT` is 8090 — and port 80 on this machine is
  v1's own edge, so a `/health` that answered would have proved nothing. n8n's
  URL was pinned to 5679 while `N8N_BIND` is 5680. And both steps that
  announced "not set in this shell" and skipped themselves were reading
  variables that have always been set in the file.
- **The n8n workflow import created a duplicate on every run and activated
  nothing.** n8n's public API has no conflict on a workflow name, so a second
  bootstrap added a second "Botvy Ping Echo" bound to the same webhook path,
  and an imported workflow arrives inactive, which makes its webhook answer
  404. Both were found by the other session reading the API's behaviour rather
  than by anything failing.
- **The gate's idempotence check read the log for the word "applied".** It now
  reads a count the script prints. A step that reworded its success line would
  have turned the check off with nothing to show for it.
- **n8n had never connected to a database.** `N8N_DB` is `n8n_v2` in `.env`,
  and `infra/postgres/001_create_databases.sql` created a database called
  `n8n` — a plain `.sql` file cannot read an environment variable, so the name
  was hard-coded. The container had been retrying since bring-up:
  `Initial database connection attempt 1 failed: database "n8n_v2" does not exist`.
  It is a shell script now, and reads the variable.
- **The Flutter app had never met its toolchain**: dependencies unresolvable,
  codegen aborting, and three ported files aged past their packages
  (`flutter_secure_storage` dropped the encryption option because encryption is
  now the only mode; `flutter_local_notifications` moved to named parameters;
  `flutter_timezone` returns a structure rather than a string).

---

---

## Found by an adversarial review of the wiring commit

A second pass over `5264295` in a fresh context, checked against the
constitution rather than against its own commit message. Fifteen findings; these
are the ones that were real and are now fixed.

- **The gate had a check that could never reach the API.** `bootstrap.mjs`
  probed `/internal/alerts` through the Caddy edge, and the Caddyfile
  deliberately does not route `/internal/*` — machine routes are not public
  surface. The request landed on the web app, came back 404, and the step
  treated anything but 401 as success: `ok  n8n service client answers — HTTP
  404`. A green gate on a credential nobody had checked. It runs inside the
  container now, and only 200 or 201 passes.
- **A fifteen-minute staleness window was being applied to a nightly job.** Now
  that `/internal/ops/heartbeat` exists the backup container creates
  `backup.mongo` rows, and every one of them went stale at 03:15 and stayed
  that way — so `/health` reported the platform degraded for the rest of every
  day and the gate's "no stale jobs" check failed with it. `backup.staleHours`
  had been in the registry the whole time with nothing reading it.
- **The relay's retry ladder was unreachable dead code.** `deliver` passed a
  hard-coded attempt count of 1, so every retry was scheduled sixty seconds out;
  the five-minute, thirty-minute and two-hour rungs and the parked state could
  never be entered, and the `attempts` counter the store incremented was read by
  nobody.
- **Nothing ever re-drained.** `run()` drained once at startup and then blocked
  on the change stream forever, and a change stream only yields *inserts* — a
  deferred retry is invisible to it. A webhook that failed once waited for a
  process restart, with `/health` reporting nothing wrong throughout.
- **Every restart re-delivered its whole downtime window.** The drain sent what
  had accumulated, then the resume token from before the outage made the stream
  yield the same rows again. At-least-once is the design; systematically
  re-sending a window is not the same thing, and the consumers' in-memory
  idempotency guards are empty at exactly that moment.
- **A clean return from the relay loop spun at full CPU.** `runForever` slept
  only in its `catch`, so a change stream ending rather than throwing — what a
  dropped connection can look like — reopened streams as fast as the event loop
  allowed. It reads as a busy worker rather than a broken one, which is worse.
- **A context was reading another context's store, under a comment saying it
  was not.** `SeededAdminDeviceLookup` took Identity's `UserRepository` and
  called `findByLogin`, beneath the words "Operations never opens Identity's
  tables". `UserRepository` and `DeviceRepository` are no longer exported from
  Identity's module at all.
- **An idempotency set advertised as bounded was not.** The `forget()` that did
  the bounding was called by nothing but its own spec, so the worker retained
  every event id it had ever seen.
- **The published contract described the machine routes as open.** Only the
  bearer scheme was declared, and a service route carries a header — so the
  document the phone, the extension and the SDK all generate clients from said
  `/internal/*` needed no credential.
- **Two comments claimed writes that no code performs.** The default-password
  flag was described as written to `ops.adminPasswordIsDefault`, and
  `ops.lastBackupAt` as "written by the backup job". Neither is written yet.
  Each now names the phase that owns it — this being the exact failure mode
  where a capability every phase credits to another phase gets built by none.

Two findings were left alone deliberately. A failing webhook subscription still
stamps `outbox.relay` as healthy, because that heartbeat answers "is the relay
looping" and it is — reporting a subscriber outage there would make every n8n
hiccup look like a platform failure. An exhausted ladder is logged as an error
instead, and a signal of its own belongs with the admin overview. And the scrypt
cost is one notch below current OWASP guidance but is the RFC 7914 interactive
baseline; the hash carries its parameters, so raising it later is a rehash on
next sign-in rather than a migration.

Everything above was verified by the suite afterwards: 249 tests pass (up from
241), `pnpm lint` reports 0 warnings and 0 errors, `tsc --noEmit` is clean.

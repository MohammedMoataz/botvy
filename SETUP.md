# Setting up Botvy v2

Everything needed to bring the platform up on one machine, verify it is
actually working, and get it back after something goes wrong.

v1 is still here, under `legacy/`, and still runs. Its own guide is
`legacy/SETUP.md`.

## What you need first

| | |
|---|---|
| **Docker** | Compose v2. On Linux or WSL2 for a machine that runs unattended; Docker Desktop is fine for development. |
| **Node 24** | Only for the developer loop and the two scripts in `infra/`. The containers carry their own. |
| **pnpm 9.15** | `corepack enable` is enough — the version is pinned in `package.json`. |
| **Ollama** | Host-native, with the models named in the settings registry pulled. It stays outside Docker so it can reach the GPU. |
| **Flutter** | Only to build the phone app. |

A tunnel is optional. Without one the platform is reachable on the LAN; with
one it is reachable from anywhere, still through the single published port.

## Bringing it up

```bash
cp infra/.env.example .env
# Fill in every value marked REQUIRED. For the secrets:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

docker compose --env-file .env -f infra/docker-compose.yml up -d --build
node infra/bootstrap.mjs
node infra/verify.mjs
```

`bootstrap.mjs` waits for the stores, applies both sets of migrations, checks
that the machine credential answers, and imports the workflows. It is safe to
run again — and `verify.mjs` proves that by running it a second time and
requiring that nothing changed.

`verify.mjs` is the gate. It checks four things and prints the elapsed time:

- every container healthy,
- **exactly one port published beyond loopback**, which is Caddy,
- both stores answering through `/health`,
- and that second bootstrap run changing nothing.

If it exits non-zero, do not go further — each line names what failed.

### Signing in

The seed creates the account named by `ADMIN_EMAIL` on first boot, with
`ADMIN_PASSWORD`. It never resets that password afterwards, so one you change
in the portal survives every restart. While the password is still the default,
the portal says so on every page and the boot log repeats the warning. Change
it.

Deleting that account brings it back on the next start, because it is a
*default*. Point `ADMIN_EMAIL` at a different address if that is not what you
want.

## Three kinds of configuration

Knowing which is which saves a redeploy:

| Kind | Lives in | Changed by |
|---|---|---|
| Secrets, connection details | `.env` | editing the file and restarting |
| Anything an operator retunes | the settings registry | the admin portal, no restart |
| Anything a member wants different | their preferences | the member, in the app |

If you find yourself wanting to add a tunable to `.env`, it probably belongs in
the registry. A value that needs a deploy to change is a value nobody changes.

## Backups, and getting your data back

Both stores are dumped nightly to `backups/`, and each archive is read back
immediately after it is written. A backup nobody has opened is a hope, not a
backup.

Retention and the staleness warning are settings keys — `backup.retentionDays`
and `backup.staleHours` — so you can retune them from the portal. When the
schedule matters, `BACKUP_CRON` is in `.env`, because the job is a container
rather than the API.

### Restoring

Restore **both** stores from the same night. `userId` in MongoDB is the
PostgreSQL uuid and there is no join to rebuild the link from, so restoring one
alone leaves accounts whose data is gone, or data whose accounts are.

```bash
# Stop everything that writes, so nothing is half-restored.
docker compose --env-file .env -f infra/docker-compose.yml stop backend worker

# Identity.
docker compose --env-file .env -f infra/docker-compose.yml exec -T postgres \
  pg_restore --clean --if-exists --dbname "$DATABASE_URL" < backups/identity-<STAMP>.dump

# Everything else.
docker compose --env-file .env -f infra/docker-compose.yml exec -T mongo \
  mongorestore --uri "$MONGO_URL" --archive --gzip --drop < backups/botvy-<STAMP>.archive.gz

docker compose --env-file .env -f infra/docker-compose.yml start backend worker
node infra/verify.mjs
```

Try this before you need it. A restore procedure that has never been run is a
document, not a capability.

### Restoring onto a different machine

The dumps carry no host names, but several things around them do: the tunnel
hostname, `CADDY_SITE`, `CORS_ORIGINS`, and the address baked into any phone
build. Update `.env` first, then restore.

## Releasing and deploying

Push a tag beginning with `v` and CI builds both images, the release APK and
the extension zip, then deploys if `DEPLOY_HOST` is configured. Without it the
deploy step is skipped rather than failed, so a clone can cut a release without
owning a host.

The running version is one line in `.env`:

```
BOTVY_TAG=v2.0.0
```

**Rolling back** is re-pinning the previous tag and pulling — images are
immutable, so the old one is still in the registry:

```bash
sed -i 's/^BOTVY_TAG=.*/BOTVY_TAG=v1.9.0/' .env
docker compose --env-file .env -f infra/docker-compose.yml pull
docker compose --env-file .env -f infra/docker-compose.yml up -d
```

That rolls back the *code*. It does not roll back the database: migrations only
go forward, by design, so a release whose migration you cannot live with is a
restore-from-backup, not a rollback. Which is why the restore above is worth
rehearsing.

## When something is wrong

`GET /health` is the first place to look. It reports both stores, the model
server, whether push is configured, and every scheduled job with the time it
last succeeded. A job that has gone quiet longer than `ops.staleAfterMinutes`
is marked stale and the whole status degrades — that is the platform telling
you something stopped arriving, which is the failure that otherwise goes
unnoticed for days.

A few readings worth recognising:

- **`pushConfigured: false` and `status: ok`** — no Firebase credentials. That
  is a working system without notifications, not a broken one.
- **The process refusing to start, naming a credentials file** — the file is
  set but unreadable. Naming it is a declared intent to have push, so the
  process stops rather than starting silently unable to notify anyone.
- **`outbox.relay` stale** — the worker is not delivering. Events are safe in
  the outbox and will be delivered when it comes back; nothing is lost.
- **`ollama` false** — the model server is unreachable. Chat and extraction
  stop; reminders, plans and sync carry on.

## Where things are

`README.md` has the map of the repository. The rules every change is held to
are in `.specify/memory/constitution.md`, and `CLAUDE.md` records the things
that are easy to get wrong here — each one written in the words of the bug that
taught it.

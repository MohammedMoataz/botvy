# Restoring Botvy

The procedure, written to be followed by somebody who did not build the system
and is having a bad day. Read it once now; the rehearsal in `specs/025` is what
turns it from a document into a capability.

A restore procedure that has never been run is a hope. This one has a rehearsal
task (`T1103`) precisely so that the first time anybody follows it is not the
night it matters.

---

## 1. What you need in front of you

Three things, and the third is the one people discover they are missing at 3 a.m.

### The archives

One dated directory per night, written by the `backups` service under
`BACKUP_DIR` (default `../backups`, a host directory outside the compose
project):

```
20261002T030004Z/
  botvy.archive.gz         # MongoDB — everything that is not Identity
  identity.dump            # PostgreSQL — accounts, refresh tokens, devices, service clients
  media.tar.gz             # uploaded photos and anything else the media proxy serves
  media.tar.gz.sha256      # the checksum the run verified
```

**Take all of one night, never a mixture of nights.** `userId` in MongoDB is
the PostgreSQL uuid and there is no join to rebuild the link from, so restoring
one store from Tuesday and the other from Wednesday leaves accounts whose data
is gone, or data whose accounts are — silently, with no error anywhere.

### The secrets

The archives contain no secrets, and are useless without them. **These are not
in the backup and must be kept somewhere else**, in a password manager or a
sealed envelope:

| Secret | What breaks without the original |
|---|---|
| `JWT_ACCESS_SECRET` | nothing permanent — everyone is signed out |
| `JWT_REFRESH_SECRET` | every stored refresh token in the restored database is unusable; every member and every phone signs in again |
| `MEDIA_SIGNING_SECRET` | every media URL already issued stops verifying |
| `AUTOMATION_WEBHOOK_SECRET` | every subscriber rejects your deliveries as unsigned |
| `INTERNAL_SERVICE_TOKEN` | the scheduled jobs stop authenticating; the automation tool holds the old value |
| `N8N_ENCRYPTION_KEY` | **the automation tool cannot read its own stored credentials** and every workflow fails |
| the database passwords | the restored `DATABASE_URL` will not connect |

The last one deserves its own line: n8n encrypts its credentials at rest with
`N8N_ENCRYPTION_KEY`, so an n8n data volume restored without its key is a set of
workflows that cannot run and cannot be repaired except by re-entering every
credential by hand.

### The machine

Docker with the compose plugin, and enough disk for both dumps uncompressed.
Everything else comes out of the images.

---

## 2. Restoring onto the same machine

```bash
# 1. Stop everything that writes, so nothing is half-restored. Leave the stores up.
docker compose --env-file .env -f infra/docker-compose.yml stop backend worker

# 2. Identity.
docker compose --env-file .env -f infra/docker-compose.yml exec -T postgres \
  pg_restore --clean --if-exists --dbname "$DATABASE_URL" \
  < ../backups/<NIGHT>/identity.dump

# 3. Everything else.
docker compose --env-file .env -f infra/docker-compose.yml exec -T mongo \
  mongorestore --uri "$MONGO_URL" --archive --gzip --drop \
  < ../backups/<NIGHT>/botvy.archive.gz

# 4. The media. Check the checksum first — this is the one archive whose
#    verification was a checksum rather than a parse, so it is the one that can
#    have rotted quietly.
cd ../backups/<NIGHT> && sha256sum -c media.tar.gz.sha256 && cd -
docker run --rm -v botvy-v2_media:/data/media -v "$(pwd)/../backups/<NIGHT>:/in:ro" \
  alpine sh -c 'cd /data/media && tar -xzf /in/media.tar.gz'

# 5. Back up.
docker compose --env-file .env -f infra/docker-compose.yml start backend worker
node infra/verify.mjs
```

`--clean --if-exists` and `--drop` are what make this repeatable: a restore that
merged into what was already there would leave rows from two different days in
one database, which is worse than either.

### Confirming it worked

Not "the containers started" — that is not the question:

1. `curl -s http://localhost:${EDGE_PORT:-80}/health` reads `ok`, with every job
   present. The `backup` job will read stale until the next night runs, which is
   correct and expected.
2. Sign in as a member who existed before the backup. Their tasks, meetings and
   conversations are there.
3. Open a photo. If it 404s, the media step was skipped or the volume name was
   wrong.
4. Take a phone that last synced **before** the backup was taken and let it sync.
   It should reconcile to a complete picture rather than pushing its local rows
   as new ones. This is the check that catches a restore that looks fine from a
   browser.

---

## 3. Restoring onto a different machine

The dumps carry no host names. Several things around them do, and every one of
them is a thing that will appear to work until somebody tries it from outside:

| What | Where | Symptom if it still names the old machine |
|---|---|---|
| Tunnel hostname and credential | `TUNNEL_TOKEN` in `.env`, and the tunnel's own configuration at the provider | nothing is reachable from outside, or the old machine is |
| Edge site address | `CADDY_SITE` in `.env` | Caddy tries to obtain a certificate for a name that no longer points here |
| Allowed browser origin | `CORS_ORIGINS` in `.env` | the portal loads and every request from it is refused |
| The address the phone points at | baked into the app build (`--dart-define`), and changeable in its settings | the app signs in against the old machine, or nothing |
| The address the extension points at | the gateway the member set in the side panel | same |
| Sign-in provider callback | the Google client's authorised origins and redirect URIs | Google sign-in fails and password sign-in still works, which makes it look like a Google outage |
| Published port | `EDGE_PORT` in `.env` | a port conflict on a machine that runs something else on 80 |

Update `.env` **before** restoring, then follow section 2. Then re-run
`node infra/bootstrap.mjs` so the automation tool's workflows point at the new
address, and check the automation page in the portal reads something other than
"not answering".

If the old machine still exists, turn its tunnel off before starting the new
one, or two installations will answer for the same hostname and which one a
member reaches will depend on the weather.

---

## 4. Rolling back a release

A rollback and a restore are different operations and it matters which one you
are doing. A rollback puts the *code* back; it does not put the *data* back.

```bash
# Re-pin the previous tag — images are immutable, so the old one is still there.
sed -i 's/^BOTVY_TAG=.*/BOTVY_TAG=v2.0.0/' .env
docker compose --env-file .env -f infra/docker-compose.yml pull backend worker
docker compose --env-file .env -f infra/docker-compose.yml up -d --force-recreate backend worker
```

`--force-recreate` is not decoration. `up -d` on a service whose configuration
has not changed leaves the running container alone, and a pull followed by a
restart that did nothing looks exactly like a successful rollback.

### The schema is never rolled back

Migrations in this platform are forward-only, on both stores, and a rollback
does not undo them. So after re-pinning, **the previous release's code is
running against the current release's schema.**

That is safe where the release's migrations were *additive* — a new collection,
a new index, a new optional field — because the old code simply does not read
them. It is not safe where they were not: a field the new code made required, a
collection renamed, a document shape changed in place. The release notes say
which, and when they do not, assume the worse case.

Where it is not safe, **restoring the last verified backup is the only way
back**, and it costs everything written since that backup was taken. That is the
real price of a rollback and the reason to read the migration before deploying
rather than after.

---

## 5. If the restore itself fails

- **`pg_restore` complains about existing objects** — you ran it without
  `--clean --if-exists`. Drop and recreate the database, then run it again.
- **`mongorestore` reports "E11000 duplicate key"** — you ran it without
  `--drop` onto a database that already had rows. Same fix: restore into an
  empty one.
- **The checksum on the media archive does not match** — that night's media copy
  is corrupt. Take the media from an earlier night; it is the one archive where
  mixing nights is survivable, because the files it holds are immutable once
  written and an older copy simply has fewer of them.
- **Health reads degraded with every job stale** — expected immediately after a
  restore. The heartbeats are rows in the database you just replaced, and they
  carry the times of the runs on the *old* machine. They clear as each job runs.
- **Nothing at all connects** — check `.env` is the one that matches these
  archives. A restore into a database whose password came from a different
  installation fails at connect, not at restore.

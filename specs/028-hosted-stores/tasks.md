# Tasks: The stores leave the machine

**Input**: `spec.md`, `plan.md`.

**Tests**: the URL guard has a spec; the compose file is checked with `config`
in both modes; the gate runs against the managed stores; the backup and the
restore are performed, not described.

**Task ids** are local to this phase.

## Phase 1 — Code (US1)

- [x] T2801 `env.schema.ts`: `MONGO_URL` MUST name a database in its path;
  refused at boot naming the variable and the split it prevents. `spec:` an SRV
  URL with `/botvy` accepted; four shapes without a name refused
  (`env.spec.ts`)
- [x] T2802 `mongoose.module.ts`, `migrate-mongo-config.cjs`: drop the
  hard-coded `directConnection`; the URL carries every driver option
- [x] T2803 `infra/docker-compose.yml`: `postgres` and `mongo` behind
  `profiles: [local-stores]`; `required: false` on every `depends_on` naming
  them; `POSTGRES_*` defaulted rather than required; n8n on SQLite; the initdb
  hook and `N8N_DB` deleted. `check:` `compose config --services` lists six
  services without the profile and eight with it
- [x] T2804 `infra/backup/Dockerfile`: PostgreSQL's repository,
  `postgresql-client-${PG_CLIENT_MAJOR}` (18 — Neon created the project on 18)
- [x] T2805 `infra/bootstrap.mjs`: `waitForStores` asks `/health` for both
  store flags instead of compose for two service names
- [x] T2806 `infra/.env.example`: managed URLs first, the profile's local ones
  as a comment, `N8N_DB` gone
- [x] T2807 `.github/workflows/ci.yml`: `COMPOSE_PROFILES=local-stores` and the
  local `MONGO_URL` in the e2e job's `.env`

## Phase 2 — The claim (US3)

- [x] T2810 Constitution 2.2.0: I admits a managed store with the API as its
  only client; V drops the two stores from the "Docker network or localhost"
  list and says a store is never a port this stack publishes; sync-impact
  entry; CLAUDE.md's summary line
- [x] T2811 `README.md`: where the code runs, where the data lives
- [x] T2812 `SETUP.md`: prerequisites (Compose ≥ 2.20, the two databases or
  the profile), "where the data lives" and the no-internet consequence,
  creating the two databases, the profile, backups (the providers' nets are
  not yours), the restore commands
- [x] T2813 `docs/restore.md`: the stores are wherever `.env` points; restore
  runs in the `backups` image; the URL row in the different-machine table; the
  version-mismatch entry
- [x] T2814 `docs/security-review.md`: the trust boundary paragraph; §1 table;
  the store-password row says what is true now and names the controls; the
  slow-log residual on a managed cluster
- [x] T2815 `frontend/messages/{en,ar}.json`: headline and body
- [x] T2816 CLAUDE.md: four new "easy to get wrong" bullets
- [x] T2817 The three artifact pages, sentence-level: landing rail and
  standfirst, architecture §1 stores and process table, blueprint A2 topology
  (53 edits, each asserted to match exactly once; roadmap chips P0–P10 marked
  landed)

## Phase 2b — Attachments behind a storage provider (Owner's ask, 2026-09-25)

- [x] T2830 `shared/storage/`: a `StorageProvider` port (`put · remove · read ·
  url`), the filesystem adapter over `MEDIA_DIR` with a traversal guard, and
  `GET /media/files?key&sig` serving a signed key immutable; bound once in a
  global `StorageModule` imported by both roles. `spec:` signed key served as
  its type; wrong signature is 400 not 403; missing key 404; the URL the
  provider mints is the one the route accepts; a key escaping the root is
  refused
- [x] T2831 Profile: `PhotoStore` gains `url()`; `StoredPhotoStore` keeps the
  WebP/EXIF/hash policy and delegates the bytes; the query handler fills
  `photoUrl` from the store; the fixed `/api/v1/profile/photo` constant is
  gone from the response (the route itself stays). `spec:` a profile with a
  photo answers the store's URL and never the path; one without has no
  `photoUrl`
- [ ] T2832 029 becomes: a `SupabaseStorageProvider` implementing the same
  port, chosen by `StorageModule`'s factory — nothing in Profile changes

## Phase 3 — Cut-over (US1, US2) — needs the Owner's connection strings

- [x] T2820 Neon: project `withered-hall-53563348` (`aws-us-east-2`, PostgreSQL
  18.6 — one major above the plan's guess, so the backup client moved to 18),
  database `botvy`, the direct connection string with
  `sslmode=require&connect_timeout=15` in `.env`. The timeout is a finding: on
  the first boot the backend timed out on Prisma's default five seconds while
  the compute woke, and the worker, a moment later, found it awake
- [x] T2821 Atlas: `M0` (`atlas-11f5t3-shard-0`, MongoDB 8.0.32, three nodes),
  read/write user, the SRV string with `/botvy` in `.env`; reachable from the
  host and from inside a container. Finding: Node on this host resolves through
  a local proxy (`127.0.0.1`) that refuses SRV queries — the containers do not
- [x] T2822 *Optional* carry-over — declined: the Owner chose a fresh start.
  The local volumes stay untouched until T2828
- [x] T2823 `down` → `up -d --build` → `bootstrap.mjs` (both migration sets
  applied, seeds ran, service client answers 201) → `verify.mjs` **5/5**; P1
  13/13, P2 14/14, P4 18/18 against the managed stores. Found on the way: a
  rebuilt image does not recreate a running container — `up -d --build` left
  both processes on the old image, and `--force-recreate` is the deploy. The
  n8n first run and its API key are still the Owner's (`127.0.0.1:5679`); then
  `bootstrap.mjs` imports the six workflows
- [x] T2824 `scan-logs.mjs --since 2h --canary`: 5 sources, 1664 lines, canary
  present, **0 hits** — no connection string in any container's log
- [x] T2825 `backup.sh` by hand: the first run refused its own empty media tar
  (fixed — `grep -c` prints `0` *and* exits 1, so the fallback doubled it), the
  second **written and verified** in 37 s. Restored into the managed stores:
  992 Mongo documents, Identity, media checksum OK, the administrator signs in
  — **T1103 of P11, performed**, 79 s. `pg_restore` exited 1 over two Neon
  grants (`ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin …`) that
  `botvy_owner` cannot re-apply; dump and restore run `--no-owner --no-acl`
  now, in the script and in both documents
- [ ] T2826 Cut the connection to Atlas for a minute during the gate; the relay
  reconnects and the next outbox row is delivered — not performed; the relay's
  reconnect is covered by its spec, and the free cluster gave no maintenance
  window to observe
- [x] T2827 Measurements in `spec.md`, cold and warm. The finding is the
  200-row push at 66 s: one transaction per pushed row × one internet round
  trip; a Sync change (one transaction per entity per push), not a store one
- [ ] T2828 `docker volume rm botvy-v2_pg_data botvy-v2_mongo_data` — the
  rehearsal has happened, so the condition is met; the Owner asked for unused
  volumes to go

## Follow-ups named, not started

- **029** Supabase Storage for profile photos: one `PhotoStore` adapter, a
  bucket, two environment variables, the `media` volume and `backup.sh`'s
  media step retired.
- `FORWARDER_POLL_MS` as a settings key, only if Neon's compute cost proves
  real.

## Phase 4 — what CI found after the tag (2026-09-25)

`v2.2.0` was tagged from a commit whose CI then went red in two jobs. Both are
recorded here because both are the same shape: a value written twice, and a
fixture that only held on some days.

- [x] T2833 `/health` reported the wrong version. `BOTVY_VERSION` was a
  hand-written literal beside `package.json`, and `health-version.spec.ts`
  exists precisely because it read `2.0.0` for all of 2.1.0 — this time it read
  `2.1.0` into the 2.2.0 release, and the spec caught it *after* the images were
  built and pushed. The constant now walks up from `import.meta.url` to the
  package named `@botvy/backend` and reads its version, so there is one copy;
  proven against the **compiled** output (`dist/` answers `2.2.1`), because the
  hop count differs between `src/` and `dist/` and the image keeps the file at
  `/app/package.json`
- [x] T2834 The mobile SC-003 benchmark's fixture shrank on late dates. Its
  three series were anchored twenty days before `now`, but the calendar window
  starts at the first of the month minus seven days — up to thirty-eight days
  back — so the fixture held its two hundred occurrences early in a month and
  about a hundred and eighty late in one. Anchored forty days back now. The
  lesson is a sharper version of the one the alert fixtures taught: relative to
  `now` is necessary and not sufficient; the offset has to clear the *widest*
  window `now` can produce
- [x] T2835 Released as `v2.2.1` rather than moving the `v2.2.0` tag: its images
  are pushed and immutable, and a tag that moves is what makes "which build is
  this" unanswerable — the question `/health`'s version exists to answer

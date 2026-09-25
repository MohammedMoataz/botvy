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
  `postgresql-client-${PG_CLIENT_MAJOR}` (17)
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

## Phase 3 — Cut-over (US1, US2) — needs the Owner's connection strings

- [ ] T2820 Neon: project in the nearest region, database `botvy`, the direct
  connection string with `sslmode=require` in `.env`
- [ ] T2821 Atlas: `M0` in the same region, a read/write user on `botvy`, the
  Network Access rule, the SRV string with `/botvy` in `.env`
- [ ] T2822 *Optional*: a last local night — run `backup.sh` by hand in the old
  `backups` container — restored into the managed stores with the new commands
  before the first boot, so the migrators find nothing to apply
- [ ] T2823 `down` (volumes kept) → `up -d --build` → `bootstrap.mjs` → n8n
  first run at `127.0.0.1:5679` (owner, API key into `.env`) → `bootstrap.mjs`
  again → `verify.mjs`: four PASS lines
- [ ] T2824 `scan-logs.mjs --canary` with the new URLs in the environment: no
  password in any container's log
- [ ] T2825 One `backup.sh` run by hand: three archives verified, `backup`
  heartbeat ok; then the restore from that night into the managed stores,
  `verify.mjs` green, a member signs in — **T1103 of P11, performed**; elapsed
  times into `spec.md`
- [ ] T2826 Cut the connection to Atlas for a minute during the gate; the relay
  reconnects and the next outbox row is delivered
- [ ] T2827 Measurements into `spec.md`: `/sync` 200 rows, one coach turn,
  before and after
- [ ] T2828 Only after T2825: `docker volume rm botvy-v2_pg_data
  botvy-v2_mongo_data` — the Owner runs it

## Follow-ups named, not started

- **029** Supabase Storage for profile photos: one `PhotoStore` adapter, a
  bucket, two environment variables, the `media` volume and `backup.sh`'s
  media step retired.
- `FORWARDER_POLL_MS` as a settings key, only if Neon's compute cost proves
  real.

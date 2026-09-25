# Feature Specification: The stores leave the machine

**Feature Branch**: `028-hosted-stores`

**Created**: 2026-09-25

**Status**: In progress (follows P11; not a blueprint phase)

**Input**: the Owner's decision of 2026-09-25 — "Neon for identity, Atlas for
Mongo; the backend stays on my machine; rewrite the claim."

## Why this feature exists

v2 promised that nothing left the owner's machine, and built it that way: both
stores were containers on the compose network with no published port. The Owner
has decided the two databases are better run by somebody whose job that is —
Identity in a Neon PostgreSQL project, everything else in a MongoDB Atlas
cluster — while the API, the worker, the edge, the automation tool and the
model stay exactly where they were.

That is a small change to the code and a large change to a sentence. The code
change is two connection strings and the handful of places that assumed the
stores were containers with known names. The sentence is the one every page,
the README, the constitution and the security review repeat, and a promise the
software no longer keeps is worse than the software never having made it. Both
halves land in this phase.

Supabase, which the Owner also has, does nothing here. Its storage could hold
profile photos, which are the one member artefact still on the machine after
this phase; that is a follow-up with its own adapter behind the existing
`PhotoStore` port. Its authentication is not wanted: replacing Identity's own
tokens, rotating refresh and server-side Google verification would rewrite the
context and break constitution VI.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Bring the platform up against the managed stores (Priority: P1)

The Owner creates a Neon project and an Atlas cluster, writes the two
connection strings into `.env`, and runs the same three commands as before. The
platform comes up, the gate passes, and nothing on the machine holds member
data except the photos.

**Independent Test**: from a clean checkout with only the two connection
strings, `up -d --build`, `bootstrap.mjs`, `verify.mjs` — four PASS lines.

**Acceptance Scenarios**:

1. **Given** the two URLs in `.env` and no `postgres`/`mongo` container,
   **When** the stack starts, **Then** `/health` reports both stores up and the
   gate's "exactly one public port" check still names Caddy alone.
2. **Given** an Atlas SRV string with no database in its path, **When** the
   backend starts, **Then** it refuses to start and names `MONGO_URL` and the
   reason.
3. **Given** the `local-stores` profile, **When** CI or an Owner starts the
   stack, **Then** the two containers run and everything behaves as it did
   before this phase.

### User Story 2 — Last night's backup still restores (Priority: P1)

The nightly dump runs against the managed stores from this machine, verifies
its archives, and the documented restore puts a night back into them.

**Independent Test**: run `backup.sh` once by hand; restore that night with the
commands in `docs/restore.md`; `verify.mjs` green; a member signs in and sees
their data. This is P11's T1103, performed rather than deferred.

**Acceptance Scenarios**:

1. **Given** a Neon project on PostgreSQL 17, **When** the nightly runs,
   **Then** `pg_dump` succeeds — the client is at least the server's major.
2. **Given** a night's archives, **When** the restore commands run, **Then**
   they write into the stores the two URLs name without `exec`-ing into any
   container.

### User Story 3 — The documentation tells the truth (Priority: P2)

A person reading the landing page, the README, the constitution or the security
review learns where their data actually is.

**Acceptance Scenarios**:

1. **Given** the public page in either language, **When** it describes privacy,
   **Then** it says the model and the conversation stay on the machine and the
   data is in databases the Owner holds the keys to — and nothing else.
2. **Given** the security review's credential table, **When** it lists the store
   passwords, **Then** it says what is true now: that credential alone is the
   whole platform, and names the controls.

## Requirements *(mandatory)*

- **FR-001** The only configuration the platform holds about a store is its
  connection string. No code names a host, a container or a driver option that
  only one kind of store accepts.
- **FR-002** `MONGO_URL` MUST name a database in its path; the API refuses to
  start otherwise, naming the variable.
- **FR-003** The compose file serves both installs: managed stores by default,
  containers behind `--profile local-stores`, with no variable that only the
  profile needs being required outside it.
- **FR-004** The bootstrap waits for the stores by asking the API, not compose.
- **FR-005** The backup image's PostgreSQL client is at least the major of the
  server it dumps, pinned in one place.
- **FR-006** The restore procedure runs its tools from the `backups` image
  against the two URLs, and is the same procedure for both installs.
- **FR-007** n8n keeps its own state in its own volume (SQLite) and no longer
  shares a database server with Identity.
- **FR-008** Constitution I and V, README, SETUP, the security review, the
  landing copy in both languages and the three non-historical artifact pages
  describe the hosted stores; III is unchanged.
- **FR-009** CI runs the `local-stores` profile and is otherwise untouched.
- **FR-010** Attachment bytes sit behind one storage provider with one adapter
  per place they can be, and a client is handed a URL it can load with no
  session — never a path. The filesystem adapter's URL is a signed route on
  this API; an object store's is whatever it mints; Profile does not know
  which.

## Success Criteria *(mandatory)*

- **SC-001** `verify.mjs` passes against Neon + Atlas with no store container
  running, and passes against the profile with both running.
- **SC-002** A `MONGO_URL` without a database is refused at boot, with a test.
- **SC-003** One nightly backup and one restore performed against the managed
  stores, elapsed time recorded below.
- **SC-004** A 200-row `/sync` push and one coach turn measured before and
  after, recorded below; region choice revisited if the sync exceeds 3 s.
- **SC-005** `grep -ri "own machine\|nothing leaves\|leaves the host"` over
  README, SETUP, the constitution, the security review and `frontend/messages`
  finds only sentences that are still true.

## Residual risks, stated

| Risk | What it costs | What is done about it |
|---|---|---|
| Every store round trip crosses the internet | tens of milliseconds per query; `/sync` and a chat turn are the two paths that do many | region nearest the Owner; measured (SC-004) |
| Neon's compute never autosuspends | `identity-outbox-forwarder.ts` polls every 2 s and the portal polls `/health` every 30 s; on a free tier that is more compute-hours than the allowance | named; the poll is a constant today — becomes a knob only if the cost is real |
| Atlas `M0` has no backups | provider offers nothing to restore from | the nightly `mongodump` stays, and is the backup |
| Atlas Network Access on a home connection | the address moves; a narrow rule locks the platform out | `0.0.0.0/0` with a long generated password and TLS, said out loud in SETUP |
| Neon's free tier has no address allow-list | the password is the only control | generated, long, held by three processes and nothing else; rotation is provider-side |
| No internet, no server | LAN-only operation without internet is gone | the phone works from its own database; the `local-stores` profile for an install that needs it |
| A hosted change stream closes on maintenance or failover | the outbox relay stops until it reconnects | `relay.runtime.ts` reconnects with backoff; verified by cutting the connection during the gate |
| n8n's move to SQLite is a fresh instance | executions history gone; owner setup and API key redone once | workflows come from git; `bootstrap.mjs` re-imports them |
| Compose older than 2.20 | `depends_on … required: false` is a parse error | prerequisite stated in SETUP |

## Measurements

Filled in at cut-over.

| What | Before (containers) | After (managed) |
|---|---|---|
| `/sync` push, 200 rows | | |
| Coach turn, first token | | |
| Coach turn, complete | | |
| Nightly backup, elapsed | | |
| Restore, elapsed | | |

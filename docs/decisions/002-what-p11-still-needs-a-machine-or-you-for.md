# What P11 still needs a machine, or you, for

Everything in this file is blocked on something that is not code. Each entry
says what it is waiting for, what was built so the wait is the only remaining
cost, and the exact command that closes it.

## The machine

**Docker's engine does not start on this host.** The desktop processes are
running, `com.docker.service` — the privileged half — is `Stopped`, and starting
it needs elevation this session does not have:

```
Start-Service com.docker.service
FAILED: Cannot open com.docker.service service on computer '.'
docker version → request returned 500 Internal Server Error
```

So no container ran during this work. Everything below that says "needs the
stack" means exactly that and nothing worse. From an elevated PowerShell:

```powershell
Start-Service com.docker.service
docker compose -p botvy-v2 -f infra/docker-compose.yml up -d
node infra/verify.mjs
```

## The tasks

### T1103 — the restore rehearsal · needs the stack, on a second machine

`docs/restore.md` is written and `infra/backup.sh` verifies every archive it
makes. What has never happened is the rehearsal itself: restore onto a clean
machine following only the written procedure, sign in as an existing member,
confirm a phone that last synced before the backup reconciles to a complete
picture, and record the elapsed time and every correction the procedure needed.
An untested backup counts as no backup, which is this phase's own sentence.

### T1112 — the log-scrubbing pass · needs a day of logs from running containers

The pass is now a command rather than a paragraph:

```bash
node infra/scan-logs.mjs --since 24h --canary "<a sentence planted in a seeded conversation>" --out gate-logs/scrub-$(date +%Y%m%dT%H%M%SZ).log
```

It reads the edge, the API, the worker, the automation tool and both database
containers, and looks for a JSON Web Token's three segments, a `Bearer ` with a
value, the named secret fields, an email address, a push registration token's
shape, and the canary. It prints no match — only the rule, the source, the line
and a masked excerpt — because a gate log that quotes the token it found has
moved the secret rather than reported it.

Run against the 23 committed `gate-logs/` files it reports **0 hits** with the
three documented allow rules in `infra/scan-logs.allow.txt`. That is the tooling
proven, not the pass performed: those are gate transcripts, not a day of the
platform's own logs. Plant the canary **before** the sample window opens, or the
run searches for member content by shape alone and says so in its summary.

### T1113 — rotating the inherited key · needs you

This is the one item in P11 that nobody but the account holder can do. It needs
the provider's console: issue a new service-account key, delete the old one,
install the new one, confirm notifications still arrive, and confirm the old key
is refused. It was deferred once at your explicit instruction and it is still
deferred; nothing here has touched it, and no automation should, because a
credential rotation performed by an unattended session is a credential rotation
nobody witnessed.

When it is done, `SETUP.md`'s deferred-rotation section and its entry in the
contents are deleted in the same change — a document still calling a live key
compromised is worse than one that never raised it.

### T1142 — publishing the release · already done, at a different number

The task says publish `v2.0.0`. The repository is at **2.1.0** and the tag is
pushed: `v2.1.0` exists locally and on `origin`, `.github/workflows/release.yml`
builds both images, the APK and the extension zip on any `v*` tag, and the four
artefacts carry the same number (`backend/package.json`, `extension/package.json`,
`mobile/pubspec.yaml`, the image tags). The two release fixes that preceded this
work — the APK's server address and the extension's gateway URL — are why the
number moved. The task's text is corrected in `specs/025-hardening-release/tasks.md`
rather than left naming a version that is now behind.

### T1143, T1144 — the fresh-install rehearsal and the rollback · need the stack and a host

Both are performed, not described: a clean machine reaching a healthy system
from the published release and `SETUP.md` alone; the published app on a clean
device and the published extension on a clean browser profile, each pointed at
that system's address without being rebuilt; then the rollback exercised in both
directions on the host. Nothing is missing from the code for either.

### T1150 – T1155 — measurement and the soak · need a deployed system, and seven days

The daily sample is a command now:

```bash
node infra/soak-sample.mjs --url http://localhost/health --version 2.1.0
```

It appends one row to `ops/soak-2.1.0.log`, names every stale job rather than
printing a bare verdict, writes the row even when the sample fails — a soak
whose bad days are missing is a soak that always passes — and exits non-zero so
a scheduler fails loudly. Seven consecutive rows are the record.

The right-to-left sweep (T1152) needs the released build on a device in hand.
The measurements (T1150, T1151) need a running system to measure; the table they
fill is in the blueprint's own `tasks.md`.

## What that leaves

Every P11 item that could be closed without a container or your account has
been. What remains is a rehearsal, a day of logs, a key only you can rotate, a
deploy, and seven days of clock.

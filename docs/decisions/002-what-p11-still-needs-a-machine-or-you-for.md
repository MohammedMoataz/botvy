# What P11 still needs a machine, or you, for

Everything in this file is blocked on something that is not code. Each entry
says what it is waiting for, what was built so the wait is the only remaining
cost, and the exact command that closes it.

## The machine

**Docker came back while this work was running**, so most of what was blocked is
now done and recorded in `specs/025-hardening-release/tasks.md`: the stack is up,
`node infra/verify.mjs` passes 5/5, the log-scrubbing pass ran and found
something, every phase gate P1–P8 ran, and the portal and CSP end-to-end suites
ran against it for the first time.

One thing about the stack is worth knowing before you trust it again: **n8n had
no owner account and no workflows.** Its data volume had been recreated at some
point, so the API key in `.env` belonged to an installation that no longer
existed and `bootstrap.mjs` answered `401` when it tried to import the workflows
— which means no scheduled job had run since. The owner is set up from
`N8N_OWNER_EMAIL`/`N8N_OWNER_PASSWORD`, a key was minted and written into `.env`
(the file is git-ignored; the old key was deleted at n8n), and the six workflows
are imported and five are active. This is the exact shape of the silent-401
failure `CLAUDE.md` already records once.

## The tasks

### T1103 — the restore rehearsal · needs the stack, on a second machine

`docs/restore.md` is written and `infra/backup.sh` verifies every archive it
makes. What has never happened is the rehearsal itself: restore onto a clean
machine following only the written procedure, sign in as an existing member,
confirm a phone that last synced before the backup reconciles to a complete
picture, and record the elapsed time and every correction the procedure needed.
An untested backup counts as no backup, which is this phase's own sentence.

### T1112 — the log-scrubbing pass · **done, and it found something**

The pass is a command rather than a paragraph:

```bash
node infra/scan-logs.mjs --since 24h --canary "<a sentence planted in a seeded conversation>" --out gate-logs/scrub-$(date +%Y%m%dT%H%M%SZ).log
```

It reads the edge, the API, the worker, the automation tool and both database
containers, and looks for a JSON Web Token's three segments, a `Bearer ` with a
value, the named secret fields, an email address, a push registration token's
shape, and the canary. It prints no match — only the rule, the source, the line
and a masked excerpt — because a gate log that quotes the token it found has
moved the secret rather than reported it.

It was run against the live stack with a canary planted first, and it found
member content in MongoDB's slow-query log — six hits, fixed by `--quiet
--slowms 30000`, re-run clean. The finding, the fix and the residual are in
`docs/security-review.md` §8. Nothing is owed here except the habit: plant the
canary **before** the sample window opens, or the run searches for member
content by shape alone and says so in its own summary.

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

### T1150 — the phase criteria · **run, with two gates to fix rather than two defects**

Every phase gate ran against the stack: P1 13/13, P2 14/14, P3 17/17 (after its
own hour-dependence was fixed), P4 18/18, P7 24/24, P8 21/21. P5 is 25/28 and P6
26/27, and both remainders were chased to the bottom and are the gates' rather
than the product's — the reproductions are in
`specs/025-hardening-release/tasks.md`. P10's portal suite ran for the first
time: 19 passed, 4 skipped, and one failure that is `limits.anonymousPerMinute`
doing its job on a suite that signs in nineteen times in ninety seconds.

### T1151 – T1155 — the blueprint's ten, the sweep and the soak · need a deploy, a device, and seven days

The daily sample is a command now:

```bash
node infra/soak-sample.mjs --url http://localhost/health --version 2.1.0
```

It appends one row to `ops/soak-2.1.0.log`, names every stale job rather than
printing a bare verdict, writes the row even when the sample fails — a soak
whose bad days are missing is a soak that always passes — and exits non-zero so
a scheduler fails loudly. Seven consecutive rows are the record.

`ops/soak-2.1.0.log` has its first row, from this stack, reading `HEALTHY` with
every job fresh.

The right-to-left sweep (T1152) needs the released build on a device in hand —
the portal's and the public site's Arabic pass in the e2e suite, and the phone's
does not, because nothing here can hold a phone. SC-001…SC-010 (T1151) want the
deployed system rather than this one.

## One defect found, and fixed: every admin screen rendered once and never again

Worth reading, because it was the Owner's own screens and nothing said so.

Signing into the portal and landing on `/overview` left the Health panel reading
**"Loading…" for ever**, while `/health` answered `200` every thirty seconds and
no error was raised anywhere:

```
+2s  Health | Loading…      health responses: 20:51:43 200
+10s Health | Loading…                        20:52:13 200
+30s Health | Loading…                        20:52:43 200
```

The cause is one word in the wrong place, repeated eight times:

```tsx
export default observer(function Overview() {
  return (
    <RequireAdmin>
      <OverviewPage />   // ← reads the stores, and is not an observer
    </RequireAdmin>
  );
});
```

`observer` wrapped the outer component, which reads no store at all. The inner
one — which reads `health.report`, the member list, the settings, the queue —
was a plain component, so MobX never subscribed it to anything. Every admin
screen therefore rendered whatever was in the stores at first paint and then
ignored every update: the health panel, the member table, the settings after a
save, the reading queue. `login/page.tsx` was the one page written the other way
round, `export default observer(LoginPage)`, and it is the one page that has
always worked.

All eight are wrapped at the component that does the reading now. The Health
panel fills in within a second — "Healthy", every job named with the time it
last ran — and the portal suite's first case, which is written to catch exactly
this, is green.

**One flake is left in that suite and it is not the product.** Under a full run
the shared administrator account trips the rate limits — `limits.anonymousPerMinute`
is twenty by design — and a page whose read is refused shows the error boundary.
The sign-in helper waits the window out now; a read refused mid-navigation still
fails `SC-004` about one run in two. The suite should use one session and a
back-off rather than nineteen sign-ins; that is P10's to fix and it is written
here so the next red run is recognised rather than re-diagnosed.

## What that leaves

Every P11 item that could be closed here has been. What remains is a restore
rehearsal on a second machine, a fresh-install rehearsal from the published
release, the deploy and its rollback, a key only you can rotate, a phone in
somebody's hand, and seven days of clock.

Two loose threads worth a name, neither of them blocking: **P5's and P6's gates**
assert things their own setup makes untrue, and **P10's portal suite** should
sign in once and reuse the session instead of nineteen times. Both are small, and
both are the kind of red that teaches people to ignore red.

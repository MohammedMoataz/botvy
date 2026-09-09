# 🔨 D1 — Free disk space

> 🔴 **This is the only thing blocking both phases.** Two phases are
> code-complete, 531 tests pass, and neither gate has been run because Docker
> cannot build.

## ☐ Done?

```
DONE:            partly
FREE SPACE NOW:  C: ___ GB    D: ___ GB    E: ___ GB
```

---

## What is wrong

| Drive | Free | Of |
|---|---|---|
| `C:` | 11.9 GB | — |
| `D:` | 4.6 GB → ~12 GB | 464 GB |
| `E:` | 8.1 GB | — |

`D:` at 4.6 GB is what stopped `dockerd` starting at all. Deleting Docker's own
stale 7.36 GB leftover got the daemon up, but container removals still go `Dead`
afterwards, which is the disk again.

## What it costs

Everything below is written and unproven. Not "probably fine" — unproven:

- **P0's T092**, the foundation gate: containers healthy, exactly one non-loopback
  published port, both stores answering, and a second `bootstrap.mjs` run that
  changes nothing.
- **P1's T153**, the phase gate: register on the phone → the member appears in
  the admin Users table with their device → change the password → the second
  device is signed out on its next request. The one flow that exercises
  Identity, Profile, the outbox relay, the portal and the phone together.
- **`bootstrap-on-registered` against a real MongoDB.** Its idempotency is
  specified against an in-memory adapter; the *concurrent* case is enforced by a
  unique index that only exists once a migration has run.

## What would help

Roughly 40–50 GB free on the drive holding Docker's data, and the daemon
restarted. If reclaiming that is hard, `docker system prune -a --volumes` is the
blunt instrument — **but read the warning**:

> ⚠️ `--volumes` deletes v1's data too. v1's Postgres volume is
> `botvy_pg_data`. There is a dump at
> `backups/pre-v2-identity-20260908T181658Z.dump`, but if you want v1 to keep
> running, prune without `--volumes`.

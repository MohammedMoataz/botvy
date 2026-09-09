# Blocked on the host, not on the code

Foundation phase (P0), `specs/014-foundation`.

Everything in this phase is written, committed and passing its own checks. What
remains needs a working Docker daemon, and this machine's Docker has cost about
three hours tonight for reasons that had nothing to do with the project.

This file is the parking place for that. When the host is healthy, the work
below is one command and a paste.

---

## What is blocked

**`T092` — the verification gate.** The last unmarked task in the phase. It
needs the stack up, and the recorded output of the three commands pasted into
`specs/014-foundation/tasks.md`:

```powershell
docker compose --env-file .env --env-file .env.v2 -f infra/docker-compose.yml build backend
docker compose --env-file .env --env-file .env.v2 -f infra/docker-compose.yml build backups
docker compose --env-file .env --env-file .env.v2 -f infra/docker-compose.yml up -d
node infra/bootstrap.mjs
node infra/verify.mjs
```

Build the two images separately rather than with `up -d --build`. Parallel
buildx is what crashed twice tonight.

That run is also the first time these are exercised for real, so treat their
output as findings rather than formalities:

- the fresh PostgreSQL and MongoDB migrations, on empty volumes
- the administrator seed creating `imohammedmoataz@gmail.com`
- the sign-in and password-change endpoints against a live store
- the n8n workflow import, now that it upserts and activates
- the backup sidecar's cron actually firing
- `/health` reporting both stores, and the relay's heartbeat arriving

**The end-to-end spine spec.** `apps/backend/test/spine.e2e.spec.ts` needs
`E2E=1` and a live stack with n8n reachable. Written, never run.

**The store-backed halves of the repository contract tests.** They run when
`MONGO_URL` and `DATABASE_URL` are set, which CI does and this machine has not.
Declared and skipped rather than silently absent.

## Why it was blocked — the actual causes

Recorded because both were host faults that looked like project faults, and the
next person to see a build fail here should check these first.

1. **`com.docker.build` orphaned for six days.** A process from 3 September was
   still holding `\\.\pipe\dockerDesktopBuildServer`, so every newly started
   build service exited 1. That produced two builds dying with
   `target frontend: failed to run Build function: frontend grpc server closed
   unexpectedly`, and finally Docker Desktop refusing to start with
   `running com.docker.build: exit status 1`. Killing the stale pid fixed it.
2. **`D:` at 4.6 GB free of 464 GB**, with Docker's 56 GB image on that drive.
   `dockerd` could not start at all — no entry in its own log — and unmounts
   hung, leaving five containers in `Dead` state with removals that never
   completed. Deleting Docker's own leftover
   `docker_data.vhdx.stale-20260627.bak` (7.36 GB) recovered enough to start.

A third symptom, a dialog about WSL integration with the Ubuntu distro failing
its proxy, was downstream of both and not worth chasing on its own.

## Still worth doing on the host

Neither blocks the gate; both are why tonight happened.

- **`C:` 11.9 GB free, `E:` 8.1 GB free.** The whole machine is close to the
  edge that caused this. `docker builder prune -af` reclaims the cache from four
  failed builds and is safe — it touches no images and no volumes.
- **The WSL integration checkbox** can go back on if wanted
  (Settings → Resources → WSL Integration → Ubuntu). It was never the problem;
  nothing in this project uses it, because Docker is called from Windows.
- **A Linux or WSL2 `docker-ce` host** is what `SETUP.md` already recommends for
  production. On tonight's evidence it is worth it for development here too.

## What is not blocked

Implementation continues. The suite, the linter and the typechecker all run
without a daemon, so later phases can be built and tested normally — only their
own bring-up steps have to wait for the same host.

Nothing in the tree is in a half-finished state: every commit on
`014-foundation` was gated on `pnpm lint` clean, `tsc --noEmit` clean and the
suite green.

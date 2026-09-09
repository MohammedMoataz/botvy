# 🔨 D1 — Docker, and the disk under it

> 🔴 **Live blocker again.** Both gates are one working Docker engine away from
> running. Everything else is done.

## ☐ Done?

```
DOCKER RESTARTED:  (yes / no)
FREE SPACE NOW:    C: ___ GB    D: ___ GB    E: ___ GB
```

---

## 👉 What I need you to do

**Restart Docker Desktop from the tray icon** — Quit, then reopen. If it will
not quit cleanly, reboot.

Its own CLI cannot recover from where it is now: `docker desktop stop` times
out, `docker desktop start` answers "Docker Desktop is already running", and
every engine call fails with

```
open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified
```

Nothing is at risk. The named volumes hold the data and they are untouched;
v1's are namespaced separately and were never involved.

Then tell me and I will run the two gates — `node infra/verify.mjs` and
`node infra/verify-p1.mjs`. Both scripts are written, linted and committed.

## How it got here, including my own bad call

1. Your headroom fix worked. `D:` went 4.6 → 22.6 GB and **the daemon started
   for the first time in days.** The stores came up healthy, and the backend
   image built clean.
2. Recreating two containers wedged the engine: `backend` and `worker` went
   `Dead`, and `docker rm -f` answered "removal already in progress"
   indefinitely. That is the disk-pressure symptom P0 recorded, at
   `C:` 14.2 GB / `E:` 9.1 GB.
3. `docker desktop restart` reported success but the engine came back
   500-ing, then stopped answering its pipe.
4. **I killed `com.docker.build`, and that was a mistake.** Its orphan is what
   wedged this machine on 3 September, so freeing it looked right — instead it
   took the engine's supervisor with it, and the pipe disappeared entirely.
   Docker Desktop has reported itself "already running" with no engine behind
   it ever since.

A tray restart rebuilds the supervisor properly, which is the one thing I
cannot do from here.

## What the gates already found

Worth knowing before you spend the effort: the stack got far enough to boot the
backend once, and **that single boot found a defect two phases of unit tests
could not.** The runtime image had never contained a generated Prisma client —
`pnpm deploy` builds a fresh pruned `node_modules` that does not carry what
`prisma generate` wrote — so `PrismaService` could not be constructed and the
application could not start in either role. Eight seconds to surface, fixed and
pushed.

That is the third defect of that species in this phase pair. It is the argument
for the gates, made by the gates.

## Also worth a look while you are in there

`C:` at 14.2 GB and `E:` at 9.1 GB are both tight. `docker system prune -a` (no
`--volumes`) reclaims build cache safely.

> ⚠️ Never add `--volumes`. That deletes v1's Postgres volume, `botvy_pg_data`.
> There is a dump at `backups/pre-v2-identity-20260908T181658Z.dump`, but if you
> want v1 runnable, prune without it.

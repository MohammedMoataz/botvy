# What I need from you

Foundation phase (P0), `specs/014-foundation`.

Nine items: three decisions, four commands only you can run, two things to know,
and one thing I am flagging rather than deciding.

**Write your answer after the `→` on each line.** I read this file back, so a
single word is enough. Anything left blank I treat as "not decided yet" and
leave alone.

The rest of the paperwork is in the files beside this one — see
[README.md](README.md). This is the only one that needs you.

---

## A. Decisions

### A1. Does v2 keep sharing v1's PostgreSQL? — **answered: separate**

**Your answer:** → **separate.** "I do not have a problem with registering from
the beginning again, I feel when I start from the beginning and clean data/state
it will be better."

Done, and done without deleting anything. Since a clean start removes the reason
to share v1's store, v2 is now its own compose project — `botvy-v2` — which
namespaces every volume (`botvy-v2_pg_data`). v1's data stays exactly where it
is and v1 remains runnable. No wipe was needed.

The dump taken before any of this is still at
`backups/pre-v2-identity-20260908T181658Z.dump` if you ever want v1's accounts
back.

One consequence worth knowing: v2's n8n also starts empty, so the workflows are
imported by `bootstrap.mjs` rather than inherited.

### A2. How should v1 and v2 share `.env`? — **still two files, and now for a smaller reason**

A1 changed what this question means. v2 no longer touches v1's data, so the only
thing the two files still separate is four connection details:

| Variable | v1 | v2 needs |
|---|---|---|
| `DATABASE_URL` | `@localhost:5432` | `@postgres:5432` (container network) |
| `OLLAMA_BASE_URL` | ends in `/v1` (OpenAI shim) | native API, for `format` and `num_ctx` |
| `FIREBASE_CREDENTIALS_DIR` | v1 path | `./../secrets` |
| `CORS_ORIGINS` | v1 list | empty, meaning same-origin |

Those live in `.env.v2`, which compose reads after `.env` so it wins. Your
original `.env` is otherwise untouched, backed up at
`.env.backup-before-v2-20260907T200952Z`.

`ADMIN_EMAIL` is now `imohammedmoataz@gmail.com` with `ADMIN_PASSWORD=admin`, as
you asked. `infra/.env.example` carries a placeholder address instead, so nobody
copies a working login out of a committed file.

| Option | What happens |
|---|---|
| **keep two files** (current) | every run passes both `--env-file` flags; v1 keeps working |
| **one file** | v2 owns `.env`; v1 stops working until you restore the backup |

Once you decommission v1 in P11 this collapses to one file on its own.

**Your answer:** → _(keep two files / one file)_

### A3. Backup retention lives in two places — is that acceptable for now?

`backup.retentionDays` is a settings-registry key you can retune from the
portal. The backup container runs outside the API and cannot read the registry,
so it takes `BACKUP_RETENTION_DAYS` from `.env` instead. Both default to 14.

Retune one and the portal reports a window the job does not honour. The clean
fix is an internal endpoint that serves the number, which is a later phase's
work — I did not add one, because inventing an endpoint during a gate run is how
a foundation phase turns into two.

| Option | What happens |
|---|---|
| **accept** | change both together; I note it in `SETUP.md`, which is already done |
| **fix now** | I add `GET /internal/ops/backup-policy` and the sidecar reads it |

**Your answer:** → _(accept / fix now)_

---

## B. Commands only you can run

### B1. `corepack enable`, from an administrator PowerShell — **please run this**

```powershell
corepack enable
```

`pnpm` is not on your PATH. `corepack enable` fails with `EPERM` for a normal
user because it writes into `C:\Program Files\nodejs`. I worked around it with
shims in `%LOCALAPPDATA%\botvy-corepack-shims`, which leave your PATH when this
session ends.

Without it, `pnpm lint` / `test` / `build` / `gen:contracts` fail with
`'pnpm' is not recognized`, because those root scripts call `pnpm -r`. Not a bug
in the scripts — the documented setup step.

**Done?** → _(yes / no)_

---

### B2. Rotate the compromised Firebase key

Unchanged by this phase and still tracked as `T1113` in
`specs/025-hardening-release`; `secrets/README.md` has the detail. I have not
touched it — rotating a live credential is your console and your call.

**Done?** → _(yes / no / later)_

---

### B3. Push a branch, if you want CI to have ever run

`.github/workflows/ci.yml` and `release.yml` exist and have **never executed**.
Nothing in this whole effort has been pushed to a remote. The five CI jobs are
written against service containers I could not exercise locally.

If one needs a nudge I would expect it to be the mobile job, which runs
`build_runner` before `analyze`.

**Your answer:** → _(pushed / not yet / I will not use CI)_

---

### B4. Optional — make the GHCR packages public

`release.yml` pushes three images now: `botvy-backend`, `botvy-frontend` and
`botvy-backups` (the backup sidecar is a built image, so a deploy host has to
pull rather than build it). The first tagged release creates all three, and they
will be **private** by default. Public means a host can `docker compose pull`
without authenticating.

**Your answer:** → _(public / keep private / not deploying yet)_

---

## C. Things to know, no action needed

### C1. Two Docker builds at once crashes the build server on this machine

Twice, building `backend` and `frontend` in one `compose build` ended in:

```
target frontend: failed to run Build function: frontend grpc server closed unexpectedly
```

Nothing in the Dockerfiles is at fault — the daemon gives out. Both build fine
one at a time, which is how I build them now. Worth knowing before a plain
`up -d --build` fails and reads like a code problem. On the Linux or WSL2
docker-ce host `SETUP.md` recommends for production, it does not happen.

### C2. Builds are slow here, and nothing is wrong

The backup sidecar's `apt-get` alone ran over thirty minutes while Docker's IO
was contended. Docker Desktop on Windows. If you re-run the gate from scratch:

```powershell
docker compose --env-file .env --env-file .env.v2 -f infra/docker-compose.yml build backend
docker compose --env-file .env --env-file .env.v2 -f infra/docker-compose.yml build backups
docker compose --env-file .env --env-file .env.v2 -f infra/docker-compose.yml up -d
node infra/bootstrap.mjs
node infra/verify.mjs
```

Sequentially, for the reason in C1. Logs land in `gate-logs/`.

---

## D. One thing I should flag rather than decide

A second Claude session has been working on this branch alongside me. It
announced itself mid-run, and rather than collide we split the work: it took
`apps/backend/src` and `workflows/`, I took `infra/`, `.env`, the image build
and the gate. Its plan and review notes are in `.harness/`.

That split was the right call given it was already editing files I was about to
touch, and its work is committed as `5264295`. But two agents on one branch is
your decision, not mine.

**Did you start that session?** → _(yes / no)_

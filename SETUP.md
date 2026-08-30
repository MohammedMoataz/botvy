# botvy — setup

Everything needed to run botvy on this machine or a new one.

- [Part 1 — Running it on a fresh machine](#part-1--running-it-on-a-fresh-machine)
- [Part 2 — The four things only you can do](#part-2--the-four-things-only-you-can-do)
- [Part 3 — Operating it day to day](#part-3--operating-it-day-to-day)
- [Part 4 — Troubleshooting things that have actually happened](#part-4--troubleshooting-things-that-have-actually-happened)

---

## Part 1 — Running it on a fresh machine

### Prerequisites

| Requirement | Why | Notes |
|---|---|---|
| **Docker Desktop** | Runs Postgres, n8n, and the gateway | Put its disk image on a drive with room — it grows. Settings → Resources → Disk image location |
| **Ollama**, installed natively | The local LLM. Native, not in Docker, because it needs direct GPU access | <https://ollama.com/download> |
| **An NVIDIA GPU with a current driver** | CPU-only inference is too slow to use — see Part 2 | ~8 GB VRAM is comfortable; 4 GB is tight |
| **Node.js 24 + pnpm** | Only for development and the bootstrap script | `npx pnpm@latest` works without a global install |
| **Flutter SDK** | Only to build the mobile app | <https://docs.flutter.dev/get-started/install/windows> |
| A domain on Cloudflare | Only for access away from home | Optional |
| A Firebase project | Only for push notifications | Optional, free |

### Steps

**1. Clone and configure**

```powershell
git clone <your-repo> botvy
cd botvy
cp infra/.env.example .env
```

Open `.env` and fill in every blank. Generate the secrets — do not reuse the
examples:

```powershell
# Run four times, once per secret
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 32 | % {[char]$_})
```

| Variable | What it is |
|---|---|
| `POSTGRES_PASSWORD` | Database password. Generate one |
| `N8N_ENCRYPTION_KEY` | Encrypts n8n's stored credentials. **Back this up** — losing it makes them unrecoverable |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Sign login tokens. Must differ from each other |
| `INTERNAL_SERVICE_TOKEN` | The only credential n8n holds, for calling `/internal/*` |
| `N8N_OWNER_EMAIL` / `N8N_OWNER_PASSWORD` | The n8n account bootstrap creates |
| `TZ` | e.g. `Africa/Cairo`. Affects when nightly jobs run |
| `DATABASE_URL` | Use the `POSTGRES_PASSWORD` you generated |

Leave `TUNNEL_TOKEN`, `BOTVY_PUBLIC_HOSTNAME`, `FIREBASE_CREDENTIALS_FILE`,
and `N8N_API_KEY` empty. The first three are optional; the last is minted by
bootstrap.

**2. Set up Ollama** — see `infra/docs/ollama-setup.md` for detail. In short:

```powershell
[Environment]::SetEnvironmentVariable('OLLAMA_HOST','0.0.0.0:11434','User')
[Environment]::SetEnvironmentVariable('OLLAMA_KEEP_ALIVE','-1','User')
# restart Ollama from the tray, then:
ollama pull qwen3:4b
```

`OLLAMA_HOST=0.0.0.0` is **required** — Ollama's default binds to loopback
only, which Docker containers cannot reach. That is the single most common
setup failure.

Then lock it down, since binding to `0.0.0.0` alone would expose it. **Needs
an elevated PowerShell:**

```powershell
New-NetFirewallRule -DisplayName "Botvy-Ollama-DockerWSL" -Direction Inbound `
  -Protocol TCP -LocalPort 11434 -Action Allow `
  -RemoteAddress 172.16.0.0/12,127.0.0.1 -Profile Any
```

**3. Start the stack and bootstrap it**

```powershell
docker compose --env-file .env -f infra/docker-compose.yml up -d
node infra/bootstrap.mjs
```

`bootstrap.mjs` applies the database migrations, creates the n8n owner
account, mints an n8n API key and writes it to `.env`, and imports the
workflows. It is idempotent, so re-run it freely.

It exists because the order matters in ways that are not obvious: n8n
rejects every API call until an owner exists; an API key's raw value is
returned exactly once; and the error-handler workflow must be imported
before anything referencing it, or n8n silently drops the reference.

**4. Create your admin account**

Registration is open, and the first account is an ordinary user. Promote it:

```powershell
curl -X POST http://localhost:8080/auth/register -H "Content-Type: application/json" `
  -d '{\"email\":\"you@example.com\",\"password\":\"a-real-password\"}'

docker exec botvy-postgres-1 psql -U botvy -d botvy `
  -c "UPDATE users SET role='admin' WHERE email='you@example.com'"
```

**5. Check it worked**

```powershell
curl http://localhost:8080/health     # expect database:true, ollama:true
```

Then open <http://localhost:8080/admin> and log in. Overview should show
live counts; Workflows should list three workflows, imported but inactive.
Turn them on when you want them firing.

### Verifying a fresh install

| Check | Expected |
|---|---|
| `curl http://localhost:8080/health` | `{"status":"ok","database":true,"ollama":true}` |
| `curl http://localhost:11434/api/ps` | after one query, `size_vram` **> 0** — otherwise you are on CPU, see Part 2 |
| `docker compose ps` | postgres healthy, n8n and gateway up |
| `/admin` in a browser | login works; Overview shows live numbers |
| n8n editor at `:5679` | reachable **only** from the machine itself |

---

## Part 2 — The four things only you can do

### 1. Update the NVIDIA driver — the one that matters

Without this botvy runs but is not usable as an assistant.

Ollama's CUDA build needs a newer driver than the one on this machine.
Every GPU request crashes its inference process:

```
CUDA error: the provided PTX was compiled with an unsupported toolchain
```

It then falls back to CPU, which manages roughly **4 tokens/second**.
Measured here:

| Operation | On CPU |
|---|---|
| "remind me to call mom tomorrow at 5pm" | never finished (10 min) |
| One user's daily coaching program | never finished (10 min) |
| Nightly check-in reply | **under 1 second** — it deliberately avoids the model |

This machine: driver `556.12`, CUDA `12.5`, GTX 1050 4 GB.

Install a current driver from GeForce Experience or
<https://www.nvidia.com/Download/index.aspx>. Needs admin rights and a
reboot — which is why this one is yours and not mine. Then confirm the GPU
is really being used:

```powershell
ollama run qwen3:4b "hi"
curl http://localhost:11434/api/ps    # size_vram must be > 0
```

If the driver update does not fix it, 4 GB may simply be too little. In
order of preference: a smaller quantisation, a smaller model, or move
inference to a machine with more VRAM — only `OLLAMA_BASE_URL` changes, no
code does.

### 2. Firebase — push notifications

Reminders are recorded and marked correctly today but reach no phone. The
gateway degrades on purpose: with no Firebase configured it logs what it
would have sent and carries on, so the flow is demonstrable without it.

1. Create a project at <https://console.firebase.google.com>
2. Add an Android app using the package name from `apps/mobile`
3. Download `google-services.json` → `apps/mobile/android/app/`
4. Project settings → Service accounts → generate a private key
5. `FIREBASE_CREDENTIALS_FILE=E:\path\to\service-account.json` in `.env`

iOS additionally needs a paid Apple Developer account, for both APNs and
device distribution.

Needs an interactive Google sign-in, which is why it is yours.

### 3. Cloudflare tunnel — access away from home

Only needed to reach botvy off your own network. Detail in
`infra/docs/tunnel-setup.md`.

```powershell
cloudflared tunnel login            # opens a browser — hence yours
cloudflared tunnel create botvy
# In Zero Trust → Networks → Tunnels → botvy → Public Hostname:
#   route your hostname to http://gateway:8080
```

Then in `.env`:

```
TUNNEL_TOKEN=...
BOTVY_PUBLIC_HOSTNAME=botvy.yourdomain.com
```

```powershell
docker compose --env-file .env -f infra/docker-compose.yml --profile tunnel up -d
```

The tunnel exposes **only** the gateway. Postgres, n8n, and Ollama stay
bound to localhost — that is a project principle, not a default. Do not add
hostnames routing to them.

### 4. Build the mobile app

`apps/mobile` was written without a Flutter SDK present, so treat the first
build as a debugging session rather than a formality.

```powershell
cd apps\mobile
flutter create --project-name botvy --org org.botvy --platforms=android .
flutter pub get
flutter analyze
flutter test
flutter build apk --release
```

`flutter create` skips files that already exist, so it adds the Gradle and
platform scaffolding without touching the written Dart.

Server address: the Android emulator reaches the host at
`http://10.0.2.2:8080`. A physical phone needs your machine's LAN IP, and
the gateway reachable on it. Both are editable in the app's Settings screen.

---

## Part 3 — Operating it day to day

```powershell
docker compose --env-file .env -f infra/docker-compose.yml up -d    # start
docker compose --env-file .env -f infra/docker-compose.yml down     # stop
docker compose --env-file .env -f infra/docker-compose.yml logs -f gateway
```

| Surface | Address | Exposure |
|---|---|---|
| Admin portal | <http://localhost:8080/admin> | Public via the tunnel, if configured |
| API docs | <http://localhost:8080/docs> | Same |
| n8n editor | <http://localhost:5679> | **This machine only, by design** |
| Postgres | `localhost:5432` | This machine only |

### Backups

Two things matter, and neither is in Docker by accident:

```powershell
# The database — users, reminders, coaching history, messages
docker exec botvy-postgres-1 pg_dump -U botvy botvy > backup-botvy.sql
```

And `N8N_ENCRYPTION_KEY` from `.env`. Without it, a restored n8n cannot
decrypt its stored credentials. Keep it somewhere other than the machine.

Workflow definitions live in `workflows/*.json` in the repo, so they are
already version-controlled — `bootstrap.mjs` re-imports them anywhere.

### Changing the schema

Migrations are forward-only. Never edit one that has been committed; add a
new one.

```powershell
cd apps\gateway
npx prisma migrate dev --name what_changed
```

### Moving to another machine

1. Push the repo; clone it on the new machine
2. Follow Part 1
3. Restore the database if you want the history:
   `docker exec -i botvy-postgres-1 psql -U botvy botvy < backup-botvy.sql`
4. Carry `N8N_ENCRYPTION_KEY` across if you want n8n's saved credentials

Nothing is pinned to this machine. The one thing to re-do by hand is the
Ollama host-level setup, since it lives outside Docker.

---

## Part 4 — Troubleshooting things that have actually happened

Every entry below was hit during development, not imagined.

**Containers cannot reach Ollama.** Its default binds to loopback only. Set
`OLLAMA_HOST=0.0.0.0:11434` and restart it. Verify from inside a container:

```powershell
docker run --rm curlimages/curl -s http://host.docker.internal:11434/api/tags
```

**Everything is slow, or model calls never return.** Check `size_vram` in
`curl http://localhost:11434/api/ps`. Zero means CPU — see Part 2.

**`docker ps` hangs while `docker context ls` answers instantly.** The
daemon is wedged, not the CLI. `wsl --shutdown`, then relaunch Docker
Desktop. This happened repeatedly here; low disk on the drive holding
Docker's disk image makes it worse.

**A workflow's error handling silently does nothing.** n8n assigns its own
ids on import, so a hardcoded `errorWorkflow` id never resolves — and n8n
reports it only in its log, only when a failure needs the handler.
`import.mjs` rewrites the reference to the real id; use it rather than
importing through the UI.

**Structured extraction always falls back to plain chat.** The model call is
timing out. `LLM_REQUEST_TIMEOUT_MS` defaults to 300000; a shorter value
silently degrades every extraction. The real fix is a working GPU.

**Admin portal shows CORS errors.** Only happens running the SPA on Vite's
own port in development. Add that origin to `CORS_ORIGINS`. In production
the gateway serves the SPA itself, so it is same-origin and `CORS_ORIGINS`
should be empty.

**n8n's API returns 401 to everything.** No owner account exists yet. Run
`bootstrap.mjs`.

**A port is already taken.** This machine ran an older botvy whose n8n used
5678, so this stack uses **5679**. Check for a stale process:
`Get-NetTCPConnection -LocalPort 8080 -State Listen`.

**Docker image builds appear to hang.** They were re-downloading ~600
packages with no cache; one sat at 373/605 for 15 minutes. A BuildKit cache
mount on the pnpm store now fixes that, but the first build is still slow.

**`npm error code ECOMPROMISED` / `Lock compromised` from npx.** An earlier
`npx` run was killed while installing (a timeout, Ctrl-C, a closed
terminal). npx takes a `concurrency.lock` in its cache before unpacking and
only releases it on a clean exit, so a killed run leaves the lock behind
forever and every later run of that same package fails.

Confirm by looking for a zero-byte lock and a half-unpacked staging folder:

```powershell
Get-ChildItem "$(npm config get cache)\_npx" -Recurse -Filter concurrency.lock
```

A directory containing `concurrency.lock` but no `package.json` — often with
a dot-prefixed folder like `.archiver-BKPZk49p` inside `node_modules` — is an
interrupted install. Delete that one directory:

```powershell
Remove-Item "$(npm config get cache)\_npx\<hash>" -Recurse -Force
```

`npm cache clean --force` also works but throws away every cached package.
The real prevention is simply not interrupting `npx` while it installs a
large package; firebase-tools takes a while.

---

## The old Telegram assistant

Decommissioned. Its data is backed up at `E:\Work\botvy\backups\`:

- `old-n8n_data.tgz` — the old workflows and credentials
- `old-sqlite_data.tgz` — `assistant.sqlite`: reminders, profiles, check-ins

Both were verified restorable before anything was removed. Nothing has been
migrated into the new system; that is a separate exercise if you want the
history.

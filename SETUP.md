# botvy — setup

Everything needed to run botvy on this machine or a new one.

- [Part 1 — Running it on a fresh machine](#part-1--running-it-on-a-fresh-machine)
- [Part 2 — The four things only you can do](#part-2--the-four-things-only-you-can-do)
  - [Deferred: rotate the exposed Firebase key](#deferred-rotate-the-exposed-firebase-service-account-key)
- [Part 3 — Operating it day to day](#part-3--operating-it-day-to-day)
- [Part 4 — Troubleshooting things that have actually happened](#part-4--troubleshooting-things-that-have-actually-happened)

---

## Part 1 — Running it on a fresh machine

### Prerequisites

| Requirement | Why | Notes |
|---|---|---|
| **Docker Desktop** | Runs Postgres, n8n, and the gateway | Put its disk image on a drive with room — it grows. Settings → Resources → Disk image location |
| **Ollama**, installed natively | The local LLM. Native, not in Docker, because it needs direct GPU access | <https://ollama.com/download> |
| **An NVIDIA GPU** | Inference runs on it via CUDA, or via Vulkan on older drivers — see Part 2 | ~8 GB VRAM is comfortable; 4 GB works with a 4B model |
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
| `TZ` | n8n's own clock. User-facing times come from each user's profile timezone, not this |
| `DATABASE_URL` | Use the `POSTGRES_PASSWORD` you generated |

Leave `TUNNEL_TOKEN`, `BOTVY_PUBLIC_HOSTNAME`, `FIREBASE_CREDENTIALS_DIR`,
`FIREBASE_CREDENTIALS_FILE`, and `N8N_API_KEY` empty. The first four are
optional; the last is minted by bootstrap.

Everything tunable at runtime — nightly check-in and program times, default
reminder lead times, sweep batch size, notification wording — lives in the
`settings` table and is editable from the admin portal's **Config** page. Only
secrets and connection details are environment variables.

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

### On Linux instead of Windows

The steps above are the same in substance; four of them differ in mechanics.
Everything below was done on Ubuntu 24.04 without root, so it also covers the
case where you cannot `sudo apt install`.

**Secrets.** The PowerShell generator becomes:

```bash
tr -dc 'A-Za-z0-9' </dev/urandom | head -c 40; echo
```

`bootstrap.mjs` parses `.env` literally — it does **not** expand `${...}` — so
write the real password into `DATABASE_URL` rather than interpolating
`POSTGRES_PASSWORD` into it.

**Ollama.** There is no tray app. Recent releases ship a `.tar.zst`, not the
`.tgz` the older docs assume, and it unpacks anywhere — no root needed:

```bash
curl -fL -o ollama.tar.zst \
  https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64.tar.zst
mkdir -p ~/opt/ollama && tar --use-compress-program=unzstd -xf ollama.tar.zst -C ~/opt/ollama
ln -sf ~/opt/ollama/bin/ollama ~/.local/bin/ollama
```

`OLLAMA_HOST` and `OLLAMA_KEEP_ALIVE` belong in a service unit rather than a
user environment variable — install `infra/ollama.service`, which documents
both and the one-time `loginctl enable-linger` that makes it start at boot.
Then `ollama pull qwen3:4b`.

The Windows firewall rule has no direct equivalent. Binding to `0.0.0.0` puts
Ollama on your LAN, so restrict it to the Docker bridge and loopback:

```bash
# Use this stack's actual bridge subnet rather than a guess — Docker's pool is
# configurable, and 172.16.0.0/12 is far wider than the one network involved.
SUBNET=$(docker network inspect botvy_default \
  -f '{{(index .IPAM.Config 0).Subnet}}')
sudo ufw allow from "$SUBNET" to any port 11434 proto tcp
sudo ufw deny 11434/tcp
```

Re-check that subnet if you ever `docker compose down` the stack: removing and
recreating the network can hand it a different one.

**Reaching the host from a container.** `host.docker.internal` is not built in
on Linux the way it is on Docker Desktop; it works here only because the
gateway service declares `extra_hosts: ["host.docker.internal:host-gateway"]`.
Do not remove that line. Verify it end to end with:

```bash
docker exec botvy-gateway-1 node -e \
  "fetch('http://host.docker.internal:11434/api/tags').then(r=>r.text()).then(console.log)"
```

**The Flutter toolchain**, if you have no root, is three tarballs into `~/opt`:
the Flutter SDK, a JDK 17 (Temurin — the Gradle config pins Java 17), and the
Android command-line tools unpacked to `~/opt/android-sdk/cmdline-tools/latest`.
Then:

```bash
export JAVA_HOME=~/opt/jdk17 ANDROID_HOME=~/opt/android-sdk
export PATH=~/opt/flutter/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$JAVA_HOME/bin:$PATH
yes | sdkmanager --sdk_root=$ANDROID_HOME --licenses
sdkmanager --sdk_root=$ANDROID_HOME "platform-tools" "platforms;android-36" "build-tools;36.0.0"
flutter config --android-sdk ~/opt/android-sdk --jdk-dir ~/opt/jdk17
```

`flutter doctor` will still fail the **Linux desktop** toolchain (clang, CMake,
ninja, GTK). That is expected and irrelevant — this app targets Android.

One wrinkle in the `flutter create` step: it writes a boilerplate
`test/widget_test.dart` referencing a `MyApp` class this project does not have
(the real one is `BotvyApp`), which then fails `flutter analyze`. Delete that
one generated file; the project's own tests live beside it.

### Verifying a fresh install

| Check | Expected |
|---|---|
| `curl http://localhost:8080/health` | `status: ok`, `push: true`, and `sweepStale: false` within a few minutes of starting |
| `curl http://localhost:11434/api/ps` | after one query, `size_vram` should equal `size` — anything less is running on the CPU, see Part 2 |
| `docker compose ps` | postgres healthy; n8n, searxng and gateway up |
| `/admin` in a browser | login works; Overview shows live numbers and a running reminder sweep |
| n8n editor at `:5679` | reachable **only** from the machine itself |
| `node test/intent-fixture.mjs` (in `apps/gateway`) | 23/23 — run it after changing the model or the intent prompt |

`sweepStale: true` means the scheduled jobs are not reaching the gateway.
Check that n8n actually has the shared secret — `docker exec botvy-n8n-1
printenv INTERNAL_SERVICE_TOKEN` — and recreate the container if it is empty;
one that predates the setting keeps its old environment forever.

### The model

`OLLAMA_CHAT_MODEL` must fit entirely in VRAM. Two settings go with it:
`OLLAMA_THINKING` is true only for a reasoning model like qwen3 (qwen2.5
rejects the field and every call fails), and `OLLAMA_NUM_CTX` pins the context
window. Do not give the intent call and the chat call different windows —
Ollama keys a loaded model by context size, so two values make it reload on
every single turn. That cost 39 seconds to the first token; one value costs 3.

### Web search

Search runs through a local SearXNG that nothing but the gateway can reach.
`infra/searxng/settings.yml` restricts it to a handful of engines: the default
set waits for the slowest, and its image half is mostly icon libraries. Several
general engines are listed on purpose — a single home IP collects a CAPTCHA
from DuckDuckGo and a rate-limit from Brave soon enough, and one working engine
is enough to answer. If every engine is throttled the assistant simply replies
without searching, which is why an outage looks like an ordinary conversation
rather than an error.

---

## Part 2 — The four things only you can do

### 1. Ollama on an older NVIDIA driver — use Vulkan, not CUDA

> **This was misdiagnosed for a long time as "the driver is too old and
> everything falls back to slow CPU".** Both halves were wrong, and the fix
> needs no driver update and no admin rights. The measurements below are
> from this machine (driver `556.12`, CUDA `12.5`, GTX 1050 4 GB).

**There is no CPU fallback.** On the default path Ollama's CUDA runner dies
and the request returns **HTTP 500**:

```
llama-server process has terminated: exit status 0xc0000409
CUDA error: the provided PTX was compiled with an unsupported toolchain.
```

The runner *is* built for this card (`ARCHS` includes `610` = sm_61). It
crashes inside `ggml_cuda_kernel_can_use_pdl` — Programmatic Dependent
Launch, an sm_90+ feature. Merely querying those kernels makes the driver
JIT their PTX, and a CUDA 12.5 driver cannot read PTX from the newer
toolchain Ollama was built with. **A smaller model does not help** — 1.7b
crashes identically.

**The fix: make Ollama use its Vulkan backend instead.** It already ships
one; CUDA simply claims the device first and then dies.

```powershell
[Environment]::SetEnvironmentVariable('CUDA_VISIBLE_DEVICES','-1','User')
# restart Ollama from the tray, then confirm the GPU is really in use:
curl http://localhost:11434/api/ps    # size_vram must be > 0
```

With that set, the GTX 1050 runs under Vulkan with the model in VRAM
(`size_vram` ≈ 2.6 GB for qwen3:4b).

**The larger lesson: the GPU was never the main cost.** qwen3 is a reasoning
model, and an unbounded thinking phase dominated every extraction:

| Same extraction, same model, same GPU | Wall clock |
|---|---|
| thinking on (the old code path) | **528 s**, and the answer was wrong |
| `think: false` | **5 s** |

`extract()` therefore calls Ollama's **native** `/api/chat` rather than the
`/v1` OpenAI shim, because `think` exists only there, and caps the reply with
`num_predict`. End to end today, "remind me to call mom tomorrow at 5pm"
resolves correctly in about **20 seconds**.

Model choice, measured on that same prompt: `qwen3:1.7b` answers in ~7 s but
puts the reminder on the wrong **day**; `qwen3:4b` takes ~20 s warm and gets
it right. Correctness wins, so `OLLAMA_CHAT_MODEL=qwen3:4b`.

A newer driver would still be worth installing — it would restore the CUDA
path, which is faster than Vulkan — but it is an optimisation now, not a
prerequisite.

### 2. Firebase — push notifications

Reminders fire from the phone itself, scheduled locally, so they work with no
network and no Firebase at all. Push covers what the device cannot schedule
for itself: the evening check-in, the nightly program, a reminder created on
another device, and silent nudges telling the app to re-sync.

1. Create a project at <https://console.firebase.google.com>
2. Add an Android app using the package name from `apps/mobile`
3. Download `google-services.json` → `apps/mobile/android/app/`
4. Project settings → Service accounts → generate a private key
5. Save it into `secrets/` and set **both** halves in `.env`:

```ini
# The host directory holding the key; mounted read-only at /run/secrets
FIREBASE_CREDENTIALS_DIR=./../secrets
# The path INSIDE the container
FIREBASE_CREDENTIALS_FILE=/run/secrets/firebase-admin.json
```

A host path (`E:\...`) in `FIREBASE_CREDENTIALS_FILE` does not exist inside
the container. That mistake used to disable every notification silently; the
gateway now refuses to boot instead. Leave both empty to run without push.

iOS additionally needs a paid Apple Developer account, for both APNs and
device distribution.

Needs an interactive Google sign-in, which is why it is yours.

#### Deferred: rotate the exposed Firebase service-account key

> **The key currently at `secrets/firebase-admin.json` is compromised and has
> not been rotated.** This is a deliberate deferral, not an oversight — the
> instance is demo/dev only and the first release was the priority. It stays
> open until one of the triggers below fires.

The key (key id ending **`c3a2a5`**) was pasted into a chat transcript. A
Firebase service-account key grants full admin on the `bot-vy` project:
every Firestore document, read and write, and the ability to mint auth
tokens for any user. It was never committed — `secrets/` is gitignored, and
`.env` references the file by path only (`FIREBASE_CREDENTIALS_FILE`) — so
the exposure is the transcript, nothing in the repo.

**Rotation is mandatory, not optional, before any of these:**

| Trigger |
|---|
| Before the instance is reachable from the public internet |
| Before any real user data exists |
| Before the repository or project is shared with anyone else |

Whichever comes first. Until then it is an accepted risk.

**How to rotate** — five minutes, and nothing else in the project changes:

1. Google Cloud Console → IAM & Admin → Service Accounts
2. Open the `firebase-adminsdk-*` account → **Keys**
3. Delete the key whose id ends `c3a2a5`
4. **Add key → Create new key → JSON**
5. Save it over `E:\Work\botvy\secrets\firebase-admin.json`

No other change is needed — `.env` already points at that path.

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

```powershell
cd apps\mobile
flutter pub get
dart run build_runner build   # drift's generated database code
flutter analyze
flutter test
flutter build apk --release
```

`build_runner` is only needed after changing `lib/src/db/database.dart`; the
generated `database.g.dart` is otherwise stable.

On first launch the app asks for notification permission and, on Android 12,
for permission to schedule exact alarms. Both are needed for a reminder to
land at the minute it was set for — without the second, Android may delay it
by a few minutes, and Settings says so rather than leaving it a mystery.

Server address: the Android emulator reaches the host at
`http://10.0.2.2:8080`. A physical phone needs your machine's LAN IP, and
the gateway reachable on it. Both are editable in the app's Settings screen.

#### Checking that reminders really fire

```powershell
adb shell dumpsys alarm | Select-String botvy   # a pending RTC_WAKEUP per ping
```

The honest test is airplane mode: turn it on, create a reminder two minutes
out, and wait. It should fire with no connection — the phone scheduled it
itself. Turn the network back on and the reminder appears server-side, with
no duplicate push.

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

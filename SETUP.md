# Getting botvy actually usable

The platform is built and running. What remains is environment setup that
only you can do, listed here in order of how much each unblocks.

---

## 1. Update the NVIDIA driver — unblocks everything

**This is the one that matters.** Without it, botvy runs but is not usable
as an assistant.

**The problem.** Ollama's CUDA build needs a newer driver than the one
installed. Every GPU request crashes its inference process:

```
CUDA error: the provided PTX was compiled with an unsupported toolchain
```

Ollama then falls back to CPU, which works but manages roughly **4 tokens
per second**. Measured consequences on this machine:

| Operation | Result on CPU |
|---|---|
| "remind me to call mom tomorrow at 5pm" | never completed (10 min) |
| One user's daily coaching program | never completed (10 min) |
| Nightly check-in reply | **under 1 second** — it deliberately avoids the model |

**Current state:** driver `556.12`, CUDA `12.5`. GPU: GTX 1050, 4 GB.

**What to do:** install a current NVIDIA driver (GeForce Experience, or
nvidia.com/drivers). Needs a reboot. Then confirm the GPU is actually being
used — `size_vram` must be non-zero:

```powershell
ollama run qwen3:4b "hi"
curl http://localhost:11434/api/ps      # size_vram > 0 means it is on the GPU
```

**If the driver update does not help:** the 4 GB card may simply be too
small for comfortable use. The fallbacks, in order of preference, are a
smaller quantisation of the same model, a smaller model, or moving
inference to a machine with more VRAM (only `OLLAMA_BASE_URL` changes —
no code does).

---

## 2. Install the Flutter SDK — unblocks the mobile app

The app under `apps/mobile` has **never been compiled**. There is no
Flutter SDK on this machine, so it may well contain real errors. Treat the
first build as a debugging session, not a formality.

```powershell
# https://docs.flutter.dev/get-started/install/windows
cd E:\Work\botvy\apps\mobile
flutter create --project-name botvy --org org.botvy --platforms=android .
flutter pub get
flutter analyze          # expect real findings on first run
flutter test
flutter build apk --release
```

`flutter create` skips files that already exist, so it fills in the Gradle
and platform scaffolding without touching the written Dart.

The emulator default is `http://10.0.2.2:8080`. A physical phone needs your
machine's LAN IP, and the gateway bound accordingly.

---

## 3. Create a Firebase project — unblocks push notifications

Reminders are recorded and marked correctly today, but nothing reaches a
phone. The gateway degrades deliberately: with no Firebase configured it
logs what it would have sent and carries on, so the whole flow is
demonstrable without it.

1. Create a project at <https://console.firebase.google.com>.
2. Add an Android app with the package name from `apps/mobile`.
3. Download `google-services.json` into `apps/mobile/android/app/`.
4. Project settings → Service accounts → generate a private key.
5. Point `.env` at it:

```
FIREBASE_CREDENTIALS_FILE=E:\path\to\service-account.json
```

iOS additionally needs a paid Apple Developer account, for both APNs and
device distribution.

---

## 4. Cloudflare tunnel — unblocks access away from home

Only needed to reach botvy off your own network. Full steps are in
`infra/docs/tunnel-setup.md`. Summary: create a named tunnel, route a
hostname to `http://gateway:8080`, then put the token in `.env`:

```
TUNNEL_TOKEN=...
BOTVY_PUBLIC_HOSTNAME=botvy.yourdomain.com
docker compose --env-file .env -f infra/docker-compose.yml --profile tunnel up -d
```

The tunnel exposes **only** the gateway. Postgres, n8n, and Ollama stay
bound to localhost — that boundary is a project principle, not a default.

---

## Running it day to day

```powershell
docker compose --env-file .env -f infra/docker-compose.yml up -d
node infra/bootstrap.mjs        # idempotent; safe to re-run
```

- Admin portal: <http://localhost:8080/admin>
- API docs: <http://localhost:8080/docs>
- n8n editor: <http://localhost:5679> (localhost only, by design)

Workflows are imported inactive. Turn them on from the admin portal's
Workflows page when you are ready for them to start firing.

---

## The old assistant

The previous Telegram stack has been decommissioned. Its data is backed up
at `E:\Work\botvy\backups\`:

- `old-n8n_data.tgz` — the old workflows and credentials
- `old-sqlite_data.tgz` — `assistant.sqlite`: reminders, profiles, check-ins

Both were verified restorable before anything was deleted. Nothing has been
migrated from them into the new system; that is a separate exercise if you
decide you want the history.

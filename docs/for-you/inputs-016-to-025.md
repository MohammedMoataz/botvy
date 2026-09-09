# Everything I will need from you, P2 → P11 (`016` … `025`)

One register for the whole remaining roadmap, written now so nothing arrives as
a surprise mid-phase. Each item has an **answer box** — type into it in place.
Items marked 🔨 are something for you to *do* (a console, a key, a device);
items marked ❓ are a decision only you can make, and every one of those has a
default I will use if you leave it blank. **Silence on a ❓ means "take your
default".** Silence on a 🔨 blocks that phase's gate.

Nothing here is needed today. The table says when each one turns into a blocker.

## When each item bites

| # | Item | Kind | Needed by | Blocks |
|---|------|------|-----------|--------|
| [I1](#i1--n8n-api-key) | n8n API key | 🔨 | **now** (carried from P0) | P0 gate 5/5, P2 sweep, P3 tick |
| [I2](#i2--firebase-android-app--google-servicesjson) | `google-services.json` | 🔨 | P2 | push notifications, P2 gate |
| [I3](#i3--a-real-android-device) | An Android device | 🔨 | P2 | airplane-mode alarm gate |
| [I4](#i4--chrome-with-developer-mode) | Chrome, developer mode | 🔨 | P2 | extension side panel |
| [I5](#i5--label-palette) | Label palette | ❓ | P2 | nothing (I have a default) |
| [I6](#i6--the-three-daily-times) | The three daily times | ❓ | P3 | nothing |
| [I7](#i7--ollama-models-pulled) | Ollama models pulled | 🔨 | P4 | every chat and extraction |
| [I8](#i8--arabic-intent-sentences-review) | Arabic intent sentences | ❓ | P4 | AR fixture quality |
| [I9](#i9--chat-token-quota) | Chat token quota | ❓ | P4 | nothing |
| [I10](#i10--first-day-of-the-week) | First day of the week | ❓ | P5 | calendar correctness for you |
| [I11](#i11--your-sports-and-weekly-slots) | Your sports + weekly slots | ❓ | P6 | realistic seed, P6 gate |
| [I12](#i12--test-urls-for-ingestion) | Two test URLs | 🔨 | P7 | P7 gate |
| [I13](#i13--youtube-terms-acknowledgement) | YouTube ToS call | ❓ | P7 | whether transcripts ship |
| [I14](#i14--your-allergies-and-dislikes) | Allergies + dislikes | 🔨 | P8 | P8 allergen gate |
| [I15](#i15--meal-mode-and-a-starter-library) | Meal mode + library | ❓ | P8 | nothing |
| [I16](#i16--chrome-web-store-publish-or-not) | Web Store: publish? | ❓ | P9 | distribution only |
| [I17](#i17--domain-name-and-tunnel) | Domain + tunnel token | 🔨 | P10 | public site reachable |
| [I18](#i18--marketing-copy-and-brand) | Copy, logo, screenshots | 🔨 | P10 | landing page |
| [I19](#i19--privacy-policy-facts) | Privacy policy facts | 🔨 | P10 | privacy page, Web Store |
| [I20](#i20--deploy-target-for-cd) | Deploy host for CD | 🔨 | P10 | automatic deploys |
| [I21](#i21--rotate-the-firebase-key-for-real) | Rotate Firebase key | 🔨 | **P11, mandatory** | release |
| [I22](#i22--the-release-signing-keystore) | Release keystore | 🔨 | P11 | shippable APK, forever |
| [I23](#i23--backup-destination) | Backup destination | 🔨 | P11 | restore drill |
| [I24](#i24--delete-legacy) | Approve deleting `legacy/` | ❓ | P11 | v1 decommission |
| [I25](#i25--import-v1-data-or-not) | Import v1 data? | ❓ | P11 | one-shot script |
| [G](#g--google-sign-in-the-whole-thing) | **Google Sign-In** | 🔨 | whenever you want the button | the Google button on all four surfaces |

---

# 🔴 Now — carried over from P0

## I1 — n8n API key

```
API KEY SET IN .env:  (yes / no)
```

The last failing check in `node infra/verify.mjs`. Everything else in the
foundation gate passes; this one is 4/5 because `bootstrap.mjs` cannot import
the workflow JSONs without a key, and it says so rather than pretending.

n8n mints these in its own UI only — there is no CLI and no seeding path, which
is why it is yours and not mine.

**👉 Do this:**

1. n8n's editor is bound to loopback on purpose (`N8N_BIND=127.0.0.1:5679`), so
   from the host itself just open <http://localhost:5679>. On first visit it
   asks you to create the owner account — any email and password; it is local.
2. Bottom-left avatar → **Settings** → **n8n API** → **Create an API key**.
   Label it `botvy-bootstrap`. Copy it *now*; n8n shows it once.
3. Paste it into `.env` at the repo root:

   ```
   N8N_API_KEY=n8n_api_…
   ```

4. Tell me, and I re-run the gate. No restart needed — `bootstrap.mjs` reads
   `.env` itself.

If you would rather not mint one: `bootstrap.mjs` **skips** rather than fails,
and you can import `workflows/*.json` by hand from the editor's
**Import from File**. The cost is that every future phase's workflow import
becomes a manual step, and the gate never reaches 5/5.

---

# P2 — `016-tasks-labels-reminders`

## I2 — Firebase Android app + `google-services.json`

```
google-services.json IN PLACE:  (yes / no)
PACKAGE NAME USED:              (default: org.botvy.botvy)
```

Push is how a reminder reaches a phone that has been closed for two days. The
server side is already wired (`secrets/firebase-admin.json` exists); the *phone*
side needs its own config file, and it is not in the repository because it
carries a live key.

`apps/mobile/android/app/build.gradle.kts` already looks for it and applies the
Google Services plugin **only if it is there**, so `--flavor dev` builds and CI
keep working without it. `PushService` degrades to "no push" rather than
crashing. So this is not urgent until you want a nudge on a locked screen.

**👉 Do this:**

1. <https://console.firebase.google.com> → the same project the
   `firebase-admin.json` in `secrets/` belongs to (do not make a second one —
   the server key and the app config must be the same project, or tokens minted
   by one are rejected by the other).
2. **Project settings** → **Your apps** → **Add app** → Android.
3. Android package name: **`org.botvy.botvy`** — exactly. It is `namespace` in
   `apps/mobile/android/app/build.gradle.kts:40`; a mismatch produces a config
   file the plugin silently ignores.
4. Nickname `Botvy`. Skip the Debug SHA-1 unless you are also doing
   [G](#g--google-sign-in-the-whole-thing); FCM does not need it.
5. Download `google-services.json` and put it at:

   ```
   apps/mobile/android/app/src/prod/google-services.json
   ```

   Note `src/prod/`, not `app/`. The `prod` flavour is the shipping one; `dev`
   deliberately has no Firebase so a contributor without the project can build.
   Both paths are gitignored (`.gitignore:69-70`), so it cannot be committed by
   accident.

## I3 — A real Android device

```
DEVICE AVAILABLE:  (yes / no / emulator only)
```

P2's gate is *"airplane-mode alarm fires"*, and that is the one claim no test
and no emulator settles honestly. The phone schedules its own alarms from its
local SQLite so they work with the network off — the server sweep is only the
fallback. An emulator can be put in airplane mode, but its clock and its Doze
behaviour are not a handset's, and Doze is exactly what breaks alarms in the
field.

**👉 Do this when P2 is close:** any Android 8+ phone with USB debugging on
(Settings → About → tap Build number 7×, then Developer options → USB
debugging). I will give you a two-command install and the exact steps for the
gate. An emulator is enough for everything else in the phase.

## I4 — Chrome with developer mode

```
READY:  (yes / no)
```

The extension side panel (T206) has no store listing yet, so it loads unpacked.

**👉 Do this when I say the build is ready:** `chrome://extensions` → toggle
**Developer mode** (top right) → **Load unpacked** → pick
`apps/extension/.output/chrome-mv3`. It stays loaded across restarts; a rebuild
needs the ↻ on its card.

## I5 — Label palette

```
YOUR CHOICE:  (leave blank for my default)
```

Labels get a fixed palette to pick from, plus a custom colour. Nobody sees the
hex values but you, so this is purely taste.

**My default** — eight, readable on both light and dark, spaced far enough
apart that two labels never look alike at a glance:

| | | |
|---|---|---|
| `#0F766E` teal | `#B45309` amber | `#1D4ED8` blue |
| `#B91C1C` red | `#15803D` green | `#7E22CE` purple |
| `#BE185D` pink | `#475569` slate | |

Say "more", "fewer", or name colours you want in and I will swap them.

---

# P3 — `017-daily-rhythm`

Nothing to install. n8n's `rhythm_tick.json` rides on [I1](#i1--n8n-api-key).

## I6 — The three daily times

```
PLAN PROMPT:      (default 21:00)
END OF DAY:       (default 22:00)
MORNING BRIEFING: (default 08:00)
QUIET HOURS:      (default none)
```

These are the defaults every *new* member starts with — they land in
`settings.defaults.*` and each member then gets their own editable copy in
preferences. So the question is only "what is a sensible starting point", and
your own habits are the best available answer.

What each one does:

- **Plan prompt** — the coach asks you to confirm tomorrow's plan (top
  priorities + whether there is training).
- **End of day** — auto-confirms an unanswered draft, names what tomorrow
  holds, and asks the check-in question.
- **Morning briefing** — today's plan, the training slot, the meal line.
- **Quiet hours** — a window in which no push is sent (the alarm still fires
  locally; only the server-side nudge is held). Leave blank and there is none.

They resolve against *your profile's* time zone, never the server's — so
`Africa/Cairo` 21:00 is 21:00 in Cairo whatever the host thinks the time is.

---

# P4 — `018-coach-chat`

## I7 — Ollama models pulled

```
PULLED:      (yes / no)
GPU / VRAM:  (e.g. RTX 4060 8 GB / CPU only)
```

The chat, the intent extraction and the link summaries all go to Ollama running
natively on the host — nothing in a container, nothing over the internet. The
models are not in the repository (gigabytes) and not something I can download
for you.

**👉 Do this:**

```powershell
ollama pull qwen2.5:3b-instruct
ollama list
```

That one model is the default for all three registry keys (`llm.chatModel`,
`llm.extractModel`, `llm.summarizeModel`) and it is deliberate: **Ollama keys a
loaded model by its context size, so two different sizes reload the model on
every turn — measured at 39 seconds to first token.** One model, one
`llm.numCtx` (8192), no reloads.

Tell me your VRAM and I will say whether to move up. Rough shape:

| VRAM | Worth trying | Why |
|---|---|---|
| ≤ 6 GB | stay on `qwen2.5:3b-instruct` | anything larger swaps to CPU mid-turn |
| 8 GB | `qwen3:4b` or `gemma3:4b` | noticeably better Arabic and instruction-following |
| ≥ 12 GB | `qwen3:8b` for chat, 3b for extraction | but that is two sizes — see the reload note above; only worth it if you raise `llm.numCtx` to match |

Changing a model later is a settings patch in the admin portal, not a deploy.

## I8 — Arabic intent sentences (review)

```
REVIEWED:  (yes / no — or paste corrections below)
```

Intent extraction has to work in Arabic, and the hard part is relative time —
"بعد ساعتين", "بكرة الصبح", "يوم الجمعة الجاي". I will write the fixture
sentences myself; what I cannot do is know whether they sound like something an
Egyptian speaker would actually type into a chat, as opposed to something
translated out of English.

**👉 Do this at P4:** I will drop ~15 sentences in a file here; strike out the
stilted ones and write what you would really say. Ten minutes, and it is the
difference between the feature working for you and working in tests.

## I9 — Chat token quota

```
YOUR CHOICE:  (leave blank for my default)
```

`chat.dailyQuotaTokens` caps how much a member can spend on the model per day.
Since it is your own hardware and (for now) your own single account, this is a
guard against a runaway loop, not a cost control.

**My default: 200,000 tokens/day** — far above real use, low enough that a
runaway stops within minutes rather than pinning the GPU overnight.
Operator-editable in the admin portal.

---

# P5 — `019-meetings-calendar`

## I10 — First day of the week

```
YOUR CHOICE:  (default: Saturday)
```

Affects the month grid, the week view, and what "this week" means in the agenda
and the training week.

**My default: Saturday**, because `GENERIC_TIMEZONE=Africa/Cairo` and the
Egyptian week runs Saturday–Friday. Say Monday (ISO) or Sunday if you would
rather. It becomes a preference, so it is changeable per member either way.

---

# P6 — `020-training`

## I11 — Your sports and weekly slots

```
SPORTS:
WEEKLY SLOTS:
CUTOFF:        (default 21:00)
```

P6's gate is *"Wednesday 21:30 shows Friday's session as next"* — that needs a
real schedule with a real gap in it, and the whole point of the phase is that
it is **your** schedule. Made-up data would pass a gate that proves nothing.

**👉 Give me, in any format:**

- Which sports — e.g. `gym, swimming`
- Which days and times — e.g. `gym: Sun/Tue/Thu 18:00; swimming: Sat 09:00`
- Rest days (just the days you named nothing on)

**Cutoff** (`nextPracticeCutoff`, default 21:00) is the hour after which "next
practice" stops meaning *today's* and starts meaning *tomorrow's*. At 21:30 on
a Wednesday with a 21:00 cutoff, the card shows Friday — not the session you
already missed at 18:00.

---

# P7 — `021-knowledge-ingestion`

## I12 — Test URLs for ingestion

```
PLAYLIST URL:
ARTICLE URL:
```

The gate is *"3-video playlist → 3 children `done` within 20 min"*. I need a
playlist you actually care about — short (3–5 videos), with real spoken
transcripts, ideally about one of your sports, because the next step is the
suggestion saga drafting a session *from your saved sources*. A playlist of
music videos passes the pipeline and proves nothing about the feature.

Plus one long article (2,000+ words) to exercise the map-reduce chunking.

## I13 — YouTube terms acknowledgement

```
YOUR CALL:  (transcripts on / transcripts off)
```

Transcript extraction uses `youtubei.js`, which reads YouTube's internal API
rather than the official Data API. It works, it needs no key, and it is **not
what YouTube's Terms of Service permit**. For a single-user self-hosted instance
reading your own saved links this is the ordinary risk everyone takes; it is
still your call and not mine, and it is recorded in `research.md` as a caveat
rather than buried.

- **transcripts on** (my assumption if blank) — full pipeline; videos get
  summarised from their transcripts.
- **transcripts off** — videos are saved as links with title and description
  only; no transcript, no summary, no suggestions from video sources. Articles
  are unaffected (`@mozilla/readability` on a public page is uncontroversial).

If you ever publish this for other people, revisit it. The official Data API has
no transcript endpoint at all, so "on" has no compliant equivalent.

---

# P8 — `022-nutrition-daily-plan`

## I14 — Your allergies and dislikes

```
ALLERGIES:
DISLIKES:
```

P8's gate is *"dairy allergy never appears in generic mode across 50
generations"*. Allergies go into the prompt as **prohibitions** and are checked
again on the way out — a suggestion that trips the check is withheld rather than
shown, which is the only safe direction for a machine that occasionally ignores
its instructions.

**👉 So this one I genuinely need to be real.** If you have no allergies, write
`none` and I will use dairy as the *test* allergen on a throwaway profile — but
if you do have one, it goes in your profile and it is what the gate is run
against. Dislikes are softer: they are asked to be avoided, not prohibited.

## I15 — Meal mode and a starter library

```
MODE:            (default: library)
STARTER MEALS:
```

Two modes:

- **`library`** — rotates through meals *you* saved. **No model call at all**,
  so it is instant, free, and can never invent something you are allergic to.
- **`llm`** — a generic line drafted by the model each day, with your allergies
  as prohibitions and the allergen check on the output.

**My default is `library`**, because a rotation of five meals you actually eat
beats a daily invention you will ignore, and it takes the model out of a path
where a hallucination has a health consequence.

If you pick `library`, give me five or more meals to seed — just names, e.g.
`فول وطعمية / oats with banana / grilled chicken and rice / …`. Fewer than about
five and the rotation becomes obvious within a week.

---

# P9 — `023-chrome-extension`

## I16 — Chrome Web Store: publish or not?

```
YOUR CALL:  (self-host / publish)
```

- **self-host** (my default) — CI builds a zip on tag, you load it unpacked or
  drag the zip in. Free, instant, no review. The cost: no automatic updates, and
  the extension ID changes if you reload it from a different folder — which
  matters only if you also want Google sign-in in the extension (see
  [G](#g--google-sign-in-the-whole-thing)).
- **publish** — a stable ID, automatic updates, and a review queue.

**👉 If you pick publish, do this:**

1. <https://chrome.google.com/webstore/devconsole> → pay the **one-time $5
   registration fee** (Google's, not mine).
2. Create the item once by uploading a zip by hand; that mints the extension ID.
3. For CI to upload later builds, T902 needs four repo secrets. Getting them is
   an OAuth dance — I will write the exact steps into this file at P9 rather
   than guess them now, since Google moves that console around. The names will
   be `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`,
   `CHROME_REFRESH_TOKEN`, and T902 keeps the upload step behind a repo variable
   so a fork without them still builds.

---

# P10 — `024-web-admin-public`

## I17 — Domain name and tunnel

```
DOMAIN:        (blank = LAN only)
TUNNEL TOKEN:  (set / not set)
```

Right now the edge is `CADDY_SITE=:80` on `EDGE_PORT=80` — plain HTTP, reachable
on the LAN. A public landing page needs a hostname and TLS. Two ways:

**A. Cloudflare Tunnel (recommended).** No open inbound port, no port
forwarding, TLS terminated by Cloudflare, works behind a home router and carrier
NAT.

1. <https://one.dash.cloudflare.com> → **Networks** → **Tunnels** → Create a
   tunnel → **Cloudflared**. Name it `botvy`.
2. Copy the token it shows.
3. Add a **Public hostname**: your domain, pointing at `http://caddy:80`.
4. In `.env`:

   ```
   TUNNEL_TOKEN=eyJ…
   CADDY_SITE=botvy.example.com
   ```

   `TUNNEL_TOKEN` non-empty is what switches the `cloudflared` compose profile
   on; blank and it stays off, which is a working LAN system.

**B. Your own domain + port forwarding.** Point an A record at your public IP,
forward 80 and 443, set `CADDY_SITE=botvy.example.com` and Caddy gets a Let's
Encrypt certificate on its own. Simpler to reason about; exposes your home IP
and needs a static one or dynamic DNS.

Blank both and P10 still ships — the admin portal and the site are just LAN-only,
and the Lighthouse ≥ 90 gate runs against `localhost`.

## I18 — Marketing copy and brand

```
PRODUCT NAME:   (default: Botvy)
TAGLINE:
LOGO:           (file path, or "make one")
SCREENSHOTS:    (yours / use the gate data)
```

The landing page is the one deliverable where "I'll write it" produces something
worse than what you would write, because it is about what the thing is *for*.
The blueprint's own line — *"help users live the life they want"* — is the core;
what I need is your voice on top of it.

**👉 Give me, in one message, however roughly:**

- One sentence you would say to a friend about what Botvy does.
- Three things it does that you would actually put on a page.
- A logo, or "make one" and I will draw a wordmark from `packages/tokens` so at
  least it matches the apps.
- Screenshots: I can capture them from the running phone and admin portal, but
  they will show gate test data (`gate-a1b2c3@example.test`, "Gate phone").
  Screenshots of *your* real week look like a product; mine look like a test
  suite. Your call which.

Everything ships in **en + ar** (T1002). I will write both; the Arabic needs
your eye for the same reason as [I8](#i8--arabic-intent-sentences-review).

## I19 — Privacy policy facts

```
OPERATOR NAME:
CONTACT EMAIL:
HOSTING LOCATION:  (e.g. "a machine in my flat in Cairo")
ANALYTICS:         (default: none)
```

Only you know these, and every one of them is a factual claim about you that I
must not invent. A privacy page with a made-up contact address is worse than no
privacy page.

The rest I can write truthfully from the code: what is stored, that it is on
your own hardware, that the model runs locally so chat text never leaves the
machine, that FCM sees notification payloads, that Cloudflare sees TLS metadata
if you took option A above.

The Chrome Web Store **requires** a privacy policy URL if you chose "publish" in
[I16](#i16--chrome-web-store-publish-or-not), so these two items are linked.

## I20 — Deploy target for CD

```
DEPLOY HOST:
DEPLOY USER:
SSH KEY ADDED AS SECRET:  (yes / no)
BASE URL:
```

The workflows in `.github/workflows/` already read `vars.DEPLOY_HOST`,
`vars.DEPLOY_USER`, `secrets.DEPLOY_KEY` and `vars.BOTVY_BASE_URL`. None are
set, so CD is inert — CI builds and tests, and deploys go nowhere.

**👉 Do this if you want pushes to `main` to deploy:**

1. On the host, make a key for the runner only:

   ```bash
   ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/botvy_deploy -N ""
   cat ~/.ssh/botvy_deploy.pub >> ~/.ssh/authorized_keys
   ```

2. GitHub → repo → **Settings** → **Secrets and variables** → **Actions**:
   - **Secrets** → `DEPLOY_KEY` = the whole contents of `~/.ssh/botvy_deploy`
     (the private one, including the BEGIN/END lines).
   - **Variables** → `DEPLOY_HOST`, `DEPLOY_USER`, `BOTVY_BASE_URL`.
3. Delete `~/.ssh/botvy_deploy` from the host afterwards — the public half in
   `authorized_keys` is all the host needs.

Leave it unset and deploying stays what it is today: `git pull` and
`docker compose up -d --build` by hand, which for one host is a defensible
choice.

---

# P11 — `025-hardening-release`

## I21 — Rotate the Firebase key, for real

```
NEW KEY IN PLACE:   yes — verified, id ends 424ead (10 September)
OLD KEY DELETED:    (yes / no)  ← the half that matters
```

**Half done, and the remaining half is the one that closes the hole.**

You replaced the key on 10 September. `secrets/firebase-admin.json` now carries
`private_key_id` ending **`424ead`**, same project (`bot-vy`), same service
account (`firebase-adminsdk-fbsvc@bot-vy.iam.gserviceaccount.com`). Push keeps
working; nothing in `.env` needed changing.

What I cannot see from here is the console, so I cannot tell whether the old key
was *deleted* or merely superseded. **A Google service-account key stays valid
until it is deleted** — creating a new one does not revoke the old. If the row
whose id ends `c3a2a5` is still listed under Keys, that credential still grants
full admin over the project: all data, and the ability to mint an auth token for
any user. It was committed to this repository and appeared in a chat transcript,
so it must be assumed to be in someone else's hands.

**👉 If you have not already, do just step 3:**

1. <https://console.cloud.google.com/iam-admin/serviceaccounts> → the project →
   the `firebase-adminsdk-*` account → **Keys**.
2. **Add key** → JSON → download. Save it as `secrets/firebase-admin.json`
   (replacing the current file; the directory is gitignored).
3. **Delete the old key** — the row whose id ends **`c3a2a5`**. Google asks to
   confirm; it is safe, because the process is already running on `424ead`.
4. `docker compose restart backend worker` — only if you have not restarted
   since swapping the file. The credentials are read at boot, so a container
   that came up before the swap is still holding the old key in memory.

`FIREBASE_CREDENTIALS_FILE=/secrets/firebase-admin.json` already points at the
right path, so no `.env` change — which is exactly why the swap needed no
deploy, and also why nothing in the running system announced it.

Once `c3a2a5` is gone, T1105's rotation clause is satisfied ahead of P11 and
this item closes for good.

## I22 — The release signing keystore

```
KEYSTORE CREATED:  (yes / no)
BACKED UP TO:
```

Android identifies an app by its signature. **Lose this keystore and you can
never ship an update to anyone who installed a build signed with it** — not with
a support ticket, not with a new key. They uninstall and reinstall, losing their
local data. This is the single most unrecoverable item in the whole register.

`build.gradle.kts` falls back to debug keys when it is absent, so builds work
without it — but debug keystores are generated *per machine*, so two machines
produce two signatures and Android refuses to install one over the other. Fine
for testing, not for anything you hand to a person.

**👉 Do this:**

```powershell
keytool -genkey -v -keystore $env:USERPROFILE\botvy-release.jks `
  -keyalg RSA -keysize 2048 -validity 10000 -alias botvy
```

It asks for a store password, a key password and a name; any answers are fine,
but write the passwords down somewhere you will still have in five years.
`-validity 10000` is ~27 years — shorter and the app becomes unshippable when it
expires.

Then create `apps/mobile/android/key.properties` (gitignored):

```properties
storeFile=C:/Users/dell/botvy-release.jks
storePassword=…
keyPassword=…
keyAlias=botvy
```

Forward slashes even on Windows — Gradle reads this as a Java properties file
and a backslash is an escape character there.

**Back up the `.jks` file and the passwords off this machine.** A password
manager entry plus a copy on a drive that is not this one. Not in the
repository, not in `secrets/` (that is gitignored, not backed up).

## I23 — Backup destination

```
DESTINATION:  (default: ./backups on this host)
OFFSITE:      (yes / no)
```

T1101 is nightly `mongodump` + `pg_dump` **and a restore drill executed once** —
a backup nobody has restored is a hypothesis, not a backup.

`BACKUP_CRON` and `BACKUP_RETENTION_DAYS` are already in the environment
contract, and the dumps land in `./backups` on the host. That protects against a
bad migration and a dropped collection. It does not protect against the disk
dying or the flat flooding, because the only copy is on the machine that broke.

**👉 Tell me one of:**

- `local only` — I set it up as it is and the restore drill runs against
  `./backups`. Honest and cheap; say so in `SETUP.md` and move on.
- a path on another drive — I point the volume there.
- `rclone` to something (Drive, B2, S3) — I add a step to the backup container
  and you provide the remote's credentials at that point.

## I24 — Delete `legacy/`

```
YOUR CALL:  (delete / keep)
```

T1105 removes `legacy/` — the whole of v1, currently read-only in the tree and
excluded from tsconfig, oxlint, Prettier and `.gitattributes`.

It costs nothing to keep except noise, and `git` remembers it either way: every
v1 commit stays in the history, so `git show` and `git checkout` of an old tag
work after deletion. There is also a dump of v1's database at
`backups/pre-v2-identity-20260908T181658Z.dump`.

**My default if blank: delete.** The history is the archive; a read-only copy in
the working tree is a second thing to explain to anyone who opens the repo.

## I25 — Import v1 data, or not?

```
YOUR CALL:  (skip / import reminders / import reminders + chats)
```

Accounts and refresh tokens carry over already — same PostgreSQL, same tables.
What does *not* carry over is everything that moved to MongoDB: v1's reminders,
conversations and coaching rows. The blueprint recorded "not migrated" as an
assumption, and T1104 is an optional one-shot script **only if you want it**.

- **skip** (my default) — v2 starts clean. Simplest, and v1's data stays readable
  in the dump if you ever want to look.
- **import reminders** — a day's work, low risk: they map almost one-to-one.
- **import reminders + chats** — messier, because v1 messages have an
  autoincrement cursor and v2 uses a per-user `seq`, so the whole history has to
  be renumbered.

Worth knowing before you decide: **messages are immutable in v2 and that is
load-bearing** — they are pulled by `seq > lastSeq` with no `updatedAt` and no
tombstone. Imported rows must be numbered correctly on the way in, because they
can never be edited afterwards.

---

# G — Google Sign-In, the whole thing

```
WANT IT:            (yes / no / later)
GOOGLE_CLIENT_IDS:  (set / not set)
```

You said **"skip the google button, do the screens, and mark it in md"** during
P1, so this is where it is marked. Here is the state, and the full path to
switching it on whenever you want it.

## What already exists

The code is done — all of it, on both sides:

- `contexts/identity/features/google-sign-in/` verifies the id token, creates an
  account on an unknown `sub` when registration is open, and returns
  `409 link_required` when the email already exists with a password.
- `features/google-link/` completes that link with the password.
- `/auth/google/start` + `/callback` handle the web and extension code flow.
- `infrastructure/google-id-token.verifier.ts` reads the audience from
  `GOOGLE_CLIENT_IDS` and, when it is empty, refuses with *"Google sign-in is
  not configured on this installation; set GOOGLE_CLIENT_IDS"* — a clear refusal
  rather than a confusing 401.
- Mobile has the sign-in and register screens plus `AuthCubit.google(idToken)`.

## What is missing

1. `GOOGLE_CLIENT_IDS` is empty in `.env`, so the verifier refuses everything.
2. The OAuth client IDs it wants do not exist yet — that is the console work
   below, and it is the part only you can do.
3. `google_sign_in` is not in `apps/mobile/pubspec.yaml` and there is no button
   on the screen. **That part is mine** — one dependency and one widget, once the
   client IDs exist.

## 👉 The console work

All of it in the **same Google Cloud project as Firebase** — the one
`secrets/firebase-admin.json` belongs to. A second project mints tokens the
backend will reject.

### Step 1 — OAuth consent screen (once)

<https://console.cloud.google.com/apis/credentials/consent>

- User type **External**. (Internal needs a Workspace domain.)
- App name `Botvy`, support email your own, developer contact your own.
- Scopes: leave the defaults. You need `email`, `profile`, `openid`, and those
  are the non-sensitive defaults, so **no verification review** is required.
- **Publishing status: leave it in Testing**, and add your own Google account
  under **Test users**. Testing allows 100 test users and does not expire for
  non-sensitive scopes. Clicking "Publish app" starts a review you do not need.

### Step 2 — Three OAuth client IDs

<https://console.cloud.google.com/apis/credentials> → **Create credentials** →
**OAuth client ID**, three times. Three, because Google issues one per platform
and each surface gets its own.

**a) Android** — for the phone.

- Application type: **Android**
- Package name: **`org.botvy.botvy`**
- SHA-1: your **debug** certificate first, so you can test before shipping:

  ```powershell
  keytool -list -v -alias androiddebugkey `
    -keystore "$env:USERPROFILE\.android\debug.keystore" `
    -storepass android -keypass android
  ```

  Copy the `SHA1:` line. When you make the release keystore
  ([I22](#i22--the-release-signing-keystore)), add *its* SHA-1 to this same
  client as a second fingerprint — a release build signed with a fingerprint
  Google does not know fails sign-in with no useful error.

**b) Web application** — for the admin portal, and also what the *backend*
validates against.

- Application type: **Web application**
- Authorised redirect URIs: `http://localhost/api/v1/auth/google/callback`
  (add your real domain's equivalent too, once you have one from
  [I17](#i17--domain-name-and-tunnel)).

**c) Chrome extension** — only if you want the button in the side panel.

- Application type: **Chrome extension**
- Item ID: the extension's ID. **An unpacked extension's ID changes with its
  folder**, so either publish it first
  ([I16](#i16--chrome-web-store-publish-or-not)) or pin the ID by putting a
  `key` in the manifest — tell me which and I will wire it.

### Step 3 — Into `.env`

All the client IDs, comma-separated, in one variable:

```
GOOGLE_CLIENT_IDS=1234-android.apps.googleusercontent.com,1234-web.apps.googleusercontent.com,1234-ext.apps.googleusercontent.com
```

It is a list because the verifier checks the token's **audience** against every
entry — a token minted for the phone must be accepted when the phone sends it
and rejected when anything else does. Only list the platforms you actually built;
an unused id in the list is a wider audience than you need.

Then `docker compose restart backend`. Client IDs are not secrets (they ship
inside the app), so they live in `.env` rather than `secrets/` — but the client
*secret* from the web client is one, and only the code flow needs it. I will tell
you if it becomes necessary.

### Step 4 — Mine

`google_sign_in: ^7` into `apps/mobile/pubspec.yaml`, the button on the two auth
screens, `chrome.identity.launchWebAuthFlow` in the extension. An hour, once the
ids exist. The v7 API is `initialize()` then `authenticate()` — the old
`signIn()` is gone, which is why the version pin matters.

---

## How to give me all this

Whatever is easiest: edit the boxes in this file, or paste answers in a message
with the item numbers. Anything left blank on a ❓ is your default taken — that
is a real answer, not a gap, and I will note in each phase's spec which defaults
were taken by silence, so nothing looks decided that was not.

The 🔨 items I cannot default. Those I will ask about again when the phase that
needs them starts, and not before.

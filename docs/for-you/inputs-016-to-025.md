# Everything I will need from you, P2 → P11 (`016` … `025`)

One register for the whole remaining roadmap, written now so nothing arrives as
a surprise mid-phase. Each item has an **answer box** — type into it in place.
Items marked 🔨 are something for you to *do* (a console, a key, a device);
items marked ❓ are a decision only you can make, and every one of those has a
default I will use if you leave it blank. **Silence on a ❓ means "take your
default".** Silence on a 🔨 blocks that phase's gate.

This was written before P2 and is now kept current. As of **14 September** the
phases P2–P11 have all landed, so most of this register is either done or has
quietly taken its default. The short list of what is genuinely still waiting on
you is directly below.

---

# 🔴 Waiting on you — the whole list, four items

Everything else in this file is either finished, or a ❓ whose default was taken
by silence and can still be changed later without a deploy. These four cannot.

| | What | Where it is written up |
|---|---|---|
| **1 — mandatory, blocks the release** | The exposed Firebase service-account key ending **`c3a2a5`** has still not been *deleted* in the Google console. A new key (`…424ead`) is in place and live, but **adding a key does not revoke the old one**. Until that row is gone, a credential that was committed to a public repository still grants full admin over the project | [I21](#i21--rotate-the-firebase-key-for-real) · [`do-2-the-firebase-key-is-still-live.md`](do-2-the-firebase-key-is-still-live.md) |
| 2 | **The release name** — `v2.0.0` or `v1.2.1`. Unanswered. `mobile/pubspec.yaml` is already `2.0.0+2` and the extension manifest is `2.0.0`, so the artefacts are built on the assumption of `v2.0.0`; say the word and they are renumbered | [`decide-1-what-to-call-this-release.md`](decide-1-what-to-call-this-release.md) |
| 3 | **The admin password.** `P@ssw0rd` was your explicit choice and I am not re-opening it on taste. It is raised once more only because a public repository and a public tunnel change what is at stake, and then it is settled either way | [`decide-2-the-admin-password-before-a-public-release.md`](decide-2-the-admin-password-before-a-public-release.md) |
| 4 | **The n8n API key** — still the last failing check in `node infra/verify.mjs` | [I1](#i1--n8n-api-key) |

The rest of the 🔨 items below are things only you can see from where you sit — a
device in your hand, a console you are signed into. None of them blocks anything
today; each one is marked in the table.

## What changed on 13–14 September

Five commits on `026-repo-restructure`, four of them pushed — the last one, the
`SETUP.md` note about Docker, is still local. **Not yet merged into `main` and no
pull request opened.** Nothing in here needed a decision from you.

- **The four apps moved to the repository root.** `apps/backend` → `backend`,
  and the same for `frontend`, `extension` and `mobile`. `packages/` did not
  move. Git recorded all 781 files as renames, so the history follows. Every
  path in this file was rewritten in the same commit — so a command you copy
  out of here is still correct.
- **A new `ai/` directory.** The nine prompt templates moved out of the backend
  into `ai/prompts/`, and the host-side Ollama setup that was scattered through
  `SETUP.md` now lives at [`ai/ollama/SETUP.md`](../../ai/ollama/SETUP.md) with
  a benchmark script beside it. [`ai/README.md`](../../ai/README.md) explains
  why the model is not in compose. This is the answer to
  [I7](#i7--ollama-models-pulled).
- **v1 is fully retired.** `legacy/` is gone, and so are both archives — the
  `backups/*` dumps in the repository and `E:\Work\botvy-v1-archive` — at your
  request. `infra/reset.mjs` and `docs/parity.md` went with them. See
  [I24](#i24--delete-legacy); it also closes [I25](#i25--import-v1-data-or-not),
  because the archive that script would have read no longer exists.
- **`docs/` was pruned.** The per-phase paperwork (`docs/014-foundation/`,
  `docs/015-identity-profile/`) and the index that listed it are gone. What is
  left is this folder, [`../to-review/`](../to-review/),
  [`../restore.md`](../restore.md), [`../security-review.md`](../security-review.md)
  and the architecture diagram.
- **Two defects fixed.** `pnpm gen:contracts` had never been re-run after P10
  and P11, so the published contract was missing `/api/v1/admin/workflows` and
  its activate/deactivate/run routes, `/internal/backups/report`, and the
  GraphQL field `Setting.control` — everything a client is checked against was
  a release behind. Regenerated. And a Flutter test failed every night between
  midnight and 03:00, because its fixture reached across the member's local
  midnight; it is written relative to the member's day now.
- **What is verified and what is not.** Green: `pnpm lint` 0/0 over 663 files
  (and probed — the cross-context rule still fires), 1612 backend tests across
  95 files, 118 in the SDK, 17 in the extension, both backend typecheck
  projects, `flutter analyze` clean, `flutter test` 370 passed, and the
  extension build. **Not yet run:** the two Docker images, `infra/bootstrap.mjs`,
  `infra/verify.mjs`, and the Playwright end-to-end suites. So the code is
  proven and the deployment is not — that is the next session's work, not
  yours.
- **Docker on this machine, for when it wedges again.** Docker Desktop can
  deadlock on its own data disk with `ERROR_SHARING_VIOLATION`, and a reboot
  does **not** clear it. The recipe — kill every Docker process, `wsl
  --shutdown`, then start Docker once — is written into `SETUP.md` under
  *Docker will not start*. Also: building the backend and frontend images at
  the same time crashes buildkit. One at a time.

## When each item bites

Status as of **14 September**. `❓ default taken` means you left it blank, the
phase shipped on my default, and it is a registry key or a preference you can
still change in the admin portal without a deploy — that is a real answer, not a
gap.

| # | Item | Kind | Needed by | Status | Blocks |
|---|------|------|-----------|--------|--------|
| [I1](#i1--n8n-api-key) | n8n API key | 🔨 | **now** (carried from P0) | 🔴 **open** | P0 gate 5/5, P2 sweep, P3 tick |
| [I2](#i2--firebase-android-app--google-servicesjson) | `google-services.json` | 🔨 | P2 | 🔴 **in the wrong place** — see the item | push notifications, P2 gate |
| [I3](#i3--a-real-android-device) | An Android device | 🔨 | P2 | only you can say | airplane-mode alarm gate |
| [I4](#i4--chrome-with-developer-mode) | Chrome, developer mode | 🔨 | P2 | only you can say | extension side panel |
| [I5](#i5--label-palette) | Label palette | ❓ | P2 | ❓ default taken — the twelve below | nothing (I have a default) |
| [I6](#i6--the-three-daily-times) | The three daily times | ❓ | P3 | ❓ defaults taken — 21:00 / 22:00 / 08:00, no quiet hours | nothing |
| [I7](#i7--ollama-models-pulled) | Ollama models pulled | 🔨 | P4 | only you can say — steps now at [`ai/ollama/SETUP.md`](../../ai/ollama/SETUP.md) | every chat and extraction |
| [I8](#i8--arabic-intent-sentences-review) | Arabic intent sentences | ❓ | P4 | ❓ no corrections received; the fixture is mine | AR fixture quality |
| [I9](#i9--chat-token-quota) | Chat token quota | ❓ | P4 | ❓ default taken — 200,000/day | nothing |
| [I10](#i10--first-day-of-the-week) | First day of the week | ❓ | P5 | ❓ default taken — Saturday | calendar correctness for you |
| [I11](#i11--your-sports-and-weekly-slots) | Your sports + weekly slots | ❓ | P6 | still yours to give — P6 shipped on seed data | realistic seed, P6 gate |
| [I12](#i12--test-urls-for-ingestion) | Two test URLs | 🔨 | P7 | still yours to give | P7 gate |
| [I13](#i13--youtube-terms-acknowledgement) | YouTube ToS call | ❓ | P7 | ❓ default taken — transcripts **on** | whether transcripts ship |
| [I14](#i14--your-allergies-and-dislikes) | Allergies + dislikes | 🔨 | P8 | still yours to give — the gate ran on a throwaway dairy profile | P8 allergen gate |
| [I15](#i15--meal-mode-and-a-starter-library) | Meal mode + library | ❓ | P8 | ❓ default taken — `library`, unseeded | nothing |
| [I16](#i16--chrome-web-store-publish-or-not) | Web Store: publish? | ❓ | P9 | ❓ default taken — self-host | distribution only |
| [I17](#i17--domain-name-and-tunnel) | Domain + tunnel token | 🔨 | P10 | not set — `TUNNEL_TOKEN` empty, `CADDY_SITE=:80`, so LAN only | public site reachable |
| [I18](#i18--marketing-copy-and-brand) | Copy, logo, screenshots | 🔨 | P10 | still yours to give | landing page |
| [I19](#i19--privacy-policy-facts) | Privacy policy facts | 🔨 | P10 | still yours to give | privacy page, Web Store |
| [I20](#i20--deploy-target-for-cd) | Deploy host for CD | 🔨 | P10 | not set — CD is inert | automatic deploys |
| [I21](#i21--rotate-the-firebase-key-for-real) | Rotate Firebase key | 🔨 | **P11, mandatory** | 🔴 **half done — the old key is still live** | release |
| [I22](#i22--the-release-signing-keystore) | Release keystore | 🔨 | P11 | not created — no `mobile/android/key.properties` | shippable APK, forever |
| [I23](#i23--backup-destination) | Backup destination | 🔨 | P11 | default taken — `../backups` on this host, no offsite copy | restore drill |
| [I24](#i24--delete-legacy) | Approve deleting `legacy/` | ✅ delete | P11 | ✅ **done 13 Sep**, archives included | — |
| [I25](#i25--import-v1-data-or-not) | Import v1 data? | ❓ | P11 | ✅ **moot** — the archive it would read is gone | — |
| [G](#g--google-sign-in-the-whole-thing) | **Google Sign-In** | 🔨 | whenever you want the button | not set — `GOOGLE_CLIENT_IDS` is empty, so the verifier refuses | the Google button on all four surfaces |

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

**Where this stands on 14 September.** There is now a key-shaped value in `.env`
— `N8N_API_KEY` is a 267-character JWT, which is the right shape for one of
n8n's. But the gate has not been re-run since, and `infra/verify.mjs` has not
been run at all against the restructured tree, so I cannot say whether the key
works. This item stays open until the gate reports 5/5. Tell me and I will run
it.

If you would rather not mint one: `bootstrap.mjs` **skips** rather than fails,
and you can import `workflows/*.json` by hand from the editor's
**Import from File**. The cost is that every future phase's workflow import
becomes a manual step, and the gate never reaches 5/5.

---

# P2 — `016-tasks-labels-reminders`

## I2 — Firebase Android app + `google-services.json`

```
google-services.json IN PLACE:  downloaded — but at the wrong path (14 September)
PACKAGE NAME USED:              org.botvy.botvy ✅
```

**🔴 Read this before anything else in this item.** You did download the file —
there is a `google-services.json` at the **repository root**, for project
`bot-vy`, package `org.botvy.botvy`, which is exactly right. Gradle does not
read it there. It reads `mobile/android/app/src/prod/google-services.json` and
nowhere else (`mobile/android/app/build.gradle.kts:28`), and applies the Google
Services plugin only if that exact file exists — so a `prod` build today is
silently building **without push**, which is the failure mode this item was
written to avoid.

Move it:

```powershell
mkdir E:\Work\botvy\mobile\android\app\src\prod
move E:\Work\botvy\google-services.json E:\Work\botvy\mobile\android\app\src\prod\
```

Both locations are gitignored (`.gitignore:66-69`) so nothing leaked; the root
entry exists precisely because a stray copy there is a leak waiting to happen.
Move it rather than copy it.

Push is how a reminder reaches a phone that has been closed for two days. The
server side is already wired (`secrets/firebase-admin.json` exists); the *phone*
side needs its own config file, and it is not in the repository because it
carries a live key.

`mobile/android/app/build.gradle.kts` already looks for it and applies the
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
   `mobile/android/app/build.gradle.kts:40`; a mismatch produces a config
   file the plugin silently ignores.
4. Nickname `Botvy`. Skip the Debug SHA-1 unless you are also doing
   [G](#g--google-sign-in-the-whole-thing); FCM does not need it.
5. Download `google-services.json` and put it at:

   ```
   mobile/android/app/src/prod/google-services.json
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
`extension/.output/chrome-mv3`. It stays loaded across restarts; a rebuild
needs the ↻ on its card.

## I5 — Label palette

```
YOUR CHOICE:  (leave blank for my default)
```

Labels get a fixed palette to pick from, plus a custom colour. Nobody sees the
hex values but you, so this is purely taste.

**Correction to what this file said first.** I described a default I was going to
pick. There was no need: `labels.palette` was already registered in P0 with
twelve colours, and P2 reads that key rather than any literal — a hard-coded
default is a bug by constitution XII. So the palette exists, and the question is
only whether you want it changed:

| | | | |
|---|---|---|---|
| `#ef4444` red | `#f97316` orange | `#f59e0b` amber | `#eab308` yellow |
| `#84cc16` lime | `#22c55e` green | `#14b8a6` teal | `#06b6d4` cyan |
| `#3b82f6` blue | `#6366f1` indigo | `#a855f7` purple | `#ec4899` pink |

A new label takes the first of these you are not already using, and cycles once
you have used all twelve. Any `#rrggbb` you type is accepted too.

Leave this blank and it stays as above. It is an operator setting, so you can
also change it later in the admin portal without a deploy — which is the whole
reason it is a registry key and not a constant.

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

**Since 13 September this has a proper home.** Everything about the model now
lives in [`ai/`](../../ai/): [`ai/ollama/SETUP.md`](../../ai/ollama/SETUP.md) is
the install, the service unit and the binding, with a `benchmark.sh` beside it;
[`ai/README.md`](../../ai/README.md) says why Ollama is on the host rather than
in compose, and carries the table of registry keys below. The nine prompt
templates moved there too, as `ai/prompts/`. If the two disagree with what
follows, they are newer.

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

Right now the edge is `CADDY_SITE=:80` on `EDGE_PORT=8090` — plain HTTP,
reachable on the LAN, and `TUNNEL_TOKEN` is empty so the `cloudflared` profile
is off. A public landing page needs a hostname and TLS. Two ways:

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
OLD KEY DELETED:    NOT YET, as of 14 September  ← the half that matters
```

**Half done, and the remaining half is the one that closes the hole. This is the
one mandatory blocker for the release.** It is also pulled out into its own file,
[`do-2-the-firebase-key-is-still-live.md`](do-2-the-firebase-key-is-still-live.md),
because it is five minutes of work and everything else is waiting behind it.

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
KEYSTORE CREATED:  no — there is no mobile/android/key.properties (14 September)
BACKED UP TO:
```

Not a blocker for merging, but it *is* a blocker for the release build that
T1142 publishes: without it the APK is signed with this machine's debug key.

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

Then create `mobile/android/key.properties` (gitignored):

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
DESTINATION:  default taken — ./backups on this host (BACKUP_DIR unset)
OFFSITE:      (yes / no)  ← still unanswered
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

## I24 — Delete `legacy/` ✅

```
YOUR CALL:  delete  (answered 13 September)
```

Done, as T1123. `legacy/` is gone from the tree along with every ignore entry,
exclude and comment that named it, and `infra/reset.mjs` with it — archiving and
retiring v1 was that script's whole job. `docs/parity.md` went too, for the same
reason: its subject was a system that no longer exists, and the one finding it
produced (the rate-limit regression) is fixed and recorded in
[`../security-review.md`](../security-review.md).

You also chose to delete the archives, which the original version of this item
offered as the safety net. Both are gone: the repository's `backups/` dumps are
deleted (the directory is empty), and `E:\Work\botvy-v1-archive` — the 21 MB of
`v1-all.sql`, `v1-members.csv` and a tar per volume, taken on 11 September — is
deleted outright.

**So the git history is the only remaining trace of v1.** Every v1 commit is
still there and `git show` or `git checkout` of an old tag still works, so the
*code* is recoverable. The **data is gone for good** — it was never in git, and
there is no copy anywhere else. That was deliberate and it is not reversible.

## I25 — Import v1 data, or not?

```
YOUR CALL:  no longer a choice — the archive it would read is gone (13 September)
```

**This item closed itself, and you should know how.** The import was always a
one-shot script reading the archived v1 dump. When you chose in
[I24](#i24--delete-legacy) to delete both archives, the input disappeared, so
`infra/import-v1.mjs` was struck from the phase (T1130 and T1131 in
`specs/025-hardening-release/tasks.md` are marked struck, not done). **v2 starts
clean** — which was my default anyway, so nothing was lost that you had asked
for.

Two corrections to what this item originally said, because both were wrong by
the time it mattered:

- It said accounts and refresh tokens carry over, same PostgreSQL, same tables.
  They did not: the reset on 11 September rebuilt PostgreSQL from nothing, so
  **no v1 account carried over**. The archived list had 35 rows, four of them
  real people (you, `admin`, and two example accounts) and thirty-one end-to-end
  test detritus; all four real ones already use v2, and none of the 35 was
  banned. That is T1121, and it is why moving members turned out to be no work.
- It offered "v1's data stays readable in the dump if you ever want to look".
  There is no dump any more.

Kept for the record, because it is the reason the import is not there: **messages
are immutable in v2 and that is load-bearing** — they are pulled by
`seq > lastSeq` with no `updatedAt` and no tombstone. Anything imported would
have had to be numbered correctly on the way in, because it could never be
edited afterwards.

---

# G — Google Sign-In, the whole thing

```
WANT IT:            (yes / no / later)
GOOGLE_CLIENT_IDS:  not set — still empty in .env (checked 14 September)
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
3. `google_sign_in` is not in `mobile/pubspec.yaml` and there is no button
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

`google_sign_in: ^7` into `mobile/pubspec.yaml`, the button on the two auth
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

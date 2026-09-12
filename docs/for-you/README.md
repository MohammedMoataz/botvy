# Everything I need from you

Two horizons.

**Now** — the three still-open items from **P0** (`specs/014-foundation`) and
**P1** (`specs/015-identity-profile`), one file each, listed below.

**Later** — [`inputs-016-to-025.md`](inputs-016-to-025.md) is the whole
remaining roadmap in one register: 25 items plus the Google Sign-In walkthrough,
each with an answer box, a "needed by" phase and exact steps or commands. Read
it once so nothing arrives as a surprise; answer each item when its phase comes
up. Every decision in it has a default, so leaving one blank is an answer.

**How to use this folder.** One file per item, each with an answer box at the
top. **Delete a file once you have answered it** — an empty folder means nothing
is waiting on me.

Things to *read* rather than answer are in [`../to-review/`](../to-review/).

---

## ✅ Answered — nine of twelve

All six decisions and three of the six actions came back on 9 September and
their files are gone. What each answer was and what it cost was recorded in
`docs/015-identity-profile/decisions-answered.md`, which went with the rest of
the phase paperwork; the git history has it if a reason is ever needed again.

Two of them were work, and both are done: **every read moved to GraphQL** and
the six REST read routes are gone (A4), and `.env.v2` is folded into `.env`
(A5). The other four were "leave it", and the reasons are recorded so nobody
re-opens them by accident.

---

## ✅ All twelve answered

D1 and D3 both came back on 10 September and their files are gone.

- **D1** — you restarted Docker from the tray. The engine came back and both
  gates ran: **P1 13/13**, **P0 4/5**, the fifth being I1 below.
- **D3** — you rotated the Firebase service-account key. `secrets/firebase-admin.json`
  now carries key id `…424ead`; the exposed `…c3a2a5` is no longer the live key.
  **One thing left to confirm:** adding a key does not revoke the old one, so
  the exposed key stays valid until it is *deleted* in the console. See
  [I21](inputs-016-to-025.md#i21--rotate-the-firebase-key-for-real).

---

# 🔴 Now — the release and the key

Three files left, from the P10/P11 sessions on 11–12 September. The reset has
been run and v1 is retired, so those two are gone:

| File | What it is |
|---|---|
| [`do-2-the-firebase-key-is-still-live.md`](do-2-the-firebase-key-is-still-live.md) | `I21`, pulled out on its own: the new key is in place, the exposed one is **not deleted**, and that is the half that closes the hole. The one mandatory blocker for the release |
| [`decide-1-what-to-call-this-release.md`](decide-1-what-to-call-this-release.md) | `v2.0.0` or `v1.2.1`. My recommendation is `v2.0.0` and the reasoning is one table |
| [`decide-2-the-admin-password-before-a-public-release.md`](decide-2-the-admin-password-before-a-public-release.md) | Raised once more, only because publishing changes what is at stake. Settled either way after this |

## Still open — the roadmap register

| # | What | Why it is still here |
|---|---|---|
| [I1–I25 + G](inputs-016-to-025.md) | Inputs for P2–P11 (n8n key, `google-services.json`, Ollama models, keystore, Google Sign-In, …) | Nothing is blocked today. The n8n API key (I1) is the one carried over from P0 and it is the last failing check in `node infra/verify.mjs` |
| — | Open a pull request | **The work is merged into `main` already**, so this is only about getting CI to run on a phase branch for the first time — `ci.yml` triggers on `push: [main]` and on `pull_request`, so a plain branch push runs nothing. When 016 has commits: `gh pr create --base main --head 016-tasks-labels-reminders`. Yours to make, since a PR is public on your repo |

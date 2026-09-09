# Everything I need from you

Both phases in one place: **P0** (`specs/014-foundation`) and **P1**
(`specs/015-identity-profile`). Nothing else in `docs/` is waiting on you.

**How to use this folder.** One file per item. Each starts with an answer box —
type in it, save, and that is enough. **Delete a file once you have answered
it**; an empty folder means nothing is waiting on me.

Things to *read* rather than answer are in [`../to-review/`](../to-review/).

---

## 🔨 Do — six things only you can do

| # | What | Why it matters | Done |
|---|---|---|---|
| [D1](do-1-free-disk-space.md) | **Free disk space** | 🔴 **The one thing blocking both phases.** Two phases are code-complete and neither gate can run | ☐ |
| [D2](do-2-corepack-enable.md) | `corepack enable` | `pnpm` is not on your PATH; my workaround dies with this session | ☐ |
| [D3](do-3-rotate-firebase-key.md) | Rotate the Firebase key | A committed credential is still live | ☐ |
| [D4](do-4-push-a-branch.md) | Push a branch | CI has never run once, on any of this | ☐ |
| [D5](do-5-ghcr-visibility.md) | GHCR package visibility | Only if you deploy by pulling images | ☐ |
| [D6](do-6-google-oauth-ids.md) | Google OAuth client ids | Only if you answer A1 with "configure it" | ☐ |

## 🤔 Decide — six calls that are yours, not mine

| # | Question | If you say nothing | Answered |
|---|---|---|---|
| [A1](decide-1-google-sign-in.md) | Google sign-in: configure, defer, or drop? | stays built with no button | ☐ |
| [A2](decide-2-rate-limiting.md) | Rate-limit `/auth/login` before P1 is done? | unlimited password guessing | ☐ |
| [A3](decide-3-ban-window.md) | A banned member keeps access for 15 minutes | window stays open | ☐ |
| [A4](decide-4-graphql-migration.md) | When do the clients move to GraphQL? | two read paths, indefinitely | ☐ |
| [A5](decide-5-env-files.md) | One `.env` or two? | two (working today) | ☐ |
| [A6](decide-6-backup-retention.md) | Retention lives in two places — accept? | accepted, documented | ☐ |

---

**If you only do one thing:** [D1](do-1-free-disk-space.md). Everything else can
wait; that cannot, because it is why neither phase has been verified against a
running stack.

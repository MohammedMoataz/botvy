# 📖 R1 — The pre-016 review

A fresh-context review of P0 and P1, before phase 016 begins. Twenty-six
findings; **thirteen are fixed**. Everything below is the summary; the full
record with each finding's reasoning was `docs/015-identity-profile/review-findings.md`,
which went with the phase paperwork and is still in the git history.

## ☐ Read?

```
READ:            (yes)
DISAGREE WITH:
START 016?       (yes / not yet)
```

---

## The part worth your attention

**Three defects were critical, and all three were invisible to 483 passing
tests.**

1. **The backend could not boot — in either role.** `IdentityModule` declared no
   imports while four of its providers injected things from elsewhere.
2. **No domain event could reach a handler.** The relay's dispatch was a
   three-case switch and `identity.UserRegistered` was not one of them — so
   **every account ever created would have got no profile and no preferences**,
   and every deletion would have left photo bytes on the volume.
3. **A refresh token could be accepted twice.** Two concurrent refreshes both
   succeeded, and replay detection died for that family.

Nothing in the repository ever asked Nest to assemble the application or
dispatched an event, so no test could have caught any of them. There is one that
does both now, and **it found a fourth defect on its first run** — my own fix for
the first was incomplete.

That is the lesson I would take from this review: the tests were not weak, they
were pointed at the wrong things. Every fix in this pass came with the check
that would have caught it.

## What is fixed

| # | Was | Severity |
|---|---|---|
| 1 | The backend could not boot, either role | critical |
| 2 | No domain event could reach a handler | critical |
| 3 | A refresh token could be accepted twice | critical |
| 4 | Google sign-in could take over an account by email | high |
| 5a | A banned administrator could un-ban themselves | high |
| 6 | The SDK deadlocked permanently on a refused refresh | high |
| 7 | `@IsEmail()` rejected the documented `admin` login | high |
| 8 | `GET /profile/photo` returned JSON, not an image | high |
| 9 | `/api/v1/admin/settings` did not exist | high |
| 21 | Every 404 became "not available in this build yet" | high |
| 10 | **GraphQL and the WebSocket gateway were never built** | — |
| 11 | A context could import another context, unenforced | — |
| 12 | Domain events were not written in the aggregate's transaction | — |
| 15 | **Mobile had no way to set the gateway URL** | — |

Findings 10 and 15 were not bugs in written code — they were capabilities the
phase tasks claimed and did not build. P0 ticked four tasks for a GraphQL edge
and a socket gateway; what it shipped was a scalar file, a nudge service and a
guard that no module provided. So every client connected to a path that answered
nothing, and every nudge in the application went nowhere.

## What is still open

| # | What | Why it is not fixed |
|---|---|---|
| 5b | A banned member keeps access for ~15 min | needs a decision — [A3](../for-you/decide-3-ban-window.md) |
| 13 | No rate limiting on credential endpoints | needs a decision — [A2](../for-you/decide-2-rate-limiting.md) |
| 14 | `CONTRACTS_GENERATED = false`; the SDK is hand-written | turning it on regenerates clients on four surfaces |
| 16 | Onboarding "Skip" is a redirect trap | small, real |
| 17 | The drift ladder's catch-all cannot catch the *next* bump | small, real |
| 22 | The three clients' Socket.IO shapes still disagree | server side now exists; clients need one pass |
| 23 | Event payloads disagree with the catalogue; two events uncatalogued | documentation vs code |
| 18–20, 24–25 | Unreachable mobile wiring (push never starts, notification permission never requested, no route for password change) and bare literals principle XII may want as registry keys | a phase's worth of small items |

## Three things the fixes turned up on the way

- **`@nestjs/graphql@13` cannot run on NestJS 12.** It peers on Nest 11 and
  deep-imports a path Nest 12's exports map rewrites to a file that does not
  exist. A *runtime* failure, so the blueprint's pin was unusable. Both it and
  `@nestjs/apollo` went to 14, bringing `@apollo/server` 5.
- **oxlint ignores `patterns` when `paths` is also present.** The driver-import
  lint rule had both, so its `mongoose/*` and `@prisma/client/*` half had been
  checked by nothing since P0. The review itself probed that rule and called it
  live, because it probed the half that works.
- **The admin seed wrote a user and its event with no transaction.** The one code
  path that runs on every first boot, where a lost event means the seeded
  administrator has no profile — and the seed never runs again, because it finds
  the account. Found by a new guard within a minute of it existing.

## What the review found clean

Worth recording, because it is what 016 gets to rely on: the guards in both
directions, the replay rule itself, the Google audience check, principle XI on
the backend (no server-local time anywhere), principle XII's `readOnly` trap,
no context opening another context's store, cross-surface field names agreeing,
and the drift 1→2 ladder.

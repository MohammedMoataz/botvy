# What I need from you — Identity & Profile (P1)

Eight items. Four are decisions only you can make, three are credentials or
commands I cannot run, and two are heads-ups — one of which you should read
first (C0).

Answer inline — write after the `→` on each `**Your answer:**` line. A word is
enough. Anything left blank I treat as "not decided yet" and leave alone.

P0's equivalent is
[`../014-foundation/inputs-needed.md`](../014-foundation/inputs-needed.md), and
its A1 and B1 are still open there. The pre-016 review's full findings are in
[`review-findings.md`](review-findings.md).

---

## A. Decisions

### A1. Google sign-in: configure it, or drop it from P1?

Everything behind it is built and tested: `POST /auth/google`,
`/auth/google/link`, the audience check, the three-case fork, the SDK's
`GoogleLinkRequired`, and the mobile cubit's `signInWithGoogle`/`linkGoogle`.
What does not exist is a button on any of the three surfaces, because
`GOOGLE_CLIENT_IDS` is empty and a button that always fails teaches people the
app is broken.

To turn it on you need OAuth client ids from the Google Cloud console — one per
surface, because each has its own:

| Surface | Client type |
|---|---|
| Android | Android, with your signing certificate's SHA-1 |
| iOS | iOS |
| Web portal | Web application, with the portal's origin as a redirect URI |
| Extension | Chrome App, keyed to the extension id |

Then `GOOGLE_CLIENT_IDS=id1,id2,id3,id4` in `.env`. The server accepts a token
addressed to any of them.

| Option | What happens |
|---|---|
| **configure it** | You supply the ids; I wire the buttons and the link form on all three surfaces |
| **defer to P9** | Stays as it is — endpoints live, no buttons. The extension phase is the natural place, since its flow is the fiddliest |
| **drop it** | I remove the endpoints and the `google-auth-library` dependency rather than leaving dead code |

**Your answer:** → _(configure it / defer to P9 / drop it)_

---

### A2. Should `/auth/login` be rate limited before P1 is called done?

It is public and unthrottled. Somebody who can reach the port can try passwords
as fast as the network allows, and this installation's administrator login is
published in `SETUP.md`.

I did not add it because it is genuinely a hardening concern with a phase of its
own (`specs/025`), and because the shape matters: per-IP behind a tunnel is
nearly meaningless, per-account invites somebody to lock the Owner out of their
own portal, and the useful version is usually both with a lockout that expires.
That is a design decision rather than a line of code.

| Option | What happens |
|---|---|
| **now, simple** | Per-account exponential backoff after 5 failures, in-memory, ~40 lines. Resets on success and on restart |
| **now, properly** | Per-account and per-IP, stored in Mongo so it survives a restart and both roles agree. Half a day, and it wants its own spec |
| **leave to P11** | Recorded in `not-done.md` and picked up with the rest of the hardening |

**Your answer:** → _(now simple / now properly / leave to P11)_

---

### A3. A banned member keeps API access for up to 15 minutes. How should that close?

`JwtAuthGuard` verifies the token's signature and nothing else. Ban and delete
revoke refresh families, which stops the member getting a *new* access token —
but the one in their hand keeps working until it expires, and
`JWT_ACCESS_TTL` defaults to 15 minutes.

I fixed the sharp edge of this already: a banned administrator could un-ban
themselves with that token and then ban whoever banned them. The window itself
is still open.

I did not fix it because the correct version needs a revocation store that
*both roles* agree on, and it collides with a gap the review did not raise:
the relay runs in the **worker**, so an event that invalidates a cache never
reaches the **backend** role. That is already true of the settings cache today —
an operator changing a key in the portal updates the backend's cache directly,
but the worker only learns through the relay, and the reverse never happens.
One mechanism would close both, which makes this a design decision rather than
a patch.

| Option | What happens | Cost |
|---|---|---|
| **shorten the window** | `JWT_ACCESS_TTL=2m` in `.env`. One line, closes most of it, costs a refresh round trip every two minutes per client | minutes |
| **revocation store** | A `token_revocations` collection with a TTL index, an in-memory cache in each role, and a cross-role invalidation channel that also fixes the settings cache. The guard becomes async | half a day, wants its own spec |
| **leave to P11** | Recorded with the rest of the hardening. The escalation path is already closed | — |

My recommendation is **shorten the window now** and do the revocation store in
P11 alongside the rate limiting — the two want the same cross-role channel, and
building it once for both is cheaper than twice.

**Your answer:** → _(shorten / revocation store / leave to P11)_

---

### A4. The clients still read over REST. When do they move to GraphQL?

The read edge exists now — nine queries at `/graphql`, generated into
`packages/contracts/schema.graphql`. Nothing calls it. All four surfaces read
through the REST `GET`s that P0 and P1 shipped, because those are what they were
built against.

Both edges are thin adapters over the *same* query handlers, so there is no
duplicated logic and no risk of the two disagreeing about an answer. What is
duplicated is the transport, and that is the part I do not want to leave
undecided: constitution X says reads are GraphQL, and two read paths with one
blessed is the kind of thing that quietly becomes permanent.

| Option | What happens | Cost |
|---|---|---|
| **migrate in P2** | P2 already adds tasks, labels and reminders to every surface. Their reads land on GraphQL from the start, and P1's move with them — one pass over four clients instead of two | a day inside a phase that is touching those files anyway |
| **migrate now** | A pass over the SDK, the portal, the extension and the phone before 016 starts, with nothing new to show for it | a day, and P1's gate has not run yet |
| **keep both** | REST reads stay supported. Constitution X gets an amendment saying so, because an unmet principle is worse than an honest one | an hour, plus the amendment |

My recommendation is **migrate in P2**. The reads that phase adds are the bulk
of what the phone actually shows, and doing P1's four queries alongside them
costs almost nothing extra; doing it now costs the same day and moves nothing
forward.

**Your answer:** → _(migrate in P2 / migrate now / keep both)_

---

## B. Things only you can do

### B1. `corepack enable`, from an administrator PowerShell — still open

```powershell
corepack enable
```

Carried over from P0's B1, unchanged. `pnpm` is still not on your PATH and I am
still working around it with shims in `%LOCALAPPDATA%` that vanish when this
session ends.

**Done?** → _(yes / no)_

---

### B2. Free space, so the gate can run — the actual critical path

`D:` was at 4.6 GB of 464 GB, which is what stopped `dockerd` starting at all.
Deleting Docker's own stale 7.36 GB leftover got it up, but `C:` is at 11.9 GB
and `E:` at 8.1 GB, and the container removals went `Dead` again afterwards.

Two phases are now code-complete and waiting on this. Nothing else blocks
either of them.

**Done?** → _(yes / no / partly)_

---

### B3. Google's OAuth ids — only if A1 is "configure it"

The four ids from the table above. Paste them here or put them straight into
`.env` as `GOOGLE_CLIENT_IDS`.

**Your answer:** → _(pasted / in .env / not doing this yet)_

---

## C. Heads-up, no action needed

### C0. The review found three critical defects, and they are fixed

Before you read anything else in this file: a fresh-context review of P0 and P1
found that **the backend could not boot in either role**, that **no domain event
could reach a handler** — so every account created would have got no profile —
and that **a refresh token could be accepted twice**. All three are fixed, along
with six exploitable or user-visible HIGH findings.

The full list, including what is still open, is in
[`review-findings.md`](review-findings.md). Two of the open ones are the
decisions above.

Since then two more are fixed, and both were capabilities P0 marked done and did
not build: **there was no GraphQL edge and no socket gateway at all** — so every
client connected to a path that answered nothing — and **no handler wrote its
domain events in the same transaction as the row**, which the repositories'
own comments all claimed they did. Eleven of twenty-six now fixed.

The part worth your attention: all three criticals were invisible to 483
passing tests, because nothing in the repository ever assembled the application.
There is now a test that does, and it found a fourth defect on its first run.

### C1. What P1 cannot verify without the stack

Three things are written and unproven, and they are all the same kind of thing —
behaviour across a real boundary rather than logic:

- **T153, the gate.** Register on the phone → the member appears in the admin
  Users table with their device → change the password → the second device is
  signed out on its next request. That is the one flow that exercises Identity,
  Profile, the outbox relay, the portal and the phone together.
- **T152's RTL screenshots.** The Arabic strings are done — 74 keys, both
  locales, parity checked programmatically — but the screenshots the task asks
  for need a device.
- **`bootstrap-on-registered` against a real MongoDB.** Its idempotency is
  specified against the in-memory adapter, and the *concurrent* case — two
  deliveries at once — is enforced by the unique index added in T151, which
  only exists once a migration has run.

None of these is a gap in the code. They are the parts a gate exists to catch,
and they are waiting on B2.

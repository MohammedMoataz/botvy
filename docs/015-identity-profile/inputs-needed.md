# What I need from you — Identity & Profile (P1)

Six items. Two are decisions only you can make, three are credentials or
commands I cannot run, and one is a heads-up.

Answer inline — write after the `→` on each `**Your answer:**` line. A word is
enough. Anything left blank I treat as "not decided yet" and leave alone.

Not staged, and excluded in `.git/info/exclude`. P0's equivalent is
[`../014-foundation/inputs-needed.md`](../014-foundation/inputs-needed.md), and
its A1 and B1 are still open there.

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

# E-019 — A new member has no preferences for a few seconds

**Area**: architecture · **Status**: open · **Found**: P6, by the gate patching
a preference three seconds after registering

## What

`POST /auth/register` writes the Postgres row and raises `identity.UserRegistered`
into the outbox. The relay picks it up on its next tick and the
`BootstrapOnRegisteredHandler` writes the member's `profiles` and
`user_preferences` documents. Everything between those two moments is a window in
which the account exists and its Mongo-side furniture does not:

```
PATCH /api/v1/preferences   → 404   "this account has no preferences yet"
query { preferences { … } } → null
query { profile { … } }     → null
```

Measured at about three seconds on this installation, and it is a *relay tick*
rather than a fixed cost — a busy outbox, a restarted worker, or a relay that is
down makes it arbitrarily long.

The P6 gate walked into it: it registered, saved a timetable, materialised a
fortnight in 654 ms and patched `nextPracticeCutoff` before the bootstrap had
run. The gate now retries, which is correct for a gate and says nothing about
what a phone should do.

## Why it is not simply a bug

The eventual bootstrap is the design, and the design is right. Identity is the
only context on PostgreSQL and every other context lives in MongoDB; there is no
distributed transaction between them and constitution I forbids inventing one. A
registration that wrote a Mongo profile inside the Postgres transaction would be
a cross-store write that can half-succeed — which is precisely the failure the
outbox exists to make impossible. The materialiser already carries the matching
branch and says so in as many words: *"Mid-bootstrap: the relay is eventual, so
there is a window after registration in which the profile does not exist."*

The 404 is also honest. The row genuinely is not there, and an endpoint that
invented an empty one would be writing defaults outside the one handler that
owns seeding them — two seeders for one document, which is how two sets of
defaults drift apart.

So nothing here is wrong. What is missing is that **no client is told the window
exists**, and three of them will meet it.

## What it costs

The phone's onboarding is the first screen after registration and P6 added a
sports-and-slots step to it (T664). A member who taps through quickly enough
sends `PUT /athlete/slots` and `PATCH /preferences` inside the window. The slots
call survives — `bootstrap-athlete-profile` creates the profile if the event has
not landed, which is the pattern — and the preferences call does not. So the
visible failure is a member who sets a preference during onboarding, is shown an
error or nothing at all, and finds the default still in force.

The extension and the portal have the same shape on a fresh account, and the
window is invisible in every test we run: the suite binds handlers directly, and
every gate before this one was slow enough to miss it. That is the part worth
recording — it was found by the product getting *faster*.

## What fixing it takes

**The honest fix is to make the client's first call wait rather than fail.** Two
shapes, and the cheap one is probably right:

1. **A readiness signal on the sign-in response.** `POST /auth/login` (and
   register) answers with `bootstrapped: boolean`, and the clients that have a
   first-run path poll `me` until it flips. One field, no new endpoint, and it
   tells the truth: the account is usable and its furniture is on its way.
2. **A short server-side wait on the member's first read.** `ProfileQueryHandler`
   could retry for a second or two before answering null. Tempting and wrong —
   it puts a sleep in a query handler, it is invisible to the caller, and it
   turns a relay outage into slow requests instead of clear ones.

There is a third that is *not* a fix: having `UpdatePreferencesHandler` create
the row on demand. It reads as obvious and it puts the defaults in two places,
and the second copy is the one nobody updates when a registry key is added.

**Recommendation:** the first, in P11's hardening, alongside the onboarding
review — the phone is the only surface where the window is reachable by a human
rather than by a script, and the flag costs one field. Until then the window is
documented here and in the materialiser's own comment, and every client that
meets a 404 on `/preferences` immediately after registering is meeting this and
not a bug.

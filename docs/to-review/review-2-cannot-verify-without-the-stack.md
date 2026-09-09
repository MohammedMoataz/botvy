# 📖 R2 — What is written and unproven

## ☐ Read?

```
READ:  (yes)
```

---

Three things, and they are all the same kind of thing: behaviour across a real
boundary rather than logic. All three wait on
[D1](../for-you/do-1-free-disk-space.md).

- **P0's T092 — the foundation gate.** `infra/verify.mjs` is the gate as a
  command: containers healthy, exactly one non-loopback published port, both
  stores answering, and a second `bootstrap.mjs` run that changes nothing. Never
  executed.

- **P1's T153 — the phase gate.** Register on the phone → the member appears in
  the admin Users table with their device → change the password → the second
  device is signed out on its next request. That is the one flow that exercises
  Identity, Profile, the outbox relay, the portal and the phone together.

- **`bootstrap-on-registered` against a real MongoDB.** Its idempotency is
  specified against an in-memory adapter. The *concurrent* case — two relay
  deliveries at once — is enforced by a unique index added in T151, which only
  exists once a migration has run.

Plus one that needs hardware rather than disk: **T152's RTL screenshots.** The
Arabic strings are done — 85 keys, both locales, parity checked
programmatically — but screenshots need a device.

None of these is a gap in the code. They are the parts a gate exists to catch,
and 531 passing tests cannot substitute for any of them — which is precisely
what the review in [R1](review-1-the-pre-016-review.md) demonstrated.

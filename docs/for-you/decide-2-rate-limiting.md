# 🤔 A2 — Rate-limit `/auth/login` before P1 is called done?

> ⚠️ It is public and unthrottled right now, and this installation's
> administrator login is published in `SETUP.md`.

## ✍️ Your answer

```
ANSWER:  leave to P11

NOTES:
```

---

## Why this is a decision and not just a fix

Anybody who can reach the port can try passwords as fast as the network allows.

I did not just add something, because the *shape* matters and getting it wrong
is worse than waiting: per-IP behind a tunnel is nearly meaningless (every
request arrives from the tunnel), and per-account invites somebody to lock you
out of your own portal by guessing at your address on purpose.

There is also a phase for it already — `specs/025-hardening-release`.

## The options

| Option | What happens | Cost |
|---|---|---|
| **now, simple** | Per-account exponential backoff after 5 failures, in memory. Resets on success and on restart | ~40 lines |
| **now, properly** | Per-account *and* per-IP, in Mongo so it survives a restart and both roles agree | half a day, wants its own spec |
| **leave to P11** | Recorded and picked up with the rest of the hardening | — |

## What I would do

**Leave to P11**, and do it together with [A3](decide-3-ban-window.md) — they
want the same cross-role store, and building it once for both is cheaper than
twice.

Unless this is about to be reachable from the internet. Then **now, simple**,
today.

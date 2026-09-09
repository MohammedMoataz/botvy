# 🤔 A3 — A banned member keeps API access for up to 15 minutes

## ✍️ Your answer

```
ANSWER:  (shorten / revocation store / leave to P11)

IF SHORTEN, WHAT TTL:   (default 15m; I suggest 2m)
```

---

## What is actually open

`JwtAuthGuard` verifies the token's signature and nothing else. Ban and delete
revoke the refresh families, so the member cannot get a **new** access token —
but the one in their hand keeps working until it expires, and `JWT_ACCESS_TTL`
defaults to 15 minutes.

**The sharp edge is already fixed.** A banned administrator could un-ban
themselves with that token and then ban whoever banned them. `unban` has the
self-check `ban` and `setRole` always had. What is left is the window.

## Why I did not just close it

The correct version needs a revocation store that **both roles agree on**, and
it collides with a gap the review did not raise: the outbox relay runs in the
**worker**, so an event that invalidates a cache never reaches the **backend**
role. That is already true of the settings cache — an operator changing a key in
the portal updates the backend's cache directly, and the worker only learns
through the relay. The reverse never happens at all.

One mechanism closes both. That makes this a design decision, not a patch.

## The options

| Option | What happens | Cost |
|---|---|---|
| **shorten the window** | `JWT_ACCESS_TTL=2m` in `.env.v2`. Closes most of it; costs a refresh round trip every two minutes per client | minutes |
| **revocation store** | A `token_revocations` collection with a TTL index, a cache in each role, and a cross-role invalidation channel that also fixes the settings cache. The guard becomes async | half a day, wants its own spec |
| **leave to P11** | Recorded with the rest of the hardening. The escalation path is already closed | — |

## What I would do

**Shorten now**, revocation store in P11 alongside
[A2](decide-2-rate-limiting.md).

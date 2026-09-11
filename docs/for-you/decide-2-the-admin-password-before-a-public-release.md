# Decide: the administrator password, before this goes out as a release

Raised once, you chose `P@ssw0rd`, and the choice stood. Raising it again once
— and only because publishing a release changes what is at stake — then it is
settled either way.

---

## What changed

Until now this was your installation on your machine, reachable through a quick
tunnel you started and stopped. From `v2.0.0` it becomes software other people
install, and the release notes point them at `SETUP.md`.

Three specific things:

1. **The tunnel URL is public and guessable in the sense that matters** — it is
   handed out, it appears in browser history, and it does not expire when you
   close the terminal.
2. **`P@ssw0rd` is in every credential-stuffing word list there is.** It is not
   a weak password in the abstract; it is a password that is *specifically
   tried first*.
3. **The account is `imohammedmoataz@gmail.com`** — a real address, so an
   attacker does not have to guess the username half.

The new rate limit caps anonymous callers at twenty a minute from one address,
which turns an unbounded guessing attempt into a slow one. It does not turn a
bad password into a good one, and a distributed attempt is not limited by it at
all.

## What I would do

Change it to something long and random, store it in your password manager, and
leave the rest alone. It costs one command and you never type it again:

```
POST /api/v1/auth/password   { "currentPassword": "...", "newPassword": "..." }
```

The reset script rebuilds from `.env`, so if you are doing the clean start
anyway, put the new password in `.env` **before** the rebuild and the seeded
account comes up with it. One step instead of two.

## What I am not suggesting

Not asking you to stop using the tunnel, not adding a second factor, not
anything that changes how you work. One value in one file.

---

> **Your call:**
>
> ```
> [ ] I changed it — nothing more needed
> [ ] Keep P@ssw0rd, I understand what it means
> [ ] Change it but keep it typeable, suggest something
> ```

If the answer is "keep it", say so and I will stop raising it — but
`docs/security-review.md` §10 records the decision either way, because a review
that omits the finding its author was overruled on is not a review.

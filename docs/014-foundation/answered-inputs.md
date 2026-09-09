# What you already decided, in P0

Foundation phase (P0), `specs/014-foundation`. The record of answers given, kept
here because the questions themselves have moved to
[`../for-you/`](../for-you/) — a folder that gets deleted as it is answered.

Anything still open is there, not here.

---

## A1. Does v2 keep sharing v1's PostgreSQL? — **separate**

> "I do not have a problem with registering from the beginning again, I feel when
> I start from the beginning and clean data/state it will be better."

Done, and done **without deleting anything.** Since a clean start removes the
reason to share v1's store, v2 became its own compose project — `botvy-v2` —
which namespaces every volume (`botvy-v2_pg_data`). v1's data stays exactly
where it is and v1 remains runnable. No wipe was needed.

The dump taken before any of this is at
`backups/pre-v2-identity-20260908T181658Z.dump` if you ever want v1's accounts
back.

Two consequences worth knowing:

- v2's n8n also starts empty, so the workflows are imported by `bootstrap.mjs`
  rather than inherited.
- P1's T127, importing v1 profiles, became obsolete — see
  [`../015-identity-profile/spec-corrections.md`](../015-identity-profile/spec-corrections.md).

## The seeded administrator — **`imohammedmoataz@gmail.com` / `admin`**

> "the only one thing I need to seed is the admin account that password will
> admin and account will be imohammedmoataz@gmail.com and give the admin
> accessability to change his password"

`ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env.v2`. `infra/.env.example` carries a
placeholder address instead, so nobody copies a working login out of a committed
file.

The password change is `POST /api/v1/auth/password`, it requires the current
password even though you are already authenticated, and it revokes every session
you hold. `mustChangePassword` on the sign-in response is how a client knows to
insist, and `ops.adminPasswordIsDefault` is how the portal warns on every page
load rather than once in a boot log.

The seed never resets an existing password, so a password you change in the
portal survives every restart.

## Google sign-in — **no button, for now**

> "skip the google button, do the screens, and mark it in md"

Endpoints and cubits are built and tested; no surface has a button, because
`GOOGLE_CLIENT_IDS` is empty and a control that always fails teaches people the
app is broken.

Still open as a longer-term call:
[`../for-you/decide-1-google-sign-in.md`](../for-you/decide-1-google-sign-in.md).

## Two Docker builds at once crashes the build server on this machine

Not a decision — a fact discovered twice, worth keeping:

```
target frontend: failed to run Build function: frontend grpc server closed unexpectedly
```

Nothing in the Dockerfiles is at fault; the daemon gives out. Both build fine one
at a time, which is how they are built now. On the Linux or WSL2 docker-ce host
`SETUP.md` recommends for production, it does not happen.

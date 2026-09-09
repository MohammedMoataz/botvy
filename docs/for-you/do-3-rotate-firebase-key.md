# 🔨 D3 — Rotate the Firebase service-account key

> ⚠️ A service-account key was committed to this repository. It is still live.

## ☐ Done?

```
DONE: later
```

---

## Why you and not me

Rotating a live credential is your console and your call. I will not revoke
something you might be using elsewhere.

## What to do

1. Google Cloud console → the project's service accounts → **delete the
   existing key** and create a new one.
2. Put the new JSON in `secrets/` (git-ignored) — `secrets/README.md` has the
   filename the backend expects.
3. `FIREBASE_CREDENTIALS_FILE` in `.env` already points at
   `/secrets/firebase-admin.json`, so keep that filename and no `.env` change is
   needed. (`.env.v2` was folded into `.env` on 9 September.)

Deleting the old key is the part that matters. Adding a new one only stops push
notifications failing; it does not close the old one.

Tracked as `T1113` in `specs/025-hardening-release`, unchanged by either phase.
The full version, with the conditions that make it mandatory before P11, is
[I21](inputs-016-to-025.md#i21--rotate-the-firebase-key-for-real).

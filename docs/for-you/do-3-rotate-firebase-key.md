# 🔨 D3 — Rotate the Firebase service-account key

> ⚠️ A service-account key was committed to this repository. It is still live.

## ☐ Done?

```
DONE:  (yes / no / later)
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
3. `FIREBASE_CREDENTIALS_FILE` in `.env.v2` points at it.

Deleting the old key is the part that matters. Adding a new one only stops push
notifications failing; it does not close the old one.

Tracked as `T1113` in `specs/025-hardening-release`, unchanged by either phase.

# 🔨 D4 — Push a branch, so CI runs once

## ☐ Answer

```
ANSWER: pushed
```

---

## Why this is worth doing

`.github/workflows/ci.yml` and `release.yml` exist and have **never executed**.
Nothing in this entire effort has been pushed to a remote.

Five jobs are written against service containers I could not exercise locally.
They are the same kind of unproven as the gates in [D1](do-1-free-disk-space.md):
plausible, unrun.

If one needs a nudge I would expect the mobile job, which runs `build_runner`
before `analyze`.

## What to run

```powershell
git push -u origin 015-identity-profile
```

Nothing has been pushed, so this creates the branch remotely. It does not touch
`master`.

# 🔨 D2 — `corepack enable`

> Run this from an **administrator** PowerShell.

```powershell
corepack enable
```

## ☐ Done?

```
DONE:  (yes / no)
```

---

## Why you and not me

It fails with `EPERM` for a normal user, because it writes into
`C:\Program Files\nodejs`.

I worked around it with shims in `%LOCALAPPDATA%\botvy-corepack-shims`, which
leave your PATH when this session ends.

## What breaks without it

`pnpm lint`, `pnpm test`, `pnpm build` and `pnpm gen:contracts` all fail with
`'pnpm' is not recognized`, because the root scripts call `pnpm -r`. Not a bug in
the scripts — the documented setup step.

Carried over unanswered from P0.

# 🔨 D5 — GHCR package visibility

> Only matters if you deploy by pulling images rather than building on the host.

## ☐ Answer

```
ANSWER:  (public / keep private / not deploying yet)
```

---

`release.yml` pushes three images: `botvy-backend`, `botvy-frontend` and
`botvy-backups`. The backup sidecar is a built image, so a deploy host has to
pull it rather than build it.

The first tagged release creates all three, and they are **private** by default.
Public means a host can `docker compose pull` without authenticating.

Carried over unanswered from P0.

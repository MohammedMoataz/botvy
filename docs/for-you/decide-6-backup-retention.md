# 🤔 A6 — Backup retention lives in two places. Accept for now?

## ✍️ Your answer

```
ANSWER: accept
```

---

## The duplication

`backup.retentionDays` is a settings-registry key you can retune from the
portal. The backup container runs **outside** the API and cannot read the
registry, so it takes `BACKUP_RETENTION_DAYS` from `.env` instead.

Both default to 14. Retune one and the portal reports a window the job does not
honour.

## Why I left it

The clean fix is an internal endpoint that serves the number. I did not add one
during a gate run, because inventing an endpoint mid-gate is how a foundation
phase turns into two.

## The options

| Option | What happens |
|---|---|
| **accept** | Change both together. Already noted in `SETUP.md` |
| **fix now** | I add `GET /internal/ops/backup-policy` and the sidecar reads it at each run |

## What I would do

**Accept.** One number, changed rarely, documented where you would look. It is a
principle-XII wart rather than a bug, and P11's hardening pass is the honest
place for it.

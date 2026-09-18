# ops/

Operational records that are evidence rather than code: what the running system
said, on the day it said it.

| File | What it is |
|---|---|
| `soak-<version>.log` | One row per daily `/health` sample after a release, written by `node infra/soak-sample.mjs`. Seven consecutive healthy rows are P11's SC-007. |

A row is appended whether the sample passed or failed, and a failed row names
the stale job. A soak whose bad days are missing is a soak that always passes,
so nothing here is ever edited or deleted — a wrong row is followed by a note,
not replaced.

# Foundation phase (P0) — the paperwork

Written while implementing `specs/014-foundation`. The spec says what was meant
to be built; these files say what actually happened, what it cost, and what is
still owed.

One file per question, so you can read the one you care about and skip the rest.

| File | Answers |
|---|---|
| [inputs-needed.md](inputs-needed.md) | **What do you need from me?** Nine items, each with a line to write your answer on. Start here. |
| [defects-found-by-running.md](defects-found-by-running.md) | What was broken, and how it was found |
| [auth-in-p0.md](auth-in-p0.md) | Sign-in and password change — why they landed here, and what P1 still owes |
| [changes-to-existing.md](changes-to-existing.md) | What changed in things I already had |
| [decisions.md](decisions.md) | What you decided for me that I might reverse |
| [spec-corrections.md](spec-corrections.md) | Where the spec was wrong |
| [blocked.md](blocked.md) | What is waiting on a working Docker daemon, and why it was not |
| [not-done.md](not-done.md) | What this phase does not contain |
| [repository-state.md](repository-state.md) | Where the branch stands |

Raw evidence for the defect list is in [`../../gate-logs/`](../../gate-logs) —
git-ignored, since it is command output rather than documentation.

## The short version

The phase's own task list said fifty of fifty-one items were done. Running it
found that `GET /health` did not exist at all, which is why the edge container
had never started, and that eleven other things were broken in ways no amount
of reading would have shown: a backup container restart-looping since the day it
was written, an n8n that had never reached a database, a Postgres image serving
a data directory it could not read the collations of, a relay whose retry ladder
was unreachable dead code.

The one item that needs a decision rather than a fix is in `inputs-needed.md`
under **A1**: v1 and v2 share one PostgreSQL volume, and v2 is serving your live
v1 database right now.

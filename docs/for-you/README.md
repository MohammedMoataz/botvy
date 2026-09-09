# Everything I need from you

Both phases: **P0** (`specs/014-foundation`) and **P1**
(`specs/015-identity-profile`). Nothing else in `docs/` is waiting on you.

**How to use this folder.** One file per item, each with an answer box at the
top. **Delete a file once you have answered it** — an empty folder means nothing
is waiting on me.

Things to *read* rather than answer are in [`../to-review/`](../to-review/).

---

## ✅ Answered — nine of twelve

All six decisions and three of the six actions came back on 9 September and
their files are gone. What each answer was and what it cost is recorded
permanently in
[`../015-identity-profile/decisions-answered.md`](../015-identity-profile/decisions-answered.md).

Two of them were work, and both are done: **every read moved to GraphQL** and
the six REST read routes are gone (A4), and `.env.v2` is folded into `.env`
(A5). The other four were "leave it", and the reasons are recorded so nobody
re-opens them by accident.

---

## Still open — three

| # | What | Why it is still here |
|---|---|---|
| [D1](do-1-free-disk-space.md) | Free disk space | You answered "partly", and it worked: `D:` went 4.6 → 22.8 GB and **Docker starts now.** What remains is running the two gates, which I can do — the file stays so you can see how much headroom is left |
| [D3](do-3-rotate-firebase-key.md) | Rotate the Firebase key | You answered "later". A committed credential is still live; tracked as `T1113` in `specs/025-hardening-release` |
| — | Open a pull request | **The branch is pushed.** But `ci.yml` triggers on `push: [master]` and on `pull_request`, so a branch push runs nothing. One command gets CI onto this work for the first time: `gh pr create --base master --head 015-identity-profile`. Yours to make, since a PR is public on your repo |

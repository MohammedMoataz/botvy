# Repository state

Foundation phase (P0), `specs/014-foundation`.

Where the branch stands: commits, tests, what is pushed, and one incident worth knowing about.

---

- Branch `014-foundation`, **51 commits** ahead of the pre-phase default branch.
- Every commit gated on `oxlint` clean, `tsc --noEmit` clean, and the suite green.
- **240 tests** (222 backend, 18 SDK) plus 7 Flutter tests including both
  migration-ladder assertions.
- Nothing pushed to any remote.
- `main` (renamed from `master` on 10 September) carries the foundation work; the pre-phase tip was `0b195ba`, and
  is all on its own branch, so merging it is your call.

One incident worth knowing: my commit helper corrupted
`specs/014-foundation/tasks.md` by round-tripping it through PowerShell's
`Get-Content`, which reads UTF-8 as the system codepage. Each run re-encoded
every non-ASCII character until the file reached 1.6 GB and could not be read.
It is restored from the last clean commit with every earned mark re-applied, the
helper now does that work in Python, and commit `1aaf6ed` records the whole
thing. No source file was affected.

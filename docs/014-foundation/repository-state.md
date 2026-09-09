# Repository state

Foundation phase (P0), `specs/014-foundation`.

Where the branch stands: commits, tests, what is pushed, and one incident worth knowing about.

---

- Branch `014-foundation`, **51 commits** ahead of the pre-phase master.
- Every commit gated on `oxlint` clean, `tsc --noEmit` clean, and the suite green.
- **240 tests** (222 backend, 18 SDK) plus 7 Flutter tests including both
  migration-ladder assertions.
- Nothing pushed to any remote.
- `master` still points at the remediation commit `0b195ba`; the foundation work
  is all on its own branch, so merging it is your call.

One incident worth knowing: my commit helper corrupted
`specs/014-foundation/tasks.md` by round-tripping it through PowerShell's
`Get-Content`, which reads UTF-8 as the system codepage. Each run re-encoded
every non-ASCII character until the file reached 1.6 GB and could not be read.
It is restored from the last clean commit with every earned mark re-applied, the
helper now does that work in Python, and commit `1aaf6ed` records the whole
thing. No source file was affected.

# enhancements/

Things worth improving that are **not** defects and **not** in any phase's scope.

One file per item. Each says what it is, why it is not simply a bug, what it
costs to leave alone, and what fixing it would take — so a review after the
project can decide each one on its own merits rather than re-deriving the
context.

**What belongs here.** Something I noticed while building that would make the
codebase better, and that I deliberately did not do because it was outside the
task, would have widened a change past what could be verified, or is a judgment
call somebody else should make.

**What does not belong here.** An actual defect. Those get fixed in the phase
that finds them, with a test, and named in the commit message. Three went that
way in P2 — the daylight-saving resolver, the sync vocabulary mismatch and the
pagination cursor — and none of them is in this directory.

**Status** is one of `open`, `done`, or `declined` with a reason.

## Index

| # | Item | Area | Cost of leaving it |
|---|------|------|--------------------|
| [E-001](E-001-prettier-is-not-enforced.md) | Prettier is not enforced anywhere | build | Diff noise; formatting arguments in review |
| [E-002](E-002-powershell-text-mode-prints-nothing.md) | `check-prerequisites.ps1` text mode prints nothing | tooling | A human running it by hand sees an empty answer |
| [E-003](E-003-speckit-skills-hardcode-powershell.md) | The speckit skills hard-code the `.ps1` path | tooling | The slash-commands do not work on Linux |
| [E-004](E-004-cross-context-lint-rule-is-enumerated.md) | The cross-context lint rule enumerates every context | build | 12 patterns per new context, added by hand |
| [E-005](E-005-relay-dispatch-table-is-manual.md) | The relay's dispatch table is written by hand | architecture | A handler that is provided but unlisted never runs, silently |
| [E-006](E-006-optimistic-check-is-not-strict.md) | The optimistic write check admits an equal timestamp | persistence | Two edits in the same millisecond can both win |
| [E-007](E-007-undated-tasks-sort-first-by-label.md) | Undated tasks sort first in the by-label view | product | A cosmetic ordering nobody chose |
| [E-008](E-008-recurrence-text-is-english-only.md) | `recurrenceText` is English only | product | An Arabic-reading member gets an English rule from the server |
| [E-009](E-009-no-gate-imports-the-built-output.md) | No gate imports the built output | build | The third runtime-only defect a green suite has hidden |
| [E-010](E-010-the-typecheck-gate-was-weaker-than-the-build.md) | The typecheck command is weaker than the build | build | "Typecheck clean" does not mean what it sounds like |
| [E-011](E-011-sdk-stores-cannot-use-dexie.md) | The SDK stores cannot use Dexie | architecture | "Today" is now defined in four places |

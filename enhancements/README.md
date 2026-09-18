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

| # | Item | Area | Status |
|---|------|------|--------|
| [E-001](E-001-prettier-is-not-enforced.md) | Prettier is not enforced anywhere | build | open — the tree-wide format commit is the last change on this branch |
| [E-002](E-002-powershell-text-mode-prints-nothing.md) | `check-prerequisites.ps1` text mode prints nothing | tooling | done |
| [E-003](E-003-speckit-skills-hardcode-powershell.md) | The speckit skills hard-code the `.ps1` path | tooling | done |
| [E-004](E-004-cross-context-lint-rule-is-enumerated.md) | The cross-context lint rule enumerates every context | build | done |
| [E-005](E-005-relay-dispatch-table-is-manual.md) | The relay's dispatch table is written by hand | architecture | done |
| [E-006](E-006-optimistic-check-is-not-strict.md) | The optimistic write check admits an equal timestamp | persistence | done |
| [E-007](E-007-undated-tasks-sort-first-by-label.md) | Undated tasks sort first in the by-label view | product | done |
| [E-008](E-008-recurrence-text-is-english-only.md) | `recurrenceText` is English only | product | done |
| [E-009](E-009-no-gate-imports-the-built-output.md) | No gate imports the built output | build | done |
| [E-010](E-010-the-typecheck-gate-was-weaker-than-the-build.md) | The typecheck command is weaker than the build | build | done (P5) |
| [E-011](E-011-sdk-stores-cannot-use-dexie.md) | The SDK stores cannot use Dexie | architecture | done |
| [E-012](E-012-server-composed-messages-are-english-only.md) | Server-composed coach messages are English only | product | done — option two, over the file's own recommendation |
| [E-013](E-013-an-aborted-turn-is-never-metered.md) | An aborted or blocked turn is never metered | product | done — the gap recorded, not closed |
| [E-014](E-014-three-recurrence-expanders-two-of-them-typescript.md) | Three recurrence expanders, two of them TypeScript | architecture | done — the boundary made loud |
| [E-015](E-015-the-meetings-ui-chrome-is-not-localised.md) | The meetings UI's chrome never reached the string table | product | done |
| [E-016](E-016-an-edit-pushed-onto-a-tombstone-is-silently-lost.md) | An edit pushed onto a tombstone is accepted and then silently lost | architecture | done |
| [E-017](E-017-a-back-dated-at-becomes-a-500.md) | A back-dated `at` on a status command becomes a 500 | build | done |
| [E-018](E-018-a-jobs-cadence-is-a-table-somewhere-else.md) | A job's cadence lives in a table somewhere else | build | done |
| [E-019](E-019-a-new-member-has-no-preferences-for-a-few-seconds.md) | A new member has no preferences for a few seconds | architecture | done |
| [E-020](E-020-four-contexts-each-read-one-member-preference-their-own-way.md) | Four contexts each read one member preference their own way | architecture | done |
| [E-025](E-025-a-content-security-policy-the-app-router-can-live-with.md) | A content security policy the App Router can live with | security | done — shipped report-only, `CSP_ENFORCE` flips it |

## The sweep of 18 September 2026

Every open item above was implemented in one branch,
`027-enhancements-and-hardening`, with the route taken recorded per item in
[`docs/decisions/001-the-options-i-chose-on-the-enhancements.md`](../docs/decisions/001-the-options-i-chose-on-the-enhancements.md)
— including the three places where the file's own recommendation was overridden
and why. Two items are `done` in a sense worth reading before trusting the word:
**E-013** is done *as the file recommends*, which is to leave the gap and stop
presenting the usage figure as exact, and **E-025** ships report-only, so the
policy is present and enforcing nothing until somebody watches a browser console
against the running stack and flips `CSP_ENFORCE`.

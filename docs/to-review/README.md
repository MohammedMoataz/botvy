# Things I want you to read

Not decisions — [`../for-you/`](../for-you/) has those. These are statements
about the codebase I want you to disagree with if you do, and one list of what
is still broken.

**How to use this folder.** Each file ends with a confirm box. Tick it or write
what you disagree with. **Delete a file once you have read it.**

| # | What | Length | Read |
|---|---|---|---|
| [R1](review-1-the-pre-016-review.md) | **The pre-016 review** — 26 findings, 13 fixed. Read this one | 5 min | ☐ |
| [R2](review-2-cannot-verify-without-the-stack.md) | Three things that are written and unproven | 2 min | ☐ |
| [R3](review-3-decisions-i-made-for-you.md) | Judgement calls I made on your behalf, each reversible | 3 min | ☐ |
| [R4](review-4-where-the-specs-were-wrong.md) | Places the specs said something the code could not honour | 3 min | ☐ |
| [R5](review-5-two-sessions-one-branch.md) | Another Claude session worked on this branch | 1 min | ☐ |

---

## Is 016 safe to start?

**Yes, with one caveat.** The three critical defects are fixed, and the two
capabilities P2 builds directly on top of — the GraphQL edge and the socket —
now exist. What is still open is listed in
[R1](review-1-the-pre-016-review.md) and none of it blocks P2's design.

The caveat is [R2](review-2-cannot-verify-without-the-stack.md): no gate has
ever run, on either phase. Starting 016 means starting a third phase on two
unverified ones.

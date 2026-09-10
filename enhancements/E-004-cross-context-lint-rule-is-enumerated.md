# E-004 — The cross-context lint rule enumerates every context

**Area**: build · **Status**: open · **Found**: P2, adding `planning`

## What

`oxlint.json`'s constitution-IX rule forbids a context's `domain/` and
`features/` from importing another context, and does so by listing every context
name at every plausible relative depth:

```
../../identity, ../../identity/**, ../../../identity, ...
```

Twelve patterns per context. Seven contexts is 84 patterns, and every new context
adds twelve by hand — in the same change that creates it, or the rule silently
does not cover it.

## Why it is enumerated rather than matched

A wildcard is shorter and wrong. The depth that means "a sibling context"
depends on where the file sits: `../../Y` from `domain/`, `../../../Y` from
`features/<slice>/`. A blanket `../../*` would therefore also forbid a slice
importing *its own* context's `domain/`, which is the most common legitimate
import in the codebase.

Enumerating costs a dozen patterns and is provably right, which is why it was
extended rather than replaced when `planning` landed.

## What it costs

A new context whose author forgets those twelve lines gets no protection, and
nothing fails — the rule simply does not mention them. That is the same shape as
the `patterns`-versus-`paths` bug that left the driver rule half-inert for two
phases: **a lint rule nobody has seen fire is a comment.**

## What fixing it takes

Either of:

- **Generate the config.** A small script builds the context group from the
  directory listing of `apps/backend/src/contexts/`, run in CI with a check that
  the committed file matches. The rule then cannot fall behind the tree.
- **Split by depth.** Two overrides — one scoped to `contexts/*/domain/**`
  forbidding `../../*`, one scoped to `contexts/*/features/*/**` forbidding
  `../../../*` — which makes a wildcard safe because each override knows its own
  depth. Shorter, but it must be probed in both directions, because getting it
  wrong forbids a legal import.

Whichever route, the rule must be probed after the change by writing a file that
should fail and checking that it does. That is a standing requirement in
`CLAUDE.md`, and it is how the `planning` extension was verified.

## What happened in P5, which is the case this file predicted

`meetings` landed without its twelve patterns, and nothing failed. The gap was
found by reading rather than by any check: the rule's own comment says "every
new context adds its name here in the same change that creates it", and somebody
went looking for whether that had been done.

The consequence while it was missing is worth being precise about, because it is
asymmetric. Meetings' own `domain/` and `features/` reaching into Planning *was*
still caught, because `planning` is enumerated — so the new context was policed
in the direction it was most likely to offend. What was unpoliced was the
reverse: nothing stopped another context's `domain/` from importing
`../../meetings/**`, and the whole point of the rule is that it holds in both
directions.

The twelve patterns are in now, and the rule was probed the way this codebase
requires — a file that should fail was written, `pnpm lint` was run, the
"Constitution IX" message appeared anchored on it, and the file was deleted. The
probe is the part that makes the fix real, and it is also the part that makes
the enumeration expensive enough to be worth replacing.

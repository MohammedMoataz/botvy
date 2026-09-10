# E-001 — Prettier is not enforced anywhere

**Area**: build · **Status**: open · **Found**: P2, 10 September 2026

## What

Prettier is a dev dependency and there is no `format` script, no `format:check`,
and no CI step. `npx prettier --check "apps/backend/src/**/*.ts"` at the P2
starting commit reported **143 files** with style issues.

## Why it is not a defect

Nothing is broken. The code compiles, lints and passes its tests, and oxlint —
which *is* enforced — covers everything that matters for correctness. Formatting
is a consistency question, not a correctness one.

## What it costs

Two things, and the second is the expensive one.

A file that has never been formatted picks up an unrelated forty-line diff the
first time anybody runs Prettier over it, which buries the actual change in the
review. That happened during P2: formatting the files this phase touched moved
the count from 143 to 120, and those reformats are mixed into a feature commit
because separating them would have meant two commits over the same lines.

And with no enforced standard, every contributor's editor is the standard. The
argument then happens once per pull request instead of once.

## What fixing it takes

1. `"format": "prettier --write ."` and `"format:check": "prettier --check ."`
   in the root `package.json`.
2. One commit that formats the whole tree and nothing else, so it reviews as
   "no behaviour changed".
3. A `format:check` step in `ci.yml`.

Step 2 is the one to be careful about: it must be its own commit, and its hash
belongs in a `.git-blame-ignore-revs` file — otherwise it becomes the last
author of every line in the repository and `git blame` stops being useful.

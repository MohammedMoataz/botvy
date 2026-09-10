# E-010 — The typecheck command is weaker than the build

**Area**: build · **Status**: open · **Found**: P2

## What

`npx tsc --noEmit -p tsconfig.json` in `apps/backend` and `npx nest build` do
not report the same errors. During P2 the first was clean while the second found
four, including two `TS7006 implicitly has an 'any' type` and two `TS2749`.

`nest build` uses `tsconfig.build.json`, which extends the root config; the root
`tsconfig.json` that a bare `tsc -p` picks up is the looser of the two.

## Why it is not simply a bug

Both configurations are deliberate. The looser one exists so an editor and a
quick check do not drown a work-in-progress file in errors; the stricter one is
what ships. Plenty of projects run exactly this arrangement on purpose.

## What it costs

It cost something concrete here: `tsc --noEmit` was used repeatedly during P2 as
the typecheck gate, reported clean, and was **not** the standard the code had to
meet. The four errors surfaced only when a build was run for an unrelated
reason. Had the phase ended without one, they would have reached CI — where they
would have been caught, but a day later and attached to somebody else's commit.

The deeper cost is that "typecheck clean" stopped meaning anything specific.
Two commands, two answers, and the weaker one is the shorter to type.

## What fixing it takes

Pick one and make it the gate:

- **`"typecheck": "tsc --noEmit -p tsconfig.build.json"`** as a package script,
  so the command a person reaches for is the one the build uses. Cheapest, and
  it removes the discrepancy without changing what compiles.
- Or **align the two configs**, if the looseness of the root one is not actually
  wanted any more — it was likely inherited rather than chosen.

Either way the script belongs in `package.json` next to `test` and `lint`, so
nobody has to remember which invocation is the real one. Related: E-009, which
is the same lesson about a gate that does not test what ships.

# E-009 — No gate imports the built output

**Area**: build · **Status**: open · **Found**: P2, by a defect that reached `main`

## What

Nothing in CI, and nothing in the test suite, ever imports a compiled module
with plain `node`. The gates are `tsc`, `vitest` and `oxlint`, and all three run
against *source*.

## Why that is a gap rather than a preference

It let a real defect through, and the defect is instructive.

`recurrence.ts` did `import { RRule, rrulestr } from 'rrule'`. That type-checks,
because rrule ships type declarations that describe named exports. It passes
every test, because vitest supplies its own CommonJS-ESM interop. And it is
`undefined` at runtime, because this package is `"type": "module"` and Node
synthesises named exports from a CommonJS module only where it can statically
find them — which it cannot in rrule's UMD bundle.

So `node dist/main.js` could not boot. 608 tests were green. The container would
have crash-looped on the first deploy.

This is the **third** defect of exactly this species in this project. The
generated Prisma client was missing from the runtime image and nothing noticed
for two phases, because unit tests never build one. The Mongo migration config
was unreadable ESM and nothing noticed, because nothing had ever run it. And now
this. Every one was invisible to a green suite for the same structural reason:
**the artefact the tests exercise is not the artefact that ships.**

## What it costs

A class of bug that only the P0 container gate can catch — and that gate needs
Docker, a build, and several minutes, so it is run at the end of a phase rather
than on every change. Anything of this shape has the whole phase to hide in.

## What fixing it takes

Cheap, and most of the value is in the cheapest version.

1. **A build-and-import smoke check.** After `nest build`, `import()` each of
   `dist/app.module.js` and `dist/worker.module.js` with plain `node` and assert
   it resolves. That is one script and a few seconds, and it catches every
   interop failure in the whole dependency graph, because importing a module
   imports everything it imports. It was used to verify the rrule fix and it
   found the problem immediately.
2. **A CI step that runs it**, after the existing build.
3. Optionally, boot the app in a `BOTVY_GEN`-style mode with lazy connections,
   which additionally proves the Nest graph resolves against the *compiled*
   code — `app.module.spec.ts` proves it against source today.

Step 1 is the one that matters and it is not a refactor. Worth doing before the
next phase adds another dependency.

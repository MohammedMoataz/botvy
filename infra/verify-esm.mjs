/**
 * Imports the compiled output with plain `node`, and nothing else.
 *
 * ## Why this exists
 *
 * Three defects in this project have shipped, or nearly shipped, because the
 * artefact the tests exercise is not the artefact that runs:
 *
 * 1. The generated Prisma client was absent from the runtime image for two
 *    phases. Unit tests never build an image.
 * 2. The Mongo migration config was unreadable ESM and had never run on any
 *    machine. Nothing had ever run it.
 * 3. `import { RRule } from 'rrule'` type-checked, passed 608 tests, and was
 *    `undefined` at runtime — rrule is CommonJS, this package is `"type":
 *    "module"`, and vitest supplies its own interop that hides the difference
 *    completely.
 *
 * A fourth was caught by hand while writing this: `import { PREFERENCE_FIELDS }
 * from './...handler.js'` compiles, because TypeScript resolves the name
 * through the import graph, and fails at runtime, because an ES module exports
 * only what it says it exports.
 *
 * Every one of those is invisible to `tsc`, invisible to `vitest`, and obvious
 * the instant Node is asked to load the built file. So that is what this does.
 *
 * ## Why importing two modules is enough
 *
 * Importing a module imports everything it imports, transitively. `app.module`
 * and `worker.module` are the two roots the two roles are built from, so
 * between them they pull in every context, every adapter and every third-party
 * package the application actually uses. A broken specifier anywhere in that
 * graph fails here.
 *
 * It does **not** prove the Nest graph resolves — no provider is constructed —
 * and it does not connect to anything. `app.module.spec.ts` covers the first
 * against source, and `infra/verify.mjs` covers the whole stack against real
 * containers. This is the cheap middle: seconds, no Docker, and it catches the
 * one class of bug the other two miss between them.
 *
 * Recorded as E-009 in `enhancements/`, and this is the fix.
 */
import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIST = resolve(process.cwd(), 'apps', 'backend', 'dist');

/**
 * The two roles' entry graphs — and deliberately **not** `main.js`.
 *
 * `main.js` calls `bootstrap()` at module scope, so importing it tries to
 * start the application: it validates the environment, refuses without a
 * database URL, and throws from a promise this check cannot see. The first
 * version of this file included it and reported PASS while printing that
 * failure to the console, which is a false pass — the exact species of
 * vacuous assertion this phase has been finding and fixing.
 *
 * The two module roots carry the same dependency graph without the side
 * effect, which is what makes them the right thing to load.
 */
const ROOTS = ['app.module.js', 'worker.module.js'];

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main() {
  try {
    await access(DIST);
  } catch {
    record(
      'the backend has been built',
      false,
      `${DIST} does not exist; run \`pnpm --filter @botvy/backend build\` first`,
    );
    return;
  }
  record('the backend has been built', true, DIST);

  for (const root of ROOTS) {
    const file = join(DIST, root);
    try {
      // `pathToFileURL` rather than the path itself: on Windows an absolute
      // path like `E:/...` is parsed as a URL scheme and Node refuses it with
      // ERR_UNSUPPORTED_ESM_URL_SCHEME.
      await import(pathToFileURL(file).href);
      record(`${root} loads under plain node`, true);
    } catch (error) {
      record(
        `${root} loads under plain node`,
        false,
        error instanceof Error ? error.message.split('\n')[0] : String(error),
      );
    }
  }
}

await main().catch((error) => {
  record('the check ran', false, error.message);
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  console.log(
    '\nA named import that is undefined at runtime is the usual cause: a CommonJS\n' +
      'dependency imported with named syntax, or a name imported from a module that\n' +
      'imports it without re-exporting it. Both type-check and both pass every test.',
  );
}
process.exit(failed.length === 0 ? 0 : 1);

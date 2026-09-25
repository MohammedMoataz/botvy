/**
 * Refuses to let `gen:contracts` run against a stale `backend/dist/`.
 *
 * ## Why this exists
 *
 * `pnpm --filter @botvy/backend gen:contracts` is `node dist/main.js` with
 * `BOTVY_GEN=1`. Nothing about that command reads `src/`, so running it without
 * building first republishes the *previous* schema — silently, with a success
 * message, and with the new resolvers and event payloads simply absent. It
 * happened in P5: `packages/contracts/schema.graphql` came back with zero
 * occurrences of `Meeting`, and the cause was a build that had not been run
 * rather than a resolver that had not been registered.
 *
 * That matters more than a stale file usually would. `schema.graphql` is the
 * *proof artefact* for a rule this codebase has already learned twice — "a read
 * a client cannot reach is a read that does not exist", checked by looking for
 * the new query in the regenerated schema. A generator that can quietly emit
 * the old schema turns that proof into a coin flip.
 *
 * ## Why a guard rather than `pnpm build &&`
 *
 * Building first is the complete fix and costs a minute. It also drags in
 * `prisma generate`, because that is the first half of the backend's `build`
 * script — so the contracts command would stop working for anyone without a
 * Prisma toolchain installed. That is a different trade and has not been taken.
 * This is the cheap half: it cannot make the schema fresh, but it can refuse to
 * pretend, which is the whole failure mode.
 *
 * Specs are excluded from the comparison because `tsconfig.build.json` excludes
 * them: they are not in `dist/`, so editing one cannot stale it, and a guard
 * that cries wolf on every test edit is a guard people learn to work around.
 *
 * Recorded as E-009 in the enhancements ledger, retired in 028 (git history keeps the note).
 */
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'backend', 'src');
const ENTRY = join(ROOT, 'backend', 'dist', 'main.js');
const BUILD = 'pnpm --filter @botvy/backend build';

/** The newest mtime under a directory, ignoring what the build ignores. */
function newest(dir) {
  let latest = { mtimeMs: 0, path: null };
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const deepest = newest(path);
      if (deepest.mtimeMs > latest.mtimeMs) latest = deepest;
      continue;
    }
    if (entry.name.endsWith('.spec.ts')) continue;
    const { mtimeMs } = statSync(path);
    if (mtimeMs > latest.mtimeMs) latest = { mtimeMs, path };
  }
  return latest;
}

let built;
try {
  built = statSync(ENTRY).mtimeMs;
} catch {
  console.error(
    `\ncheck-dist-fresh: ${ENTRY} does not exist, so there is nothing to generate from.\n` +
      `  Run \`${BUILD}\` first.\n`,
  );
  process.exit(1);
}

const latest = newest(SRC);

if (latest.mtimeMs > built) {
  const newer = latest.path.slice(ROOT.length + 1).replaceAll('\\', '/');
  console.error(
    '\ncheck-dist-fresh: backend/dist/ is older than backend/src/, so generating now would\n' +
      '  republish the PREVIOUS schema — the new resolvers and event payloads would simply\n' +
      '  be missing from packages/contracts/schema.graphql, and the run would say it worked.\n' +
      `\n  Newer than the build: ${newer}\n` +
      `  built  ${new Date(built).toISOString()}\n` +
      `  source ${new Date(latest.mtimeMs).toISOString()}\n` +
      `\n  Run \`${BUILD}\` first, then generate again.\n`,
  );
  process.exit(1);
}

console.log(
  'check-dist-fresh: backend/dist/ is newer than backend/src/ — generating.',
);

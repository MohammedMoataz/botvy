/**
 * Builds `oxlint.json`'s constitution-IX cross-context pattern group from the
 * directory listing of `backend/src/contexts/`, and checks in CI that the
 * committed file still matches the tree.
 *
 * ## Why this exists
 *
 * The rule that stops one context importing another enumerates every context
 * name at every relative depth a sibling can sit at. That enumeration is not
 * laziness in the config, it is the only correct shape: the depth that means "a
 * sibling context" depends on where the importing file is — `../../Y` from
 * `domain/`, `../../../Y` from `features/<slice>/` — so a blanket `../../*`
 * would also forbid a slice importing *its own* context's `domain/`, which is
 * the most common legitimate import in the codebase. Twelve patterns per
 * context, provably right.
 *
 * What it is not is self-maintaining. `meetings` landed in P5 without its
 * twelve lines and nothing failed, because the failure mode of a missing name
 * is silence: the rule simply does not mention that context, and the *reverse*
 * direction — another context's `domain/` importing `../../meetings/**` — went
 * unpoliced for a phase. It was found by somebody reading the rule's own
 * comment, not by any check. That is the same shape as the `patterns`-versus-
 * `paths` bug: a lint rule nobody has seen fire is a comment.
 *
 * So the list is generated from the one source that cannot fall behind — the
 * directory listing — and `--check` fails the build when the committed file and
 * the tree disagree. A new context is then a directory plus `pnpm lint:contexts`,
 * and forgetting is a red CI step rather than a hole nobody notices.
 *
 * ## Modes
 *
 *   node infra/gen-lint-contexts.mjs            rewrite oxlint.json in place
 *   node infra/gen-lint-contexts.mjs --check    exit 1 if it is out of date
 *
 * Only the one group's `group` array is touched. Everything else in the file
 * survives untouched, including key order and the comments: `JSON.parse` then
 * `JSON.stringify(…, null, 2)` round-trips this file byte for byte, which is
 * asserted below rather than assumed.
 *
 * Recorded as E-004 in `enhancements/`, and this is the fix.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(ROOT, 'oxlint.json');
const CONTEXTS_DIR = join(ROOT, 'backend', 'src', 'contexts');

/** The override this script owns, identified by what it is scoped to. */
const OVERRIDE_FILES = [
  'backend/src/contexts/*/domain/**',
  'backend/src/contexts/*/features/**',
];
/** …and, within it, the one group whose message starts like this. */
const GROUP_MESSAGE_PREFIX =
  'Constitution IX: a context may not import another context';

/**
 * The twelve patterns for one context.
 *
 * Six relative forms, each with and without a `/**` tail so a bare specifier
 * (`../../identity`) is refused as well as a deep one. The first three are the
 * sibling walk from `domain/`, `features/<slice>/` and one level deeper; the
 * last three are the same walk written through `contexts/`, which is how an
 * import that has gone up past `contexts/` and back down spells it.
 */
const patternsFor = (name) =>
  [
    `../../${name}`,
    `../../../${name}`,
    `../../../../${name}`,
    `../../../contexts/${name}`,
    `../../../../contexts/${name}`,
    `../../../../../contexts/${name}`,
  ].flatMap((prefix) => [prefix, `${prefix}/**`]);

const contexts = readdirSync(CONTEXTS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (contexts.length === 0) {
  console.error(`gen-lint-contexts: no contexts found under ${CONTEXTS_DIR}`);
  process.exit(1);
}

const committed = readFileSync(CONFIG, 'utf8');
const config = JSON.parse(committed);

// A generator that reformats the file it edits is a generator nobody will run.
// If this ever stops holding, the `--write` diff would be the whole file and
// the `--check` failure would be unreadable, so it is a hard stop rather than
// a surprise.
const roundTrip = `${JSON.stringify(config, null, 2)}\n`;
if (roundTrip !== committed) {
  console.error(
    'gen-lint-contexts: oxlint.json does not round-trip through JSON.stringify(…, null, 2).\n' +
      '  Writing it would reformat the whole file. Reformat it once deliberately, or teach\n' +
      '  this script the formatting it actually uses — do not let it rewrite the file blind.',
  );
  process.exit(1);
}

const override = config.overrides?.find(
  (candidate) =>
    Array.isArray(candidate.files) &&
    candidate.files.length === OVERRIDE_FILES.length &&
    OVERRIDE_FILES.every((file) => candidate.files.includes(file)),
);
const group = override?.rules?.['no-restricted-imports']?.[1]?.patterns?.find(
  (entry) => entry.message?.startsWith(GROUP_MESSAGE_PREFIX),
);

if (!group) {
  console.error(
    'gen-lint-contexts: could not find the cross-context group in oxlint.json.\n' +
      `  Looked for an override scoped to ${OVERRIDE_FILES.join(' + ')} whose\n` +
      `  no-restricted-imports has a patterns entry whose message starts "${GROUP_MESSAGE_PREFIX}".\n` +
      '  If the rule was restructured, update this script in the same change.',
  );
  process.exit(1);
}

const expected = contexts.flatMap(patternsFor);
const check = process.argv.includes('--check');

if (JSON.stringify(group.group) === JSON.stringify(expected)) {
  console.log(
    `gen-lint-contexts: up to date — ${contexts.length} contexts, ${expected.length} patterns.`,
  );
  process.exit(0);
}

const current = new Set(group.group);
const missing = contexts.filter((name) => !current.has(`../../${name}`));
const stale = [...current]
  .filter((pattern) => pattern.startsWith('../../') && !pattern.endsWith('/**'))
  .map((pattern) => pattern.slice(pattern.lastIndexOf('/') + 1))
  .filter((name) => !contexts.includes(name));

if (check) {
  console.error(
    'gen-lint-contexts: oxlint.json is out of date with backend/src/contexts/.',
  );
  if (missing.length > 0) {
    console.error(
      `  Unpoliced contexts (nothing stops another context importing them): ${missing.join(', ')}`,
    );
  }
  if (stale.length > 0) {
    console.error(
      `  Named in the rule but not on disk: ${[...new Set(stale)].join(', ')}`,
    );
  }
  if (missing.length === 0 && stale.length === 0) {
    console.error(
      '  Same contexts, different pattern list — order or shape has drifted.',
    );
  }
  console.error('  Run `pnpm lint:contexts:write` and commit the result.');
  process.exit(1);
}

group.group = expected;
writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`);
console.log(
  `gen-lint-contexts: wrote ${expected.length} patterns for ${contexts.length} contexts.` +
    (missing.length > 0 ? `\n  added: ${missing.join(', ')}` : '') +
    (stale.length > 0 ? `\n  removed: ${[...new Set(stale)].join(', ')}` : ''),
);

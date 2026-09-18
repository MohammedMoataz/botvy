/**
 * Reads a day of logs and answers one question: is a secret or a member's own
 * words in them?
 *
 * ## Why this exists
 *
 * P11's task T1112 describes the pass in prose — "grepped for a JSON Web
 * Token's three dot-separated base64url segments, `Bearer ` followed by a
 * non-empty value, …" — and a verification that lives in somebody's shell
 * history has not been performed since. This file is that list, executable, so
 * the pass is one command and the second run is free.
 *
 * ## What it looks for, and why each one
 *
 * | Rule | Why it is on the list |
 * |---|---|
 * | `jwt` | Three base64url segments is a token somebody can replay until it expires |
 * | `bearer` | The header with a value in it, wherever it was echoed from |
 * | `secret-field` | `password`, `refreshToken`, `accessToken`, `serviceToken`, `token=` followed by anything that is not a redaction marker |
 * | `email` | An address is a member identifier, and identifiers are member content |
 * | `push-token` | A registration token's shape: long, `:APA91b`-flavoured, and enough to notify somebody's phone |
 * | `canary` | A sentence planted in a seeded conversation before the sample began |
 *
 * The canary is the part that makes the rest honest. The first five rules
 * search for shapes we already know to be dangerous; the canary searches for
 * the thing we are actually afraid of — a member's own sentence reaching a log
 * — by putting a sentence in and looking for it, rather than by guessing at
 * what member content looks like. A run without `--canary` says so in its
 * summary and is a weaker check, deliberately visible as one.
 *
 * ## What it prints
 *
 * Never the match. A gate log that quotes the token it found has moved the
 * secret rather than reported it, and `gate-logs/` is committed. Every hit is
 * reported as source, line number, rule name and a masked excerpt: the
 * surrounding characters with the matched span replaced by its length.
 *
 * ## Reading the exit code
 *
 * Non-zero means at least one hit that no allow rule covers. Every hit is
 * either a redaction to add or a false positive to write down in
 * `docs/security-review.md` with its reason and a line in the allow file —
 * which is the shape T1112 asks for, and the reason the allow file is a file
 * rather than a flag.
 *
 * ## Usage
 *
 *   node infra/scan-logs.mjs --since 24h                 # from the running stack
 *   node infra/scan-logs.mjs --dir gate-logs/2026-09-18  # from files already captured
 *   node infra/scan-logs.mjs --since 24h --canary "the paint in the hallway"
 *   node infra/scan-logs.mjs --dir … --allow infra/scan-logs.allow.txt
 *
 * `--since` needs Docker; `--dir` needs nothing and is how the pass is repeated
 * after the fact, or on a machine whose engine is down.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** One place that knows a log arrives with either line ending. */
function splitLines(text) {
  return text.split(/\r?\n/);
}

/**
 * The containers a day of this platform's logs comes from — asked of compose
 * rather than listed here.
 *
 * The first version of this file named them from the blueprint's vocabulary
 * (`edge`, `api`) and compose calls them `caddy` and `backend`, so the two
 * loudest sources in the platform were silently skipped and the pass reported
 * on four containers while saying nothing about it. A list of names that has to
 * agree with a file somewhere else is the same trap as `NIGHTLY_JOBS`.
 */
async function servicesOf() {
  const { stdout } = await run(
    'docker',
    [
      'compose',
      '--env-file',
      '.env',
      '-p',
      'botvy-v2',
      '-f',
      'infra/docker-compose.yml',
      'config',
      '--services',
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  return splitLines(stdout)
    .map((line) => line.trim())
    .filter(Boolean);
}

const RULES = [
  {
    name: 'jwt',
    // Three dot-separated base64url segments, the middle one long enough to be
    // a payload rather than a version string in a path.
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    name: 'bearer',
    // `Bearer ` with something after it. A redacted one reads `Bearer ***`.
    re: /\bBearer\s+(?!\*|\[REDACTED\]|<redacted>|"\*)[^\s"']{4,}/gi,
  },
  {
    name: 'secret-field',
    // A named secret followed by a value that is not a redaction marker.
    re: /\b(password|refreshToken|refresh_token|accessToken|access_token|serviceToken|service_token|token)\b["'\]]*\s*[:=]\s*(?!\*|"\*|'\*|\[REDACTED\]|<redacted>|null|undefined|""|''|\s)[^\s,;}"']{4,}/gi,
  },
  {
    name: 'email',
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    name: 'push-token',
    // FCM registration tokens: a colon-separated pair whose tail is long.
    re: /\b[A-Za-z0-9_-]{10,}:APA91[A-Za-z0-9_-]{50,}\b/g,
  },
];

function parseArgs(argv) {
  const args = { since: null, dir: null, canary: null, allow: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--since') ((args.since = value), (i += 1));
    else if (flag === '--dir') ((args.dir = value), (i += 1));
    else if (flag === '--canary') ((args.canary = value), (i += 1));
    else if (flag === '--allow') ((args.allow = value), (i += 1));
    else if (flag === '--out') ((args.out = value), (i += 1));
    else if (flag === '--help' || flag === '-h') args.help = true;
    else throw new Error(`unknown argument: ${flag}`);
  }
  return args;
}

/** The matched span replaced by its own length, with a little context. */
function mask(line, index, length) {
  const before = line.slice(Math.max(0, index - 24), index);
  const after = line.slice(index + length, index + length + 24);
  return `${before}«${length} chars»${after}`.replace(/\s+/g, ' ').trim();
}

async function readAllowRules(path) {
  if (!path) return [];
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => new RegExp(line));
}

async function sourcesFromDocker(since) {
  const sources = [];
  for (const service of await servicesOf()) {
    try {
      const { stdout } = await run(
        'docker',
        [
          'compose',
          '--env-file',
          '.env',
          '-p',
          'botvy-v2',
          '-f',
          'infra/docker-compose.yml',
          'logs',
          '--no-color',
          '--since',
          since,
          service,
        ],
        { maxBuffer: 512 * 1024 * 1024 },
      );
      sources.push({ name: service, text: stdout });
    } catch (error) {
      sources.push({
        name: service,
        text: '',
        error: String(error.message ?? error).split('\n')[0],
      });
    }
  }
  return sources;
}

async function sourcesFromDir(dir) {
  const root = resolve(dir);
  const entries = await readdir(root, { withFileTypes: true });
  const sources = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.(log|txt|jsonl)$/i.test(entry.name)) continue;
    sources.push({
      name: entry.name,
      text: await readFile(join(root, entry.name), 'utf8'),
    });
  }
  return sources;
}

function scan(sources, rules, allow) {
  const hits = [];
  for (const source of sources) {
    const lines = source.text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (!line) continue;
      if (allow.some((re) => re.test(line))) continue;
      for (const rule of rules) {
        rule.re.lastIndex = 0;
        let match;
        while ((match = rule.re.exec(line)) !== null) {
          hits.push({
            source: source.name,
            line: index + 1,
            rule: rule.name,
            excerpt: mask(line, match.index, match[0].length),
          });
          if (match[0].length === 0) rule.re.lastIndex += 1;
        }
      }
    }
  }
  return hits;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.since && !args.dir)) {
    console.log(
      'usage: node infra/scan-logs.mjs (--since 24h | --dir <path>) [--canary "<sentence>"] [--allow <file>] [--out <file>]',
    );
    process.exit(args.help ? 0 : 2);
  }

  const rules = [...RULES];
  if (args.canary) {
    rules.push({
      name: 'canary',
      re: new RegExp(args.canary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
    });
  }

  const allow = await readAllowRules(args.allow ?? 'infra/scan-logs.allow.txt');
  const sources = args.dir
    ? await sourcesFromDir(args.dir)
    : await sourcesFromDocker(args.since);

  const unreadable = sources.filter((source) => source.error);
  for (const source of unreadable)
    console.error(`! ${source.name}: ${source.error}`);

  const scanned = sources.filter((source) => source.text.length > 0);
  const lineCount = scanned.reduce(
    (total, source) => total + source.text.split(/\r?\n/).length,
    0,
  );
  const hits = scan(scanned, rules, allow);

  const report = [
    `scanned ${scanned.length} sources, ${lineCount} lines`,
    `sources: ${scanned.map((s) => s.name).join(', ') || 'none'}`,
    args.canary
      ? `canary: present`
      : `canary: ABSENT — member content was searched for by shape only`,
    `allow rules: ${allow.length}`,
    '',
    ...(hits.length === 0
      ? ['no hits']
      : hits.map(
          (hit) => `${hit.source}:${hit.line}  ${hit.rule}  ${hit.excerpt}`,
        )),
    '',
    `${hits.length} hit${hits.length === 1 ? '' : 's'}`,
  ].join('\n');

  console.log(report);
  if (args.out) await writeFile(args.out, `${report}\n`, 'utf8');

  if (scanned.length === 0) {
    console.error(
      'nothing was read — a clean answer over no logs is not an answer',
    );
    process.exit(2);
  }
  process.exitCode = hits.length === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});

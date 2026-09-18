/**
 * One day's row of the seven-day soak (P11, T1154).
 *
 * Reads `/health`, decides whether the platform was healthy with every job
 * reporting freshly, and appends a single line to `ops/soak-<version>.log`.
 * Seven consecutive rows are the record the release is judged on, so the row
 * has to be readable a week later by somebody who did not run it: it carries
 * the instant, the verdict, the version the system reports, and the name of
 * every job that was stale, because "degraded" with no name is a row that
 * sends the next reader back to a system that has since recovered.
 *
 * A failed sample still writes its row. A soak whose bad days are missing is
 * a soak that always passes.
 *
 * Usage:
 *   node infra/soak-sample.mjs                       # http://localhost/health
 *   node infra/soak-sample.mjs --url https://host/health --version 2.1.0
 *
 * Exit code is 0 for a healthy sample and 1 for anything else, so a scheduler
 * can fail loudly rather than appending quietly.
 */
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

function parseArgs(argv) {
  const args = { url: 'http://localhost/health', version: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i + 1];
    if (argv[i] === '--url') ((args.url = value), (i += 1));
    else if (argv[i] === '--version') ((args.version = value), (i += 1));
    else if (argv[i] === '--out') ((args.out = value), (i += 1));
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return args;
}

/**
 * `/health` reports jobs as an object or an array depending on how far the
 * admin overview has moved; accept both rather than tying the soak to one
 * shape, and name what it could not read instead of assuming it was fine.
 */
function staleJobs(body) {
  const jobs = body?.jobs ?? body?.heartbeats ?? body?.checks?.jobs;
  if (!jobs) return { unreadable: true, names: [] };
  const entries = Array.isArray(jobs)
    ? jobs.map((job) => [job.name ?? job.job ?? 'unnamed', job])
    : Object.entries(jobs);
  const names = entries
    .filter(
      ([, job]) =>
        job?.stale === true || job?.status === 'stale' || job?.fresh === false,
    )
    .map(([name]) => name);
  return { unreadable: false, names };
}

const args = parseArgs(process.argv.slice(2));
const at = new Date().toISOString();

let status = 'unreachable';
let version = args.version ?? 'unknown';
let stale = [];
let note = '';

try {
  const response = await fetch(args.url, {
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null);
  status = body?.status ?? (response.ok ? 'ok' : `http-${response.status}`);
  version = args.version ?? body?.version ?? 'unknown';
  const jobs = staleJobs(body);
  stale = jobs.names;
  if (jobs.unreadable) note = 'jobs unreadable in the response';
} catch (error) {
  note = String(error.message ?? error).split('\n')[0];
}

const healthy = status === 'ok' && stale.length === 0 && note === '';
const row = [
  at,
  healthy ? 'HEALTHY' : 'NOT-HEALTHY',
  `status=${status}`,
  `stale=${stale.length === 0 ? 'none' : stale.join(',')}`,
  note ? `note=${note}` : '',
]
  .filter(Boolean)
  .join('  ');

const out = args.out ?? `ops/soak-${version}.log`;
await mkdir(dirname(out), { recursive: true });
await appendFile(out, `${row}\n`, 'utf8');

console.log(`${row}\n→ ${out}`);
/*
 * `exitCode`, not `process.exit`: Node on Windows prints an assertion from its
 * own event loop when the process is torn down with `fetch`'s handle still
 * closing, and a line reading `Assertion failed: !(handle->flags &
 * UV_HANDLE_CLOSING)` under a healthy sample is a operator reading a crash that
 * did not happen.
 */
process.exitCode = healthy ? 0 : 1;

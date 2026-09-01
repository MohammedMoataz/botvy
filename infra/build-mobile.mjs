#!/usr/bin/env node
/**
 * Builds the release APK with the gateway URL baked in as its first-run
 * default.
 *
 *   node infra/build-mobile.mjs                      # ask the running tunnel
 *   node infra/build-mobile.mjs https://botvy.example.com
 *   node infra/build-mobile.mjs --check              # print the URL, build nothing
 *
 * Only the *default*: the app stores whatever the user sets in Settings, so a
 * build carrying a stale URL is corrected on the device rather than needing a
 * new APK. That matters here, because the quick tunnel's hostname changes on
 * every restart — see infra/docs/tunnel-setup.md for the named tunnel, which
 * is the one worth baking in.
 */
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const mobile = resolve(here, '..', 'apps', 'mobile');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
// Any non-flag argument is the URL the caller meant. Matching on "http" here
// instead would silently discard a typo and build against the tunnel, which
// looks like success and ships the wrong default.
const explicit = args.find((a) => !a.startsWith('--'));

/** The quick tunnel announces its hostname once, in its own log. */
async function fromTunnel() {
  const { stdout } = await run('node', [resolve(here, 'tunnel-url.mjs')]);
  return stdout.trim().split('\n').at(-1)?.trim();
}

const baseUrl = explicit ?? (await fromTunnel().catch(() => null));

if (!baseUrl) {
  console.error(
    'No gateway URL. Pass one, or start the quick tunnel so it can be read from its log.',
  );
  process.exit(1);
}

// A typo here ships an APK that cannot reach anything on first run, and the
// only symptom is a connection error on a screen the user has not opened yet.
let parsed;
try {
  parsed = new URL(baseUrl);
} catch {
  console.error(`Not a URL: ${baseUrl}`);
  process.exit(1);
}
if (!['http:', 'https:'].includes(parsed.protocol)) {
  console.error(`Gateway URL must be http or https, got ${parsed.protocol}`);
  process.exit(1);
}
// Trailing slashes double up in every request path.
const clean = baseUrl.replace(/\/+$/, '');

console.log(`Gateway: ${clean}`);
if (checkOnly) process.exit(0);

if (clean.includes('trycloudflare.com')) {
  console.warn(
    'Warning: a quick-tunnel hostname changes when that container restarts.\n' +
      '         Anyone installing this build afterwards lands on a dead host and\n' +
      '         has to set the URL in Settings. Use a named tunnel for releases.',
  );
}

const define = `--dart-define=BOTVY_BASE_URL=${clean}`;

/** Inherit stdio so flutter's own progress and errors reach the terminal. */
function flutter(argv) {
  return new Promise((ok, fail) => {
    const child = spawn('flutter', argv, { cwd: mobile, stdio: 'inherit', shell: true });
    child.on('exit', (code) =>
      code === 0 ? ok() : fail(new Error(`flutter ${argv[0]} exited ${code}`)),
    );
  });
}

// Tested with the same define the APK is about to carry, so the value is
// checked rather than assumed.
await flutter(['test', 'test/base_url_test.dart', define]);
await flutter(['build', 'apk', '--release', define]);

console.log(`\nBuilt with ${clean} as the first-run default.`);
console.log('  apps/mobile/build/app/outputs/flutter-apk/app-release.apk');

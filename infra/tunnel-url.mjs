#!/usr/bin/env node
/**
 * Prints the quick tunnel's current public URL.
 *
 * A quick tunnel needs no Cloudflare account and no domain, but its
 * hostname is assigned at startup and changes on every restart. cloudflared
 * announces it only once, in its own log, so this reads it back from there.
 *
 *   node infra/tunnel-url.mjs
 *   node infra/tunnel-url.mjs --set-mobile   # also writes it where the app reads it
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const CONTAINER = 'botvy-cloudflared-quick-1';

let logs;
try {
  const { stdout, stderr } = await run('docker', ['logs', CONTAINER], {
    maxBuffer: 10 * 1024 * 1024,
  });
  logs = `${stdout}\n${stderr}`; // cloudflared writes the banner to stderr
} catch (err) {
  console.error(`Could not read ${CONTAINER}'s logs. Is the quick profile running?`);
  console.error('  docker compose --env-file .env -f infra/docker-compose.yml --profile quick up -d');
  process.exit(1);
}

// Last match wins: a restart appends a new hostname below the old one.
const matches = [...logs.matchAll(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g)].map((m) => m[0]);
const url = matches.at(-1);

if (!url) {
  console.error('No tunnel URL in the logs yet — cloudflared may still be connecting.');
  process.exit(1);
}

console.log(url);

if (process.argv.includes('--set-mobile')) {
  console.log(`\nPut this in the mobile app's Settings screen as the server URL:\n  ${url}`);
  console.log('\nIt changes whenever the tunnel restarts, so re-run this after any restart.');
}

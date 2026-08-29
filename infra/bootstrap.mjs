#!/usr/bin/env node
/**
 * Brings a fresh botvy stack from "containers running" to "usable".
 *
 * Everything here was learned by doing it by hand and is easy to get wrong
 * in a specific order, so it lives in one runnable script rather than in
 * someone's memory:
 *
 *   1. n8n refuses every REST call until an owner account exists.
 *   2. An n8n API key can only be minted through the cookie-authenticated
 *      internal API, and its raw value is returned exactly once.
 *   3. The error-handler workflow must be imported before any workflow
 *      referencing it, or n8n silently drops the errorWorkflow setting.
 *
 * Idempotent: re-running it skips steps already done.
 *
 * Usage (from the repo root, with the stack up):
 *   node infra/bootstrap.mjs
 *
 * Reads N8N_URL, N8N_OWNER_EMAIL and N8N_OWNER_PASSWORD from .env, and
 * writes N8N_API_KEY back to .env when it mints one.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = join(ROOT, '.env');

const env = Object.fromEntries(
  (await readFile(ENV_PATH, 'utf8'))
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const N8N_URL = (env.N8N_URL ?? 'http://localhost:5679').replace(/\/$/, '');
const EMAIL = env.N8N_OWNER_EMAIL;
const PASSWORD = env.N8N_OWNER_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('N8N_OWNER_EMAIL and N8N_OWNER_PASSWORD must be set in .env');
  process.exit(1);
}

const appendEnv = async (line) => {
  await writeFile(ENV_PATH, `\n${line}\n`, { flag: 'a' });
};

// --- 1. Prisma migrations -------------------------------------------------
console.log('› applying database migrations');
try {
  const { stdout } = await run(
    'npx',
    ['--yes', 'prisma@6.19.3', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
    { cwd: join(ROOT, 'apps', 'gateway'), shell: true },
  );
  console.log(
    '  ' + (stdout.match(/(\d+ migrations? found[\s\S]*?)\n\n/)?.[1] ?? 'applied').trim(),
  );
} catch (err) {
  console.error('  migrations failed — is Postgres up and DATABASE_URL correct?');
  throw err;
}

// --- 2. n8n owner ---------------------------------------------------------
const settings = await fetch(`${N8N_URL}/rest/settings`).then((r) => r.json());
if (settings.data?.userManagement?.showSetupOnFirstLoad) {
  console.log('› creating the n8n owner account');
  const res = await fetch(`${N8N_URL}/rest/owner/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: EMAIL,
      firstName: 'Botvy',
      lastName: 'Admin',
      password: PASSWORD,
    }),
  });
  if (!res.ok) throw new Error(`owner setup failed: ${await res.text()}`);
  console.log('  created');
} else {
  console.log('› n8n owner already exists');
}

// --- 3. API key -----------------------------------------------------------
let apiKey = env.N8N_API_KEY;
if (!apiKey) {
  console.log('› minting an n8n API key');
  const login = await fetch(`${N8N_URL}/rest/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'browser-id': 'botvy-bootstrap' },
    body: JSON.stringify({ emailOrLdapLoginId: EMAIL, password: PASSWORD }),
  });
  if (!login.ok) throw new Error(`n8n login failed: ${await login.text()}`);
  const cookie = login.headers.getSetCookie?.()[0]?.split(';')[0];
  if (!cookie) throw new Error('n8n returned no auth cookie');

  const authed = { Cookie: cookie, 'browser-id': 'botvy-bootstrap', 'Content-Type': 'application/json' };
  const scopes = (await fetch(`${N8N_URL}/rest/api-keys/scopes`, { headers: authed }).then((r) =>
    r.json(),
  )).data;

  const created = await fetch(`${N8N_URL}/rest/api-keys`, {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({ label: 'botvy-bootstrap', scopes, expiresAt: null }),
  }).then((r) => r.json());

  // Returned exactly once — if this is not captured now, the key must be
  // deleted and re-created.
  apiKey = created.data?.rawApiKey ?? created.data?.apiKey;
  if (!apiKey) throw new Error(`no API key in response: ${JSON.stringify(created).slice(0, 200)}`);
  await appendEnv(`N8N_API_KEY=${apiKey}`);
  console.log('  minted and written to .env');
} else {
  console.log('› n8n API key already present');
}

// --- 4. Workflows ---------------------------------------------------------
console.log('› importing workflows');
const { stdout: importOut } = await run(
  'node',
  [join(ROOT, 'workflows', 'import.mjs')],
  { env: { ...process.env, N8N_URL, N8N_API_KEY: apiKey }, shell: true },
);
console.log(importOut.trim().split('\n').map((l) => `  ${l}`).join('\n'));

console.log('\nBootstrap complete. Workflows are imported but not activated —');
console.log('activate them from the admin portal or the n8n editor when ready.');

#!/usr/bin/env node
/**
 * Brings a fresh install to a working state, and is safe to run again.
 *
 * It opens neither store. Migrations run through the backend's own commands and
 * the service client is seeded by the backend at boot — an outside process
 * writing a store the API owns is exactly what principle I forbids, and this
 * script verifies rather than creates.
 *
 * Every step is idempotent, and the gate re-runs the whole script to prove it:
 * a bootstrap that is only safe the first time is one nobody dares run on a
 * system that already has data.
 */
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const API = process.env.BOTVY_API_BASE ?? 'http://127.0.0.1';
const N8N = process.env.N8N_PUBLIC_URL ?? 'http://127.0.0.1:5679';
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';
const WORKFLOW_DIR = process.env.WORKFLOW_DIR ?? 'workflows';

let failed = false;
const step = (name) => ({
  ok: (detail = '') => console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`),
  skip: (why) => console.log(`  skip  ${name} — ${why}`),
  fail: (why) => {
    failed = true;
    console.error(`  FAIL  ${name} — ${why}`);
  },
});

async function waitFor(name, probe, { attempts = 60, everyMs = 2000 } = {}) {
  const s = step(name);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (await probe()) {
        s.ok(`ready after ${attempt} attempt${attempt === 1 ? '' : 's'}`);
        return true;
      }
    } catch {
      // Not up yet. That is the expected answer for most of this loop.
    }
    await new Promise((resolve) => setTimeout(resolve, everyMs));
  }
  s.fail(`still not ready after ${attempts} attempts`);
  return false;
}

async function compose(...args) {
  return run('docker', ['compose', '--env-file', '.env', '-f', 'infra/docker-compose.yml', ...args], {
    maxBuffer: 32 * 1024 * 1024,
  });
}

// ---------------------------------------------------------------- steps

async function waitForStores() {
  return waitFor('stores accepting connections', async () => {
    const { stdout } = await compose('ps', '--format', 'json');
    const services = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const needed = ['postgres', 'mongo'];
    return needed.every((name) => {
      const svc = services.find((s) => s.Service === name);
      return svc && (svc.Health === 'healthy' || svc.State === 'running');
    });
  });
}

async function migrate() {
  for (const [name, args] of [
    ['PostgreSQL migrations', ['exec', '-T', 'backend', 'node_modules/.bin/prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma']],
    ['Mongo migrations', ['exec', '-T', 'backend', 'node_modules/.bin/migrate-mongo', 'up', '-f', 'migrations/mongo/migrate-mongo-config.js']],
  ]) {
    const s = step(name);
    try {
      const { stdout } = await compose(...args);
      // "No pending migrations" on a second run is the whole point.
      s.ok(stdout.includes('No pending') ? 'already applied' : 'applied');
    } catch (error) {
      s.fail(error.stderr?.trim() || error.message);
    }
  }
}

async function waitForApi() {
  return waitFor('API answering /health', async () => {
    const response = await fetch(`${API}/health`);
    return response.ok;
  });
}

/**
 * Verifies the service client the backend seeded. It does not create one: P0
 * has no admin sign-in through which the create-service-client command could be
 * called, and writing the table from here would break principle I.
 *
 * Anything but 401 means the credential was recognised. A 400 for a malformed
 * body is a pass — it proves authentication happened before validation.
 */
async function verifyServiceClient() {
  const s = step('n8n service client answers');
  if (!INTERNAL_TOKEN) return s.skip('INTERNAL_SERVICE_TOKEN not set in this shell');

  try {
    const response = await fetch(`${API}/internal/alerts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-service-token': INTERNAL_TOKEN },
      body: JSON.stringify({ workflow: 'bootstrap-probe', error: 'verifying the credential' }),
    });
    if (response.status === 401 || response.status === 403) {
      return s.fail(`credential refused (HTTP ${response.status}); is INTERNAL_SERVICE_TOKEN the one the backend booted with?`);
    }
    s.ok(`HTTP ${response.status}`);
  } catch (error) {
    s.fail(error.message);
  }
}

async function importWorkflows() {
  const s = step('n8n workflows imported');
  if (!process.env.N8N_API_KEY) return s.skip('N8N_API_KEY not set; import by hand from the editor');

  let files;
  try {
    // error_handler first: the others reference it as their errorWorkflow.
    const all = await readdir(WORKFLOW_DIR);
    files = all
      .filter((file) => file.endsWith('.json'))
      .sort((a, b) => (a.startsWith('error_handler') ? -1 : b.startsWith('error_handler') ? 1 : a.localeCompare(b)));
  } catch {
    return s.skip(`no ${WORKFLOW_DIR}/ directory`);
  }

  for (const file of files) {
    const body = JSON.parse(await readFile(join(WORKFLOW_DIR, file), 'utf8'));
    const response = await fetch(`${N8N}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-N8N-API-KEY': process.env.N8N_API_KEY },
      body: JSON.stringify(body),
    });
    // A workflow that is already there is not an error on a re-run.
    if (!response.ok && response.status !== 400 && response.status !== 409) {
      return s.fail(`${file}: HTTP ${response.status}`);
    }
  }
  s.ok(`${files.length} workflow${files.length === 1 ? '' : 's'}`);
}

async function reportHealth() {
  const s = step('health summary');
  try {
    const report = await (await fetch(`${API}/health`)).json();
    const stale = (report.jobs ?? []).filter((job) => job.stale).map((job) => job.job);
    s.ok(
      `status=${report.status} postgres=${report.postgres} mongo=${report.mongo} ollama=${report.ollama}` +
        (stale.length > 0 ? ` stale=[${stale.join(', ')}]` : ''),
    );
  } catch (error) {
    s.fail(error.message);
  }
}

// ---------------------------------------------------------------- main

console.log('bootstrap');
if (await waitForStores()) {
  await migrate();
  if (await waitForApi()) {
    await verifyServiceClient();
    await importWorkflows();
    await reportHealth();
  }
}

console.log(failed ? 'bootstrap finished with failures' : 'bootstrap complete');
process.exit(failed ? 1 : 0);

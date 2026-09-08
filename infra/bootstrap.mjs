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
import { envFileArgs, loadEnvFiles } from './env.mjs';

// Before anything below reads process.env.
loadEnvFiles();

const run = promisify(execFile);

// The edge's published port is an `.env` value, because v1 holds 80 on a host
// that still has it installed. Defaulting to port 80 here sent both scripts
// at whatever already answers there - v1's own edge, on this machine - and a
// /health that answers is indistinguishable from the right /health answering.
const API = process.env.BOTVY_API_BASE ?? `http://127.0.0.1:${process.env.EDGE_PORT ?? '80'}`;
// n8n's editor is published on a loopback address that `.env` sets, and this
// script talks to it from the host. Hard-coding 5679 meant that a host which
// moved the bind - as one running v1's n8n alongside must - had this script
// quietly probing v1's n8n instead of v2's.
const N8N =
  process.env.N8N_PUBLIC_URL ??
  `http://${process.env.N8N_BIND ?? '127.0.0.1:5679'}`;
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';
const WORKFLOW_DIR = process.env.WORKFLOW_DIR ?? 'workflows';

let failed = false;

/**
 * How many things this run actually changed.
 *
 * The gate re-runs the whole script and requires this to be zero, which is the
 * only way "idempotent" is ever more than a claim. Counting is better than
 * reading the log for a word: a step that starts phrasing its success
 * differently would otherwise quietly turn the check off.
 */
let changes = 0;

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
  return run('docker', ['compose', ...envFileArgs(), '-f', 'infra/docker-compose.yml', ...args], {
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
      const pending = !stdout.includes('No pending');
      if (pending) changes += 1;
      s.ok(pending ? 'applied' : 'already applied');
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
 * Run from *inside* the backend container, not from the host. `/internal/*` is
 * deliberately absent from the Caddyfile — machine routes are not part of the
 * public surface — so probing through the edge reached the web app instead and
 * got a 404 back. This step used to treat anything but 401 as a pass, so it
 * reported "ok HTTP 404" and the gate went green on a credential nobody had
 * checked: precisely the silent-401-between-n8n-and-the-gateway failure the
 * project has already been bitten by once.
 *
 * The token goes through `-e` rather than into the script text, so it does not
 * appear in the container's process list.
 */
const SERVICE_PROBE = `
  fetch('http://127.0.0.1:8080/internal/alerts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-service-token': process.env.PROBE_TOKEN },
    body: JSON.stringify({ workflow: 'bootstrap-probe', error: 'verifying the credential' }),
  })
    .then((response) => console.log(response.status))
    .catch((error) => console.log('ERR ' + error.message));
`;

async function verifyServiceClient() {
  const s = step('n8n service client answers');
  if (!INTERNAL_TOKEN) return s.skip('INTERNAL_SERVICE_TOKEN not set in .env or this shell');

  let answer;
  try {
    const { stdout } = await compose(
      'exec',
      '-T',
      '-e',
      `PROBE_TOKEN=${INTERNAL_TOKEN}`,
      'backend',
      'node',
      '-e',
      SERVICE_PROBE,
    );
    answer = stdout.trim().split('\n').pop()?.trim() ?? '';
  } catch (error) {
    return s.fail(error.stderr?.trim() || error.message);
  }

  if (answer.startsWith('ERR ')) return s.fail(answer.slice(4));

  const status = Number(answer);
  if (status === 401 || status === 403) {
    return s.fail(
      `credential refused (HTTP ${status}); is INTERNAL_SERVICE_TOKEN the one the backend booted with?`,
    );
  }
  // A 404 is the route missing, not the credential passing, and that distinction
  // is the whole point of this step.
  if (status !== 200 && status !== 201) {
    return s.fail(`HTTP ${answer} from /internal/alerts; expected 200 or 201`);
  }
  s.ok(`HTTP ${status}`);
}

/** One call against n8n's public API, with the key attached. */
async function n8n(path, init = {}) {
  return fetch(`${N8N}/api/v1${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'X-N8N-API-KEY': process.env.N8N_API_KEY,
      ...init.headers,
    },
  });
}

/** Every workflow n8n already holds, by name, following the cursor to the end. */
async function workflowsByName() {
  const byName = new Map();
  let cursor;
  do {
    const query = cursor ? `?limit=100&cursor=${encodeURIComponent(cursor)}` : '?limit=100';
    const response = await n8n(`/workflows${query}`);
    if (!response.ok) throw new Error(`listing workflows: HTTP ${response.status}`);
    const page = await response.json();
    for (const workflow of page.data ?? []) byName.set(workflow.name, workflow);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return byName;
}

/**
 * Imports the committed workflows, updating rather than adding.
 *
 * `POST /workflows` creates unconditionally — it does not conflict on a name —
 * so posting on every run would leave a host with a growing pile of identical
 * "Botvy Ping Echo" workflows, several of them bound to the same webhook path.
 * The name is the identity here, so the run looks up what is already there and
 * PUTs onto the match.
 *
 * Two things beyond the import itself. An imported workflow arrives inactive,
 * and an inactive workflow's webhook returns 404 — so the ones that are meant
 * to listen are activated explicitly. And `settings.errorWorkflow` needs the
 * handler's server-assigned id, which does not exist until the handler is
 * imported; error_handler therefore goes first and the rest are stamped with
 * the id it came back with.
 */
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

  let existing;
  try {
    existing = await workflowsByName();
  } catch (error) {
    return s.fail(error.message);
  }

  let created = 0;
  let updated = 0;
  let activated = 0;
  let errorWorkflowId;

  for (const file of files) {
    const body = JSON.parse(await readFile(join(WORKFLOW_DIR, file), 'utf8'));
    const isErrorHandler = file.startsWith('error_handler');

    if (!isErrorHandler && errorWorkflowId) {
      body.settings = { ...body.settings, errorWorkflow: errorWorkflowId };
    }

    // n8n rejects a body carrying read-only fields, and a file that has been
    // exported from the editor rather than hand-written will carry them.
    const payload = {
      name: body.name,
      nodes: body.nodes,
      connections: body.connections,
      settings: body.settings ?? {},
    };

    const match = existing.get(body.name);
    const response = match
      ? await n8n(`/workflows/${match.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      : await n8n('/workflows', { method: 'POST', body: JSON.stringify(payload) });

    if (!response.ok) {
      return s.fail(`${file}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
    }

    const saved = await response.json();
    if (match) {
      updated += 1;
    } else {
      created += 1;
      changes += 1;
    }
    if (isErrorHandler) errorWorkflowId = saved.id;

    // A workflow with a trigger node is meant to be listening. The error
    // handler is called by n8n itself and needs no activation.
    const wantsActivation =
      !isErrorHandler && (body.nodes ?? []).some((node) => /webhook|Trigger/i.test(node.type ?? ''));
    if (wantsActivation && !saved.active) {
      const activation = await n8n(`/workflows/${saved.id}/activate`, { method: 'POST' });
      if (!activation.ok) {
        return s.fail(`${file}: activate returned HTTP ${activation.status}`);
      }
      activated += 1;
      changes += 1;
    }
  }

  s.ok(`${files.length} file${files.length === 1 ? '' : 's'}: ${created} created, ${updated} updated, ${activated} activated`);
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

console.log(`${failed ? 'bootstrap finished with failures' : 'bootstrap complete'} — changes=${changes}`);
process.exit(failed ? 1 : 0);

#!/usr/bin/env node
/**
 * Imports the workflow JSONs in this directory into a running n8n via its
 * public REST API, so workflows live in git rather than only inside n8n's
 * database (constitution: n8n Is Workflow Infrastructure Only).
 *
 * Usage:
 *   N8N_URL=http://localhost:5679 N8N_API_KEY=<key> node workflows/import.mjs
 *
 * Create the API key in the n8n UI: Settings > n8n API > Create an API key.
 *
 * error_handler.json is imported FIRST on purpose: n8n silently drops a
 * workflow's `errorWorkflow` setting when the referenced id does not yet
 * resolve, so the handler must exist before anything referencing it.
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const N8N_URL = (process.env.N8N_URL ?? 'http://localhost:5679').replace(/\/$/, '');
const API_KEY = process.env.N8N_API_KEY;

if (!API_KEY) {
  console.error('N8N_API_KEY is required (n8n UI > Settings > n8n API > Create an API key)');
  process.exit(1);
}

const api = async (path, init = {}) => {
  const response = await fetch(`${N8N_URL}/api/v1${path}`, {
    ...init,
    headers: {
      'X-N8N-API-KEY': API_KEY,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status} ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
};

const files = (await readdir(HERE))
  .filter((f) => f.endsWith('.json'))
  .sort((a, b) => (a.startsWith('error_handler') ? -1 : b.startsWith('error_handler') ? 1 : 0));

const existing = await api('/workflows?limit=250');
const byName = new Map((existing.data ?? []).map((w) => [w.name, w.id]));

for (const file of files) {
  const workflow = JSON.parse(await readFile(join(HERE, file), 'utf8'));
  // The API rejects unknown top-level keys; keep only what it accepts.
  const payload = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings ?? {},
  };

  const existingId = byName.get(workflow.name);
  if (existingId) {
    await api(`/workflows/${existingId}`, { method: 'PUT', body: JSON.stringify(payload) });
    console.log(`updated  ${workflow.name} (${existingId})`);
  } else {
    const created = await api('/workflows', { method: 'POST', body: JSON.stringify(payload) });
    console.log(`created  ${workflow.name} (${created.id})`);
  }
}

console.log('\nWorkflows are imported but NOT activated. Activate them in the n8n UI,');
console.log('or POST /workflows/:id/activate, once you have confirmed their settings.');

#!/usr/bin/env node
/**
 * The phase gate, as a command whose output can be pasted into a report.
 *
 * It checks the four things the foundation promises and cannot be trusted to
 * have kept by inspection: every container healthy, exactly one port published
 * beyond loopback, both stores answering through /health, and a bootstrap that
 * is genuinely safe to run twice.
 *
 * That last one is why this script exists rather than a checklist. "Idempotent"
 * is the sort of claim that is true when written and false six months later,
 * and the only way to know is to run it again and watch nothing change.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { envFileArgs, loadEnvFiles } from './env.mjs';

// Before anything below reads process.env.
loadEnvFiles();

const run = promisify(execFile);
const startedAt = Date.now();
// The edge's published port is an `.env` value, because v1 holds 80 on a host
// that still has it installed. Defaulting to port 80 here sent both scripts
// at whatever already answers there - v1's own edge, on this machine - and a
// /health that answers is indistinguishable from the right /health answering.
const API = process.env.BOTVY_API_BASE ?? `http://127.0.0.1:${process.env.EDGE_PORT ?? '80'}`;

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function compose(...args) {
  return run('docker', ['compose', ...envFileArgs(), '-f', 'infra/docker-compose.yml', ...args], {
    maxBuffer: 32 * 1024 * 1024,
  });
}

/** 1. Every container up, and every one with a healthcheck reporting healthy. */
async function checkContainers() {
  try {
    const { stdout } = await compose('ps', '--format', 'json');
    const services = stdout.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    if (services.length === 0) return record('containers running', false, 'nothing is up');

    const unwell = services.filter(
      (s) => s.State !== 'running' || (s.Health && s.Health !== 'healthy'),
    );
    record(
      'containers healthy',
      unwell.length === 0,
      unwell.length === 0
        ? `${services.length} services`
        : unwell.map((s) => `${s.Service}=${s.Health || s.State}`).join(', '),
    );
  } catch (error) {
    record('containers healthy', false, error.stderr?.trim() || error.message);
  }
}

/**
 * 2. Exactly one publish reaching beyond the host.
 *
 * Loopback binds are excluded deliberately: principle V permits "the Docker
 * network or localhost", and n8n's editor lives on 127.0.0.1 so the Owner can
 * reach it through an SSH tunnel. Counting those as public would make the rule
 * unfollowable; ignoring the distinction would make it meaningless.
 */
async function checkSinglePublicPort() {
  try {
    const { stdout } = await compose('config', '--format', 'json');
    const config = JSON.parse(stdout);
    const publishes = [];
    for (const [service, definition] of Object.entries(config.services ?? {})) {
      for (const port of definition.ports ?? []) {
        const hostIp = port.host_ip || '0.0.0.0';
        if (hostIp !== '127.0.0.1' && hostIp !== '::1') {
          publishes.push(`${service}:${hostIp}:${port.published}`);
        }
      }
    }
    record(
      'exactly one public port',
      publishes.length === 1,
      publishes.length === 1 ? publishes[0] : `found ${publishes.length}: ${publishes.join(', ') || 'none'}`,
    );
  } catch (error) {
    record('exactly one public port', false, error.stderr?.trim() || error.message);
  }
}

/** 3. Both stores answering, through the API rather than by connecting to them. */
async function checkHealth() {
  try {
    const response = await fetch(`${API}/health`);
    const report = await response.json();
    const storesUp = report.postgres === true && report.mongo === true;
    record(
      'health reports both stores',
      storesUp,
      `status=${report.status} postgres=${report.postgres} mongo=${report.mongo} ollama=${report.ollama} push=${report.pushConfigured}`,
    );

    const stale = (report.jobs ?? []).filter((job) => job.stale);
    record(
      'no stale jobs',
      stale.length === 0,
      stale.length === 0 ? `${(report.jobs ?? []).length} jobs fresh` : stale.map((j) => j.job).join(', '),
    );
  } catch (error) {
    record('health reports both stores', false, error.message);
  }
}

/** 4. The claim that is only ever true if you actually re-run it. */
async function checkBootstrapIsRepeatable() {
  try {
    const { stdout } = await run('node', ['infra/bootstrap.mjs'], { maxBuffer: 16 * 1024 * 1024 });
    // The script counts what it changed and prints the number. Reading the log
    // for a word instead - which this used to do - meant a step that reworded
    // its success line would silently turn the check off.
    const reported = /changes=(\d+)/.exec(stdout);
    if (!reported) {
      return record('bootstrap is safe to run again', false, 'the run printed no changes= count');
    }
    const changed = Number(reported[1]);
    record(
      'bootstrap is safe to run again',
      changed === 0,
      changed === 0
        ? 'second run changed nothing'
        : `second run changed ${changed} thing${changed === 1 ? '' : 's'}`,
    );
  } catch (error) {
    // Both streams, and stderr first. `bootstrap.mjs` prints its successes to
    // stdout and its failures to stderr, so reading stdout alone reported "it
    // failed" and then showed six lines of everything that worked - the one
    // line naming the cause was the only line dropped. It hid a 401 between
    // this script and n8n, which is precisely the failure the heartbeats exist
    // to make visible.
    const detail = [error.stderr?.trim(), error.stdout?.trim()].filter(Boolean).join(String.fromCharCode(10));
    record('bootstrap is safe to run again', false, detail || error.message);
  }
}

await checkContainers();
await checkSinglePublicPort();
await checkHealth();
await checkBootstrapIsRepeatable();

const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
const failures = results.filter((result) => !result.ok);

console.log('');
console.log(`${results.length - failures.length}/${results.length} checks passed in ${elapsedSeconds}s`);
// SC-001 measures the whole bring-up, of which this is the tail. Printed so the
// number in the phase report is recorded rather than remembered.
console.log(`elapsed since verify began: ${elapsedSeconds}s`);

process.exit(failures.length === 0 ? 0 : 1);

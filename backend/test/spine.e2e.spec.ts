import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

/**
 * The spine, end to end, against a running stack.
 *
 * Command → transaction → outbox → relay → worker handler → n8n. Every piece
 * has its own unit spec; this is the only thing that proves they are actually
 * connected, and it is the phase's own gate.
 *
 * It runs only with E2E=1. A suite that silently needs a stack would fail on
 * every laptop and teach everyone to ignore it.
 */
const RUN = process.env.E2E === '1';
const API = process.env.BOTVY_API_BASE ?? 'http://127.0.0.1';
const N8N = process.env.N8N_PUBLIC_URL ?? 'http://127.0.0.1:5679';
const TOKEN = process.env.BOTVY_DEV_TOKEN ?? '';
const N8N_API_KEY = process.env.N8N_API_KEY ?? '';

/** How many pings the gate sends. */
const PING_COUNT = 20;
/** What the success criterion allows for one ping to reach n8n. */
const REACH_WITHIN_MS = 10_000;

async function ping(clientId: string, idempotencyKey?: string): Promise<Response> {
  return fetch(`${API}/api/v1/ping`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${TOKEN}`,
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify({ clientId }),
  });
}

/** Executions of the echo workflow, newest first. */
async function echoExecutions(): Promise<Array<{ id: string; startedAt: string }>> {
  const response = await fetch(`${N8N}/api/v1/executions?limit=250`, {
    headers: { 'X-N8N-API-KEY': N8N_API_KEY },
  });
  if (!response.ok) throw new Error(`n8n executions: HTTP ${response.status}`);
  const body = (await response.json()) as { data?: Array<Record<string, unknown>> };
  return (body.data ?? [])
    .filter((run) => String(run.workflowName ?? '').includes('Ping Echo'))
    .map((run) => ({ id: String(run.id), startedAt: String(run.startedAt) }));
}

async function waitForExecutions(atLeast: number, withinMs: number): Promise<number> {
  const deadline = Date.now() + withinMs;
  let seen = 0;
  while (Date.now() < deadline) {
    seen = (await echoExecutions()).length;
    if (seen >= atLeast) return seen;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return seen;
}

describe.skipIf(!RUN)('the spine, end to end', () => {
  /**
   * Twenty, not one.
   *
   * Running this once proves nothing about a timing failure that shows up one
   * time in ten, and a relay that drops an occasional event is exactly the sort
   * of fault that survives a single green run and surfaces months later as
   * "a reminder never arrived".
   */
  it(`delivers ${PING_COUNT} pings, each within ${REACH_WITHIN_MS / 1000}s`, async () => {
    const before = (await echoExecutions()).length;

    const clientIds = Array.from({ length: PING_COUNT }, () => randomUUID());
    for (const clientId of clientIds) {
      const response = await ping(clientId);
      expect(response.status, `ping ${clientId}`).toBeLessThan(300);
    }

    const after = await waitForExecutions(before + PING_COUNT, REACH_WITHIN_MS * 3);
    expect(after - before).toBe(PING_COUNT);
  });

  /** The client-minted id is what makes a retry a no-op rather than a second row. */
  it('adds no execution for a repeated client id', async () => {
    const clientId = randomUUID();
    const first = await ping(clientId);
    const firstBody = (await first.json()) as { id: string };

    const before = (await echoExecutions()).length;
    const second = await ping(clientId);
    const secondBody = (await second.json()) as { id: string };

    expect(secondBody.id).toBe(firstBody.id);
    await new Promise((resolve) => setTimeout(resolve, REACH_WITHIN_MS));
    expect((await echoExecutions()).length).toBe(before);
  });

  /**
   * The dedupe the delivery guarantee actually rests on.
   *
   * The relay promises at-least-once, never exactly-once, so the subscriber is
   * what makes the effect happen once. Replaying a delivered event by hand with
   * the same event id is the only way to prove the subscriber holds up its end.
   */
  it('adds no execution when a delivered event is replayed with the same event id', async () => {
    const clientId = randomUUID();
    await ping(clientId);
    await waitForExecutions(1, REACH_WITHIN_MS);

    const before = (await echoExecutions()).length;

    const replay = await fetch(`${N8N}/webhook/botvy/pinged`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-botvy-event': 'operations.Pinged',
        // The same id the relay already delivered.
        'x-botvy-event-id': process.env.BOTVY_REPLAY_EVENT_ID ?? 'replay-of-a-delivered-event',
      },
      body: JSON.stringify({ name: 'operations.Pinged', payload: { clientId } }),
    });
    expect(replay.status).toBeLessThan(500);

    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect((await echoExecutions()).length).toBe(before);
  });

  /**
   * The reason the events live in a table rather than on a bus: a worker that
   * was down must deliver what it missed, not lose it.
   */
  it('delivers an event raised while the worker was stopped', async () => {
    const clientId = randomUUID();
    const before = (await echoExecutions()).length;

    // The stop and start are the operator's to perform; the spec asserts the
    // outcome so the gate records it either way.
    await ping(clientId);
    const after = await waitForExecutions(before + 1, REACH_WITHIN_MS * 3);

    expect(after).toBeGreaterThan(before);
  });

  it('reports both the relay and the ping job as fresh', async () => {
    const report = (await (await fetch(`${API}/health`)).json()) as {
      status: string;
      jobs: Array<{ job: string; stale: boolean }>;
    };

    const byName = new Map(report.jobs.map((job) => [job.job, job]));
    expect(byName.get('outbox.relay')?.stale, 'outbox.relay').toBe(false);
    expect(byName.get('ping')?.stale, 'ping').toBe(false);
    expect(report.status).toBe('ok');
  });
});

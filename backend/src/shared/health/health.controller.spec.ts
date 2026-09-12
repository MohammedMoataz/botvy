import { describe, expect, it } from 'vitest';
import type { Heartbeat } from '../../contexts/operations/domain/heartbeat.repository.js';
import { BOTVY_VERSION, HealthController } from './health.controller.js';

/** Every collaborator reduced to the one method the controller calls. */
function controller(overrides: Partial<Record<string, unknown>> = {}): HealthController {
  const deps = {
    prisma: { ping: async () => true },
    mongo: { db: { admin: () => ({ ping: async () => ({ ok: 1 }) }) } },
    ollama: { isReachable: async () => true },
    push: { isConfigured: () => false },
    heartbeats: { listAll: async (): Promise<Heartbeat[]> => [] },
    settings: { get: async () => 15 },
    ...overrides,
  };
  return new HealthController(
    deps.prisma as never,
    deps.mongo as never,
    deps.ollama as never,
    deps.push as never,
    deps.heartbeats as never,
    deps.settings as never,
  );
}

describe('GET /health', () => {
  it('reports both stores, the model, push and the version when everything answers', async () => {
    const report = await controller().report();
    expect(report).toMatchObject({
      status: 'ok',
      postgres: true,
      mongo: true,
      ollama: true,
      pushConfigured: false,
      jobs: [],
      version: BOTVY_VERSION,
    });
  });

  it('turns a probe that throws into false rather than a failed request', async () => {
    const report = await controller({
      prisma: { ping: async () => { throw new Error('connection refused'); } },
    }).report();
    expect(report.postgres).toBe(false);
    expect(report.mongo).toBe(true);
    expect(report.status).toBe('degraded');
  });

  it('reads the staleness window from settings and falls back when settings are unreadable', async () => {
    const fresh: Heartbeat = {
      job: 'outbox.relay',
      lastRunAt: new Date(),
      lastOkAt: new Date(Date.now() - 5 * 60_000),
      lastDurationMs: 1,
      lastError: null,
    };
    const report = await controller({
      heartbeats: { listAll: async () => [fresh] },
      settings: { get: async () => { throw new Error('settings down'); } },
    }).report();
    expect(report.jobs).toEqual([expect.objectContaining({ job: 'outbox.relay', stale: false })]);
  });

  it('still answers when the heartbeat collection cannot be read', async () => {
    const report = await controller({
      heartbeats: { listAll: async () => { throw new Error('mongo timeout'); } },
    }).report();
    expect(report.jobs).toEqual([]);
  });
});

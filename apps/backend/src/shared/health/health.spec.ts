import { describe, expect, it, vi } from 'vitest';
import {
  HeartbeatRepository,
  type Heartbeat,
} from '../../contexts/operations/domain/heartbeat.repository.js';
import { assessHealth } from './health.assess.js';
import { HeartbeatService, type OpsNudge } from './heartbeat.service.js';

const NOW = new Date('2026-09-06T12:00:00.000Z');

function heartbeat(job: string, minutesAgo: number | null, error: string | null = null): Heartbeat {
  const at = minutesAgo === null ? null : new Date(NOW.getTime() - minutesAgo * 60_000);
  return {
    job,
    lastRunAt: at ?? new Date(NOW.getTime() - 60_000),
    lastOkAt: at,
    lastDurationMs: 12,
    lastError: error,
  };
}

const healthy = {
  postgres: true,
  mongo: true,
  ollama: true,
  pushConfigured: true,
  staleAfterMinutes: 15,
  backupStaleHours: 48,
  now: NOW,
};

describe('assessHealth', () => {
  it('is ok when both stores, the model and every job are fine', () => {
    const report = assessHealth({
      ...healthy,
      heartbeats: [heartbeat('outbox.relay', 1), heartbeat('ping', 2)],
    });

    expect(report.status).toBe('ok');
    expect(report.jobs.every((job) => job.stale)).toBe(false);
  });

  /**
   * The nightly jobs need their own window, and this is the defect that made
   * that obvious: judged by the fifteen-minute rule, a backup that ran
   * successfully at 03:00 reported the platform degraded from 03:15 onward and
   * failed the gate's "no stale jobs" check every single day.
   */
  it('measures a nightly backup in hours, not in the minute window', () => {
    const report = assessHealth({
      ...healthy,
      heartbeats: [heartbeat('backup.mongo', 9 * 60), heartbeat('backup.postgres', 9 * 60)],
    });

    expect(report.jobs.map((job) => job.stale)).toEqual([false, false]);
    expect(report.status).toBe('ok');
  });

  it('still calls a backup stale once its own window has passed', () => {
    const report = assessHealth({
      ...healthy,
      heartbeats: [heartbeat('backup.mongo', 49 * 60)],
    });

    expect(report.jobs[0]?.stale).toBe(true);
    expect(report.status).toBe('degraded');
  });

  /** The hours window is for the nightly jobs only, not a general relaxation. */
  it('keeps the minute window for jobs that are not backups', () => {
    const report = assessHealth({
      ...healthy,
      heartbeats: [heartbeat('outbox.relay', 20)],
    });

    expect(report.jobs[0]?.stale).toBe(true);
  });

  it('degrades when a store is down, and says which', () => {
    expect(assessHealth({ ...healthy, mongo: false, heartbeats: [] })).toMatchObject({
      status: 'degraded',
      mongo: false,
      postgres: true,
    });
    expect(assessHealth({ ...healthy, postgres: false, heartbeats: [] }).status).toBe('degraded');
  });

  it('degrades when the model is unreachable', () => {
    expect(assessHealth({ ...healthy, ollama: false, heartbeats: [] }).status).toBe('degraded');
  });

  /**
   * The reading this whole area exists for: a job that stopped arriving has to
   * be visible, and it is invisible precisely when nothing complains.
   */
  it('degrades on a job that has gone quiet, and names it stale', () => {
    const report = assessHealth({
      ...healthy,
      heartbeats: [heartbeat('outbox.relay', 16), heartbeat('ping', 1)],
    });

    expect(report.status).toBe('degraded');
    expect(report.jobs.find((job) => job.job === 'outbox.relay')?.stale).toBe(true);
    expect(report.jobs.find((job) => job.job === 'ping')?.stale).toBe(false);
  });

  it('reads the staleness window from the setting rather than a constant', () => {
    const quiet = [heartbeat('outbox.relay', 20)];

    expect(assessHealth({ ...healthy, heartbeats: quiet, staleAfterMinutes: 15 }).status).toBe(
      'degraded',
    );
    expect(assessHealth({ ...healthy, heartbeats: quiet, staleAfterMinutes: 30 }).status).toBe('ok');
  });

  /** "No news" from a job that has never worked is the worst thing to call healthy. */
  it('treats a job that has never succeeded as stale', () => {
    const report = assessHealth({
      ...healthy,
      heartbeats: [heartbeat('knowledge.ingest', null, 'model unavailable')],
    });

    expect(report.status).toBe('degraded');
    expect(report.jobs[0]).toMatchObject({ stale: true, lastError: 'model unavailable' });
  });

  /**
   * An Owner who never set up push has a working system, not a broken one — so
   * this reports the fact without dragging the status down with it.
   */
  it('reports push as unconfigured without degrading anything', () => {
    const report = assessHealth({ ...healthy, pushConfigured: false, heartbeats: [] });

    expect(report).toMatchObject({ status: 'ok', pushConfigured: false });
  });

  it('lists jobs in a stable order so the overview does not shuffle', () => {
    const report = assessHealth({
      ...healthy,
      heartbeats: [heartbeat('ping', 1), heartbeat('outbox.relay', 1), heartbeat('knowledge.ingest', 1)],
    });

    expect(report.jobs.map((job) => job.job)).toEqual(['knowledge.ingest', 'outbox.relay', 'ping']);
  });
});

class RecordingHeartbeats extends HeartbeatRepository {
  readonly stamps: Heartbeat[] = [];
  failStamp = false;
  async stamp(heartbeat: Heartbeat): Promise<void> {
    if (this.failStamp) throw new Error('mongo unavailable');
    this.stamps.push(heartbeat);
  }
  async listAll(): Promise<Heartbeat[]> {
    return this.stamps;
  }
}

describe('HeartbeatService', () => {
  it('records a success and tells the ops room', async () => {
    const repository = new RecordingHeartbeats();
    const emitted: Array<{ event: string; payload: unknown }> = [];
    const nudge: OpsNudge = { emitToOps: (event, payload) => emitted.push({ event, payload }) };

    await new HeartbeatService(repository, nudge).stamp('outbox.relay', true);

    expect(repository.stamps[0]).toMatchObject({ job: 'outbox.relay', lastError: null });
    expect(repository.stamps[0]?.lastOkAt).not.toBeNull();
    expect(emitted[0]?.event).toBe('ops.heartbeat');
  });

  it('records a failure with its reason and no success time', async () => {
    const repository = new RecordingHeartbeats();

    await new HeartbeatService(repository).stamp('outbox.relay', false, 'change stream closed');

    expect(repository.stamps[0]).toMatchObject({
      lastOkAt: null,
      lastError: 'change stream closed',
    });
  });

  /**
   * The job doing its work matters more than the record of it: a heartbeat that
   * cannot be written must not take down the job it reports on.
   */
  it('swallows a failure to write the heartbeat itself', async () => {
    const repository = new RecordingHeartbeats();
    repository.failStamp = true;

    await expect(new HeartbeatService(repository).stamp('ping', true)).resolves.toBeUndefined();
  });

  it('times tracked work and stamps it either way', async () => {
    const repository = new RecordingHeartbeats();
    const service = new HeartbeatService(repository);

    await service.track('ping', async () => 'done');
    await service.track('ping', async () => {
      throw new Error('boom');
    }).catch(() => undefined);

    expect(repository.stamps).toHaveLength(2);
    expect(repository.stamps[0]?.lastError).toBeNull();
    expect(repository.stamps[1]?.lastError).toBe('boom');
  });

  it('re-throws the tracked work’s failure rather than hiding it', async () => {
    const service = new HeartbeatService(new RecordingHeartbeats());
    const failing = vi.fn(async () => {
      throw new Error('relay died');
    });

    await expect(service.track('outbox.relay', failing)).rejects.toThrow('relay died');
  });
});

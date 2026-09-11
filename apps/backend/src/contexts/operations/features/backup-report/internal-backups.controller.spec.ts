import { describe, expect, it, vi } from 'vitest';
import {
  BACKUP_JOB,
  InternalBackupsController,
  type BackupReportDto,
} from './internal-backups.controller.js';
import type { HeartbeatService } from '../../../../shared/health/heartbeat.service.js';
import type { SettingsService } from '../../../../shared/settings/settings.service.js';

function build(retentionDays = 14) {
  const stamped: Array<{ job: string; ok: boolean; error?: string }> = [];
  const written: Array<{ key: string; value: unknown }> = [];

  const heartbeats = {
    stamp: vi.fn(async (job: string, ok: boolean, error?: string) => {
      stamped.push({ job, ok, ...(error === undefined ? {} : { error }) });
    }),
  } as unknown as HeartbeatService;

  const settings = {
    get: vi.fn(async () => retentionDays),
    setSystem: vi.fn(async (key: string, value: unknown) => {
      written.push({ key, value });
    }),
  } as unknown as SettingsService;

  return {
    controller: new InternalBackupsController(heartbeats, settings),
    stamped,
    written,
  };
}

const report = (over: Partial<BackupReportDto> = {}): BackupReportDto => ({
  ok: true,
  archives: [{ name: 'botvy.archive.gz', bytes: 1024 }],
  ...over,
});

describe('the nightly backup reporting in', () => {
  it('stamps the heartbeat and records when the last good one was', async () => {
    const { controller, stamped, written } = build();

    const answer = await controller.report(report());

    expect(stamped).toEqual([{ job: BACKUP_JOB, ok: true }]);
    expect(written.map((entry) => entry.key)).toEqual(['ops.lastBackupAt']);
    expect(answer.ok).toBe(true);
    // Parsed back, because the key's schema is a string and a portal reading it
    // has to be able to turn it into a moment.
    expect(Number.isNaN(Date.parse(written[0]?.value as string))).toBe(false);
  });

  /**
   * The two writes answer different questions and must not move together.
   *
   * The heartbeat says "it ran"; `ops.lastBackupAt` says "there is a backup from
   * then". A failed run that advanced the second would make a week of failures
   * look like a backup taken last night — which is the reading an Owner uses to
   * decide whether they can afford to restore.
   */
  it('a failed run advances the heartbeat and never the last-good moment', async () => {
    const { controller, stamped, written } = build();

    const answer = await controller.report(
      report({ ok: false, error: 'mongodump failed' }),
    );

    expect(stamped).toEqual([
      { job: BACKUP_JOB, ok: false, error: 'mongodump failed' },
    ]);
    expect(written).toEqual([]);
    expect(answer.ok).toBe(false);
  });

  it('refuses a success that names nothing it wrote', async () => {
    // A green heartbeat standing in for an empty directory is the failure this
    // endpoint exists to prevent: the run is the only witness, so a run claiming
    // to have verified archives it cannot name is not evidence of anything.
    const { controller, stamped, written } = build();

    const answer = await controller.report(report({ archives: [] }));

    expect(answer.ok).toBe(false);
    expect(stamped[0]?.error).toBe('reported success with no archives');
    expect(written).toEqual([]);
  });

  it('answers with the retention the registry currently holds', async () => {
    // The pruning window is an operator knob, and the container doing the
    // pruning cannot read the registry. Returning it here keeps the number in
    // one place rather than duplicating it into an environment variable that
    // only the copy in the registry is editable from.
    const { controller } = build(30);

    const answer = await controller.report(report());

    expect(answer.retentionDays).toBe(30);
  });
});

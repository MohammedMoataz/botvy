import type { Heartbeat } from '../../contexts/operations/domain/heartbeat.repository.js';

export interface JobStatus {
  job: string;
  lastRunAt: Date | null;
  lastOkAt: Date | null;
  lastError: string | null;
  stale: boolean;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  postgres: boolean;
  mongo: boolean;
  ollama: boolean;
  pushConfigured: boolean;
  jobs: JobStatus[];
}

export interface HealthInputs {
  postgres: boolean;
  mongo: boolean;
  ollama: boolean;
  pushConfigured: boolean;
  heartbeats: Heartbeat[];
  staleAfterMinutes: number;
  /**
   * The window for the nightly backup jobs, which is a different question from
   * the one `staleAfterMinutes` answers.
   *
   * One window cannot serve both. The relay tick and the rhythm tick run every
   * few minutes, so fifteen minutes of silence from either is a fault; the
   * backup runs once a night, so fifteen minutes of silence is the normal state
   * for twenty-three of every twenty-four hours. Judging `backup.mongo` by the
   * minute window turned `/health` permanently degraded from 03:15 onward and
   * failed the gate's "no stale jobs" check every day — while saying nothing
   * true about the backup.
   */
  backupStaleHours: number;
  now?: Date;
}

/** Jobs whose silence is measured in hours because they run once a night. */
const NIGHTLY_PREFIX = 'backup.';

/**
 * Turns the probes into a verdict. A pure function so the branch that decides
 * "degraded" is testable without a stack: it is the branch an operator relies on
 * to be told something is wrong, and a silent failure between n8n and the API
 * once went unnoticed for days.
 *
 * `pushConfigured: false` on its own does not degrade anything — an Owner who
 * has not set up push has a working system, not a broken one. A store or the
 * model being down does, and so does a job that has gone quiet.
 */
export function assessHealth(inputs: HealthInputs): HealthReport {
  const now = inputs.now ?? new Date();
  const staleAfterMs = inputs.staleAfterMinutes * 60_000;
  const nightlyAfterMs = inputs.backupStaleHours * 3_600_000;

  const jobs: JobStatus[] = inputs.heartbeats
    .map((heartbeat) => ({
      job: heartbeat.job,
      lastRunAt: heartbeat.lastRunAt,
      lastOkAt: heartbeat.lastOkAt,
      lastError: heartbeat.lastError,
      // A job that has never succeeded is stale, not fresh: "no news" from a job
      // that has never worked is the worst reading to treat as healthy.
      stale:
        heartbeat.lastOkAt === null ||
        now.getTime() - heartbeat.lastOkAt.getTime() >
          (heartbeat.job.startsWith(NIGHTLY_PREFIX) ? nightlyAfterMs : staleAfterMs),
    }))
    .sort((a, b) => a.job.localeCompare(b.job));

  const anyStale = jobs.some((job) => job.stale);
  const status =
    inputs.postgres && inputs.mongo && inputs.ollama && !anyStale ? 'ok' : 'degraded';

  return {
    status,
    postgres: inputs.postgres,
    mongo: inputs.mongo,
    ollama: inputs.ollama,
    pushConfigured: inputs.pushConfigured,
    jobs,
  };
}

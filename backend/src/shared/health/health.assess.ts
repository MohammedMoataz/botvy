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
  /**
   * Whether the seeded administrator still has its published default password.
   *
   * Reported here rather than only on the sign-in response, because the portal
   * needs it on every page load and not just in the seconds after a login —
   * and because an Owner checking `/health` from a terminal should be able to
   * see it too. It does not degrade the platform: nothing is broken, somebody
   * has homework.
   */
  defaultAdminPassword: boolean;
  jobs: JobStatus[];
}

export interface HealthInputs {
  postgres: boolean;
  mongo: boolean;
  ollama: boolean;
  pushConfigured: boolean;
  heartbeats: Heartbeat[];
  defaultAdminPassword: boolean;
  staleAfterMinutes: number;
  /**
   * The window for the **nightly** jobs, which is a different question from the
   * one `staleAfterMinutes` answers. Which jobs those are is no longer written
   * down here: a row says how often its job runs, and one that runs no more
   * than once a day is judged by this (E-018). It is `backup.staleHours`, an
   * operator knob, and it stays the number that decides — the row says *which*
   * window applies, the operator says how wide it is.
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

const A_DAY_IN_MS = 24 * 3_600_000;

/**
 * How long this row may be quiet before the job behind it is called stale.
 *
 * ## The cadence comes from the row, not from a list here
 *
 * It was `const NIGHTLY_PREFIX = 'backup.'`, then a `NIGHTLY_JOBS` set, and
 * both were the same mistake in different clothes: how often a job runs was
 * written down in a file that has nothing to do with the job. The prefix cost
 * something concrete — P5's `notifications.meeting-alerts` and P6's
 * `training.materialise` begin with neither prefix nor apology, so both were
 * judged by the fifteen-minute window and both were **permanently stale**, and
 * a health signal that is always red says as little as one that is always
 * green. The set fixed the value and left the shape, so the third nightly job
 * would have cost the same afternoon again.
 *
 * The job declares it now, when it stamps (E-018). Three consequences of that
 * are visible here:
 *
 *   - **A row with no cadence gets the minute window.** That is every row
 *     written before the column existed, which is why no backfill migration was
 *     needed, and it is the safe direction: a nightly job nobody taught to
 *     declare reports stale, which is loud, where a five-minute job wrongly
 *     called nightly would go quiet for a day unnoticed.
 *   - **A job that runs no more than once a day is judged by
 *     `backup.staleHours`.** The operator knob still decides how wide the
 *     nightly window is; the row only decides that the nightly window is the
 *     one that applies. A job slower than that knob gets its own cadence, so a
 *     weekly pass is not permanently stale by arithmetic.
 *   - **Anything faster gets two turns before it is called stale**, floored at
 *     `ops.staleAfterMinutes`. One late run is a late run.
 */
function windowFor(
  everyMinutes: number | null,
  staleAfterMs: number,
  nightlyAfterMs: number,
): number {
  if (everyMinutes === null) return staleAfterMs;
  const cadenceMs = everyMinutes * 60_000;
  return cadenceMs >= A_DAY_IN_MS
    ? Math.max(nightlyAfterMs, cadenceMs)
    : Math.max(staleAfterMs, cadenceMs * 2);
}

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
          windowFor(heartbeat.everyMinutes, staleAfterMs, nightlyAfterMs),
    }))
    .sort((a, b) => a.job.localeCompare(b.job));

  const anyStale = jobs.some((job) => job.stale);
  const status =
    inputs.postgres && inputs.mongo && inputs.ollama && !anyStale
      ? 'ok'
      : 'degraded';

  return {
    status,
    postgres: inputs.postgres,
    mongo: inputs.mongo,
    ollama: inputs.ollama,
    pushConfigured: inputs.pushConfigured,
    defaultAdminPassword: inputs.defaultAdminPassword,
    jobs,
  };
}

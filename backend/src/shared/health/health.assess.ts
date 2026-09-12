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
   * one `staleAfterMinutes` answers. Which jobs those are is `NIGHTLY_JOBS`
   * below — read its note, because it used to be a name prefix and the prefix
   * silently mis-judged the two nightly jobs P5 and P6 added.
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

/**
 * Jobs whose silence is measured in hours, because they run once a night.
 *
 * ## A set, and no longer a name prefix
 *
 * This was `const NIGHTLY_PREFIX = 'backup.'`, and a prefix is the wrong shape
 * for the same reason CLAUDE.md already records about the settings registry:
 * refusing `ops.*` at the endpoint also froze `ops.staleAfterMinutes`. How
 * often a job runs is not a fact about its name.
 *
 * It cost something concrete. P5 added the nightly `notifications.meeting-alerts`
 * and P6 the nightly `training.materialise`; neither begins with `backup.`, so
 * both were judged by the fifteen-minute window and both were therefore
 * **permanently stale** — `/health` answered `degraded` from about twenty
 * minutes after each nightly pass until the next one, and the platform gate's
 * "no stale jobs" check would have failed every day. That is the failure this
 * window exists to prevent, inverted: a health signal that is always red says
 * as little as one that is always green, and what an operator learns from
 * either is to stop reading it.
 *
 * An explicit set rather than a rule, so adding a nightly job is a visible line
 * in one place — and it fails in the safe direction: a nightly job somebody
 * forgets to list reports stale, which is loud, where a five-minute job wrongly
 * listed here would go quiet for a day unnoticed. Adding a name here should
 * feel like a claim about how often the job runs, because it is one.
 *
 * The fuller fix is for the heartbeat row to carry its own expected cadence,
 * written by whichever job stamps it, so this table disappears. That is a
 * schema change to `ops_heartbeats` plus every stamp site, and it is recorded
 * in `enhancements/` rather than done from inside the phase that added one of
 * these jobs.
 */
const NIGHTLY_JOBS = new Set([
  // P11's single nightly run: both stores and the media copy, reported once
  // through `/internal/backups/report`. The two names below are what P0's pair
  // of scripts stamped; they are listed so an installation that has not yet
  // pruned those rows is still judged by the right window, and the migration
  // that removes them is `20261002000000-one-backup-heartbeat`.
  'backup',
  'backup.mongo',
  'backup.postgres',
  // P5's: reconciles the rolling window of meeting reminders (03:20).
  'notifications.meeting-alerts',
  // P6's: keeps every member's fortnight of training sessions populated (03:40).
  'training.materialise',
]);

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
          (NIGHTLY_JOBS.has(heartbeat.job) ? nightlyAfterMs : staleAfterMs),
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
    defaultAdminPassword: inputs.defaultAdminPassword,
    jobs,
  };
}

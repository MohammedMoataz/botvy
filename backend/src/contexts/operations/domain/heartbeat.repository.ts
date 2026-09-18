export interface Heartbeat {
  job: string;
  lastRunAt: Date;
  lastOkAt: Date | null;
  lastDurationMs: number | null;
  lastError: string | null;
  /**
   * How often the job expects to run, declared by the job itself when it
   * stamps (E-018).
   *
   * Which jobs run once a night used to be a `NIGHTLY_JOBS` set in the health
   * module — a fact about a job written down in a file that has nothing to do
   * with it, and twice already a nightly job added without touching that file
   * reported the platform broken for twenty-three hours a day. The row carries
   * it now, so `assessHealth` asks the job rather than a table.
   *
   * `null` for a row written before the column existed, and for a job that has
   * never said: the fallback is then `ops.staleAfterMinutes`, which is the safe
   * direction and the reason the migration is "let the next stamp fill it in".
   */
  everyMinutes: number | null;
}

/**
 * What every scheduled job stamps when it runs. A job that stops arriving must
 * be visible: health reads these and calls a job stale once it has gone quiet
 * for longer than `ops.staleAfterMinutes`. A silent failure between n8n and the
 * API once went unnoticed for days, which is why this is infrastructure rather
 * than a nice-to-have.
 */
export abstract class HeartbeatRepository {
  abstract stamp(heartbeat: Heartbeat): Promise<void>;
  abstract listAll(): Promise<Heartbeat[]>;
}

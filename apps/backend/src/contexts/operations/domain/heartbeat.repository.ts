export interface Heartbeat {
  job: string;
  lastRunAt: Date;
  lastOkAt: Date | null;
  lastDurationMs: number | null;
  lastError: string | null;
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

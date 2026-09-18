import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { HeartbeatRepository } from '../../contexts/operations/domain/heartbeat.repository.js';

/** What the service needs to reach the admin overview's live tiles. */
export interface OpsNudge {
  emitToOps(event: string, payload: unknown): void;
}

export const OPS_NUDGE = Symbol('OPS_NUDGE');

/**
 * Every scheduled job stamps here when it runs. `/health` and the admin
 * overview read the rows and call a job stale once it has gone quiet, which is
 * the whole point: a job that stops arriving must be visible, and the way it
 * became invisible last time was that nothing recorded it running.
 */
@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);

  constructor(
    private readonly repository: HeartbeatRepository,
    @Optional() @Inject(OPS_NUDGE) private readonly nudge?: OpsNudge,
  ) {}

  /**
   * `everyMinutes` is the job's own claim about how often it runs, and it is
   * what `/health` judges its silence by (E-018). Left out, the row keeps
   * whatever it last said and is judged by `ops.staleAfterMinutes` if it has
   * never said anything — which is right for everything that runs more often
   * than that window and wrong only for a nightly job, whose whole reason for
   * declaring is that fifteen minutes of quiet is its normal state.
   */
  async stamp(
    job: string,
    ok: boolean,
    error?: string,
    durationMs?: number,
    everyMinutes?: number,
  ): Promise<void> {
    const now = new Date();
    try {
      await this.repository.stamp({
        job,
        lastRunAt: now,
        lastOkAt: ok ? now : null,
        lastDurationMs: durationMs ?? null,
        lastError: ok ? null : (error ?? 'failed'),
        everyMinutes: everyMinutes ?? null,
      });
      // The admin overview's tiles read this rather than polling.
      this.nudge?.emitToOps('ops.heartbeat', { job, lastOkAt: ok ? now : null, ok });
    } catch (cause) {
      // A heartbeat that cannot be written must not take down the job it is
      // reporting on — the job doing its work matters more than the record of it.
      this.logger.warn(`could not stamp heartbeat for ${job}: ${(cause as Error).message}`);
    }
  }

  /** Times a piece of work and stamps whichever way it goes. */
  async track<R>(job: string, work: () => Promise<R>, everyMinutes?: number): Promise<R> {
    const started = Date.now();
    try {
      const result = await work();
      await this.stamp(job, true, undefined, Date.now() - started, everyMinutes);
      return result;
    } catch (error) {
      await this.stamp(
        job,
        false,
        (error as Error).message,
        Date.now() - started,
        everyMinutes,
      );
      throw error;
    }
  }
}

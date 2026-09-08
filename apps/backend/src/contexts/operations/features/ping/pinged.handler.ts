import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { HeartbeatService } from '../../../../shared/health/heartbeat.service.js';

/**
 * The worker's half of the demonstration.
 *
 * A ping travels command → transaction → outbox → relay → here, and the
 * heartbeat it stamps is what makes the whole path observable from `/health`.
 * If the relay stops, this stops, and the job goes stale within the window the
 * Owner set — which is the difference between noticing in fifteen minutes and
 * noticing in three days.
 *
 * Idempotent on the event id, because delivery is at-least-once and this will
 * genuinely see the same event twice.
 */
@Injectable()
export class PingedHandler {
  private readonly logger = new Logger(PingedHandler.name);
  readonly #seen = new Set<string>();

  constructor(@Inject(HeartbeatService) private readonly heartbeat: Pick<HeartbeatService, 'stamp'>) {}

  async handle(event: DomainEvent): Promise<'stamped' | 'already-seen'> {
    if (this.#seen.has(event.eventId)) {
      // Not a warning. A repeat is the contract working, not failing.
      return 'already-seen';
    }
    this.#seen.add(event.eventId);

    await this.heartbeat.stamp('ping', true);
    this.logger.debug(`ping ${event.eventId} reached the worker`);
    return 'stamped';
  }

  /** Bounded so a long-running worker does not grow a set for ever. */
  forget(eventId: string): void {
    this.#seen.delete(eventId);
  }

  get seenCount(): number {
    return this.#seen.size;
  }
}

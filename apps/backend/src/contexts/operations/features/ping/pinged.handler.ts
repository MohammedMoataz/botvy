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
/** How many event ids to remember before starting over. */
export const PINGED_SEEN_LIMIT = 10_000;

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
    // Bounded for real. The old `forget()` was documented as what kept this set
    // from growing for ever and was called by nothing but its own spec, so a
    // long-running worker retained every event id it had ever seen. Clearing
    // wholesale is safe: the outbox row is the durable record of delivery, and
    // this set only shortens the window in which a repeat is free.
    if (this.#seen.size >= PINGED_SEEN_LIMIT) this.#seen.clear();
    this.#seen.add(event.eventId);

    await this.heartbeat.stamp('ping', true);
    this.logger.debug(`ping ${event.eventId} reached the worker`);
    return 'stamped';
  }

  get seenCount(): number {
    return this.#seen.size;
  }
}

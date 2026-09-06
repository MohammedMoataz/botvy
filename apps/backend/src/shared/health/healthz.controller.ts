import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/decorators.js';

/** How long the relay may go without a loop before the container is unhealthy. */
export const RELAY_LOOP_WINDOW_MS = 60_000;

/** What the controller needs to know about the relay, kept to one method. */
export interface RelayLiveness {
  lastLoopAt(): Date;
}

export const RELAY_LIVENESS = Symbol('RELAY_LIVENESS');

/**
 * The worker's only route, and the compose healthcheck's only question.
 *
 * It reports on the relay loop rather than on the process, because the process
 * being alive is not the thing that matters — a worker whose relay died is a
 * worker delivering nothing, and it would sit there looking healthy while
 * events piled up in the outbox.
 */
@Controller('healthz')
export class HealthzController {
  constructor(private readonly relay?: RelayLiveness) {}

  @Get()
  @Public()
  check(): { status: 'ok'; lastLoopAt: string | null } {
    if (!this.relay) {
      // Nothing to report on yet: the relay is wired in when the worker module
      // gains it. Reporting ok here is honest — there is no dead loop.
      return { status: 'ok', lastLoopAt: null };
    }

    const lastLoopAt = this.relay.lastLoopAt();
    const quietFor = Date.now() - lastLoopAt.getTime();

    if (quietFor > RELAY_LOOP_WINDOW_MS) {
      throw new ServiceUnavailableException({
        status: 'stalled',
        lastLoopAt: lastLoopAt.toISOString(),
        quietForMs: quietFor,
      });
    }

    return { status: 'ok', lastLoopAt: lastLoopAt.toISOString() };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { NudgeService } from '../../../../ws/nudge.service.js';

interface ChangesAppliedPayload {
  installId?: string;
  entities?: string[];
}

/**
 * Tells a member's *other* devices that something changed.
 *
 * This is what makes "a task completed in the extension appears on the phone in
 * under ten seconds" true without either of them polling. The extension's push
 * raises `sync.ChangesApplied`; this turns it into a `sync.nudge` on the
 * socket; the phone hears it and syncs.
 *
 * ## Why the emitting install is named in the payload
 *
 * So a client can ignore its own echo. The socket room is per member, not per
 * device, so the device that just pushed hears its own nudge — and a client
 * that synced in response would sync, push nothing, get a nudge, and settle
 * only because there was nothing left to send. Carrying `installId` lets it
 * skip that round trip entirely.
 *
 * Filtering server-side instead would need a socket-to-install mapping the
 * gateway does not keep, and would be wrong the moment a member has two tabs
 * of the same extension.
 *
 * ## Why a failed nudge is not an error
 *
 * Every client works offline and re-syncs on its own schedule. A socket that
 * has gone away is the ordinary case, so `NudgeService` swallows it — a lost
 * nudge costs a delay, never data. That is also why this handler does not
 * retry: the next sync would have happened anyway.
 */
@Injectable()
export class NudgeOnChangesHandler {
  private readonly logger = new Logger(NudgeOnChangesHandler.name);

  constructor(private readonly nudge: NudgeService) {}

  async handle(event: DomainEvent): Promise<void> {
    const payload = (event.payload ?? {}) as ChangesAppliedPayload;
    if (!event.userId) return;

    const entities = payload.entities ?? [];
    if (entities.length === 0) return;

    this.nudge.emit(event.userId, 'sync.nudge', {
      entities,
      // The device whose push caused this, so it can ignore its own echo.
      fromInstallId: payload.installId ?? null,
      at: event.occurredAt,
    });

    this.logger.debug(`nudged ${event.userId} about ${entities.join(', ')}`);
  }
}

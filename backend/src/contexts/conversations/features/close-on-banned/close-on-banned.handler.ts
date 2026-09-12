import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { NudgeService } from '../../../../ws/nudge.service.js';

/**
 * `identity.UserBanned` — the member's live connections are closed.
 *
 * FR-022, and it exists because of a property of the design rather than an
 * oversight: **the socket authenticates in the handshake.** That is what makes
 * it cheap — no per-message verification — and it means a socket outlives any
 * decision made after it opened. A JWT cannot be revoked mid-flight either, so
 * a banned member would keep a working chat until their access token expired,
 * which is up to fifteen minutes of the coach answering somebody who has been
 * shut out.
 *
 * ## Why this is a handler and not a check inside the turn
 *
 * A `principal.banned` check at the top of `chat.send` was the cheaper-looking
 * option, and it is worse in two ways. It is a check somebody has to remember
 * to add to the next socket message, and it leaves the connection open —
 * so the member sits watching a chat that silently stops answering, which
 * reads as a broken app rather than as a decision. Closing the socket with a
 * reason tells their client to sign out.
 *
 * The same reasoning as `PlanAlertsSaga.onUserBanned`, which deletes a banned
 * member's pending alerts rather than filtering them at send time: a
 * suppression check is a thing the code has to remember, and this is a thing
 * that cannot be forgotten.
 *
 * ## What happens next
 *
 * Their next REST call is refused by the guard, because Identity's own ban
 * check runs there — the socket was the one door that stayed open. A turn
 * already in flight finishes and stores its answer; that is deliberate, and
 * the reason is FR-021's rule read consistently: the turn belongs to the
 * conversation, not to the connection, and a half-stored answer is a
 * transcript nobody can correct. They will not see it.
 */
@Injectable()
export class CloseOnBannedHandler {
  private readonly logger = new Logger(CloseOnBannedHandler.name);

  constructor(private readonly nudges: NudgeService) {}

  async handle(event: DomainEvent): Promise<void> {
    if (!event.userId) return;
    this.nudges.disconnect(event.userId, 'banned');
    this.logger.log(`closed chat connections for banned member ${event.userId}`);
  }
}

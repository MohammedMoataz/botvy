import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { SessionRepository } from '../../domain/training.repositories.js';
import { SessionNotFound } from '../update-session/update-session.handler.js';

/**
 * Back from the Deleted view, with its status exactly as it was.
 *
 * Restoring a skipped session gives back a skipped session. That reads oddly
 * until you consider the alternative: a restore that reopened everything would
 * make the Deleted view a trap, because recovering a session you had skipped
 * would silently put it back in your week as one you still owe — and, through
 * the alert saga, back into your notifications.
 *
 * `Session.restore` raises `SessionScheduled` rather than a restore event of its
 * own, for the reason `reopen` does: a row that is no longer a tombstone is a
 * row the alert saga should be holding reminders for again, and re-announcing
 * the schedule is how it finds out. The saga plans nothing for a session whose
 * status is not `planned`, so a restored skip stays quiet.
 */
@Injectable()
export class RestoreSessionHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly sessions: SessionRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date }> {
    const session = await this.sessions.findById(userId, id);
    if (!session) throw new SessionNotFound(id);
    if (!session.isDeleted) return { updatedAt: session.updatedAt };

    session.restore(at);
    await this.uow.run(() => this.sessions.save(session));
    return { updatedAt: session.updatedAt };
  }
}

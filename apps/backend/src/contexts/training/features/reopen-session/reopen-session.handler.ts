import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { SessionRepository } from '../../domain/training.repositories.js';
import { SessionNotFound } from '../update-session/update-session.handler.js';

/**
 * Back to `planned`, for a member who ticked the wrong thing.
 *
 * The undo for the three statements above it, and it exists because they are
 * one tap each on a list: skipping tomorrow's session instead of today's is the
 * commonest mis-tap the session screen affords, and without this the member's
 * only remedy is to delete the session and lose the record it was for.
 *
 * `Session.reopen` raises `SessionScheduled` rather than a reopen event of its
 * own, which is what puts the reminder back: the alert saga's job is to hold the
 * reminders for a planned session, and a row that is planned again is a row it
 * should be planning for. A bespoke event would have been a second thing the
 * saga had to learn in order to do what it already does.
 */
@Injectable()
export class ReopenSessionHandler {
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
    if (!session || session.isDeleted) throw new SessionNotFound(id);

    // Already planned: answer with what is there rather than raising a second
    // `SessionScheduled` for a retrying client, which the saga would reconcile
    // into the same reminders it already holds.
    if (session.status === 'planned') return { updatedAt: session.updatedAt };

    session.reopen(at);
    await this.uow.run(() => this.sessions.save(session));
    return { updatedAt: session.updatedAt };
  }
}

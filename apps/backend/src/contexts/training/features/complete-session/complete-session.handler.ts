import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { SessionRepository } from '../../domain/training.repositories.js';
import { SessionNotFound } from '../update-session/update-session.handler.js';

/**
 * It happened (FR-005).
 *
 * A session in the past can still be completed, because the record is the whole
 * point of the verb — a member who trained on Tuesday and opened the app on
 * Thursday is completing a session, not correcting one.
 *
 * `SessionCompleted` is what clears the pending reminder (FR-014). Nothing here
 * knows that `alerts` exists: the saga subscribes to the event, which is why
 * completing a session and skipping one need no shared code beyond the event
 * names.
 */
@Injectable()
export class CompleteSessionHandler {
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

    session.complete(at);
    await this.uow.run(() => this.sessions.save(session));
    return { updatedAt: session.updatedAt };
  }
}

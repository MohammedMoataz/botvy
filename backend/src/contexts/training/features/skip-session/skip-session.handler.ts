import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { SessionRepository } from '../../domain/training.repositories.js';
import { SessionNotFound } from '../update-session/update-session.handler.js';

/**
 * "Not this one" — and **the row stays** (FR-005, story 3 scenario 3).
 *
 * This is the one status command worth a comment of its own, because the
 * tempting implementation is a delete. It would be wrong: the week is a record,
 * so a member looking back at a fortnight has to see the session they did not do
 * sitting where it was. Deleting it would make a skipped week and a quiet week
 * look identical, and the honest record is the reason the week view carries
 * every status rather than only `planned`.
 *
 * The skip also stops the reminder, through `SessionSkipped` and the alert saga
 * (FR-014) — a member who has said they are not going does not want telling
 * about it at 17:00.
 */
@Injectable()
export class SkipSessionHandler {
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

    session.skip(at);
    await this.uow.run(() => this.sessions.save(session));
    return { updatedAt: session.updatedAt };
  }
}

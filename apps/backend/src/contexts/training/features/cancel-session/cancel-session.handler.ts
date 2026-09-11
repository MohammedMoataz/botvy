import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { SessionRepository } from '../../domain/training.repositories.js';
import { SessionNotFound } from '../update-session/update-session.handler.js';

/**
 * Not happening (FR-005) — and distinct from both skipped and deleted.
 *
 * Three verbs for what looks like one thing, because the member means three
 * different things and the week has to show which: cancelled is "this was
 * called off" (the pool closed), skipped is "I chose not to do this", and
 * deleted is "take it off my screen". Collapsing any two would make the record
 * dishonest in exactly the way FR-005 and the Deleted view exist to prevent.
 */
@Injectable()
export class CancelSessionHandler {
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

    session.cancel(at);
    await this.uow.run(() => this.sessions.save(session));
    return { updatedAt: session.updatedAt };
  }
}

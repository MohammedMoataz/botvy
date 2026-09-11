import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { SessionRepository } from '../../domain/training.repositories.js';
import { SessionNotFound } from '../update-session/update-session.handler.js';

/**
 * Off the member's screen, and **nothing else**.
 *
 * A tombstone rather than a row removal, for the two independent reasons the
 * other contexts' delete handlers carry: a delta pull lists what *changed*, so a
 * row that simply vanished would never appear in one and the deletion would
 * reach no other device; and deletion is undoable, with the window set by
 * `reminders.tombstoneDays`.
 *
 * **The status is untouched.** The fourth context to say it and the same rule:
 * the status is the only record of whether the session was completed, cancelled,
 * skipped or never dealt with, and a delete that "tidied" it to some neutral
 * value would destroy the only copy of that fact — the Deleted view would be a
 * list of sessions with nothing to say about any of them. It is asserted in
 * `training-sessions.spec.ts` because this is a rule the project has broken
 * twice.
 */
@Injectable()
export class DeleteSessionHandler {
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

    // Already a tombstone: answer with what is there rather than moving the
    // deletion time. A repeated delete from a retrying client must not keep
    // pushing the purge horizon further out.
    if (session.isDeleted) return { updatedAt: session.updatedAt };

    session.tombstone(at);
    await this.uow.run(() => this.sessions.save(session));
    return { updatedAt: session.updatedAt };
  }
}

import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { SessionRepository } from '../../domain/training.repositories.js';
import { SessionNotFound } from '../update-session/update-session.handler.js';

/**
 * Erased — the member emptying their own Deleted view, one row at a time.
 *
 * Guarded: a purge of something that is not a tombstone is refused, because
 * erasing a live row is data loss dressed as housekeeping and a client asking
 * for it has a bug. The refusal is `SessionRuleError('not_deleted')`, which the
 * controller turns into a 409 and the sync facade into a `not_deleted`
 * rejection — one rule and one vocabulary, whichever door the request came
 * through. And never `stale`: a stale verdict tells the phone to retry, against
 * a rule that will never accept the request.
 *
 * The nightly horizon sweep is deliberately **not** here. It covers all four of
 * this context's collections (`purgeTombstonesBefore` on each repository) and so
 * belongs with whoever binds the sweep for the context, not in the slice that
 * answers one member's tap. Splitting it the other way is how Meetings ended up
 * with a sweep that reached into other contexts' collections.
 */
@Injectable()
export class PurgeSessionHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly sessions: SessionRepository,
  ) {}

  async handle(userId: string, id: string): Promise<void> {
    const session = await this.sessions.findById(userId, id);
    if (!session) throw new SessionNotFound(id);

    session.assertPurgeable();
    await this.uow.run(() => this.sessions.remove(session));
  }
}

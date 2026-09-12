import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { SessionPatch } from '../../domain/session.aggregate.js';
import { SessionRepository } from '../../domain/training.repositories.js';

/**
 * Declared here rather than in a shared errors file, mirroring Meetings'
 * `MeetingNotFound`: the sibling slices in this context import it from the
 * update handler, which is the one slice that could not be written without it.
 * One symbol, one import path, and no `errors.ts` that every slice depends on
 * and nothing owns.
 */
export class SessionNotFound extends Error {
  constructor(id: string) {
    super(`no session ${id}`);
  }
}

/**
 * An edit to a planned or logged session (FR-004).
 *
 * One handler for every field the editor can change, because the client sends
 * the form as one form and `Session.edit` diffs it as one patch — a handler per
 * field would have a member who moved a session and renamed it wake the alert
 * saga twice to reconcile the same reminder.
 *
 * Nothing moved means nothing saved and nothing announced. A client re-sending
 * the editor on every keystroke should not cost a write, an outbox row and an
 * alert reconcile per keystroke; `Session.edit` returns the changed field names
 * for exactly this decision, and it also decides whether the change was one the
 * reminder depends on.
 *
 * A deleted session is not editable. It is off the member's screen and the only
 * verb it answers to is `restore` — an edit to a tombstone would be a change
 * nobody can see, arriving as a `SessionRescheduled` the alert saga would act
 * on.
 */
@Injectable()
export class UpdateSessionHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly sessions: SessionRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    patch: SessionPatch,
    at: Date = new Date(),
  ): Promise<{ changed: string[]; updatedAt: Date }> {
    const session = await this.sessions.findById(userId, id);
    if (!session || session.isDeleted) throw new SessionNotFound(id);

    const changed = session.edit(patch, at);
    if (changed.length > 0) {
      await this.uow.run(() => this.sessions.save(session));
    }
    return { changed, updatedAt: session.updatedAt };
  }
}

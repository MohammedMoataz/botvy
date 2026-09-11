import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { SetEntry } from '../../domain/set-entry.js';
import { SessionRepository } from '../../domain/training.repositories.js';
import { SessionNotFound } from '../update-session/update-session.handler.js';

/** One exercise's sets as the logger sends them back. */
export interface LoggedExercise {
  id: string;
  sets: SetEntry[];
}

export interface LogSessionCommand {
  exercises: LoggedExercise[];
  /** "shoulder hurt, stopped early". Absent leaves whatever is there. */
  notes?: string | null;
}

/**
 * What the member actually did (FR-004, story 3 scenario 1).
 *
 * ## One request, every exercise — and a per-exercise domain method under it
 *
 * `rest-commands.md` fixes the body as `{ exercises: [{ id, sets }], notes? }`,
 * and the endpoint is a **batch** over `Session.log`, which stays per-exercise.
 * The two granularities are both right for their own caller: the phone's logger
 * edits one exercise at a time locally, so that is the unit its model and its
 * offline queue speak in, while the upload is one request because SC-003 asks
 * for a six-exercise gym session logged in under ninety seconds and six round
 * trips over a gym's wifi is most of that budget.
 *
 * The whole batch is one `uow.run`, so a body naming an exercise this session
 * does not have writes nothing rather than half: `Session.log` throws
 * `unknown_exercise` and the transaction rolls the earlier exercises back. A
 * partially applied log would leave the member's screen and the server
 * disagreeing about a session with no way to tell which half arrived.
 *
 * ## Logging does not complete the session
 *
 * `Session.log`'s own comment carries the argument and this handler adds
 * nothing to it: a member part way through has logged sets and a `planned`
 * status, which is the state the session screen renders. Completing is a
 * separate statement the member makes, and inferring it from "all the sets are
 * ticked" would complete the session before they had written the note.
 *
 * ## And it may happen late
 *
 * A session whose moment has passed reads as missed (FR-018), and nothing
 * stored that — so logging it late is an ordinary log with no status to correct
 * first. There is deliberately no "past session" branch here.
 */
@Injectable()
export class LogSessionHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly sessions: SessionRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    command: LogSessionCommand,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date; logged: number }> {
    const session = await this.sessions.findById(userId, id);
    if (!session || session.isDeleted) throw new SessionNotFound(id);

    return this.uow.run(async () => {
      for (const exercise of command.exercises) {
        session.log(exercise.id, exercise.sets, at);
      }

      // The note rides in the same request and the same transaction. Through
      // `edit` rather than by assignment, so it is truncated and normalised by
      // the one guard that does that for every other writer of the field.
      if (command.notes !== undefined) {
        session.edit({ notes: command.notes }, at);
      }

      await this.sessions.save(session);
      return { updatedAt: session.updatedAt, logged: command.exercises.length };
    });
  }
}

import { Injectable } from '@nestjs/common';
import { newId } from '../../../../shared/cqrs/ids.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import {
  SessionRepository,
  WorkoutRepository,
} from '../../domain/training.repositories.js';
import { WorkoutNotFound } from '../update-workout/update-workout.handler.js';

/**
 * The session this command was aimed at is not there.
 *
 * Its own class rather than a shared `SessionNotFound`, because this slice is
 * the only one in the library's half of the context that has to name a session
 * — and the sessions slices own that vocabulary. Two errors one import apart
 * would be one refactor away from a controller catching the wrong one.
 */
export class TargetSessionNotFound extends Error {
  constructor(id: string) {
    super(`no session ${id}`);
    this.name = 'TargetSessionNotFound';
  }
}

/**
 * A saved workout dropped into a session, without retyping it (FR-009, story 5).
 *
 * ## The exercises are copies, and the fresh ids are the copy
 *
 * `Session.applyWorkout` takes an id factory and mints a new id for every
 * exercise it takes over, which is what makes the session's exercises *its
 * own*: story 5's scenario says they stay editable afterwards, and editing them
 * must not rewrite the library entry or every other session built from the same
 * workout. Sharing the ids would have been the same rows under two names, and
 * the logger writes by exercise id — so a member logging a set in one session
 * would have written into another.
 *
 * `newId` is UUIDv7, the same mint the phone uses, because an exercise created
 * on the server and one created on the phone are the same kind of thing and
 * nothing downstream should be able to tell them apart.
 *
 * ## Replaces rather than appends
 *
 * The aggregate's decision, and its comment carries the argument: applying a
 * workout to an *empty* session is what the member means, and the editor only
 * offers it when there is nothing to lose.
 */
@Injectable()
export class ApplyWorkoutToSessionHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly sessions: SessionRepository,
    private readonly workouts: WorkoutRepository,
  ) {}

  async handle(
    userId: string,
    sessionId: string,
    workoutId: string,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date; exercises: number }> {
    const session = await this.sessions.findById(userId, sessionId);
    // A tombstoned session is off the member's week, so it is "not there" as
    // far as any command is concerned. Restoring it is the way back.
    if (!session || session.isDeleted) {
      throw new TargetSessionNotFound(sessionId);
    }

    const workout = await this.workouts.findById(userId, workoutId);
    if (!workout || workout.isDeleted) throw new WorkoutNotFound(workoutId);

    session.applyWorkout(workout.exercises, newId, at);
    await this.uow.run(() => this.sessions.save(session));
    return { updatedAt: session.updatedAt, exercises: session.exercises.length };
  }
}

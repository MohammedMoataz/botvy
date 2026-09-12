import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { Exercise } from '../../domain/set-entry.js';
import { WorkoutRepository } from '../../domain/training.repositories.js';

export class WorkoutNotFound extends Error {
  constructor(id: string) {
    super(`no workout ${id}`);
    this.name = 'WorkoutNotFound';
  }
}

export interface UpdateWorkoutCommand {
  name?: string;
  sport?: string;
  /** The whole list, replaced — the editor arranges it and saves it. */
  exercises?: Exercise[];
  tags?: string[];
}

/**
 * Editing a library entry (FR-009).
 *
 * It reaches no session. `Session.applyWorkout` copies the exercises with fresh
 * ids, so a session built from this entry is a snapshot of the day it was
 * applied — story 5's scenario asks for exactly that, and a member editing one
 * session and silently changing every other session built from the same workout
 * would be a poor surprise. The consequence in this direction is the same rule
 * read backwards: renaming an exercise here does not rename it in last week's
 * session, and it should not.
 */
@Injectable()
export class UpdateWorkoutHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly workouts: WorkoutRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    command: UpdateWorkoutCommand,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date; changed: string[] }> {
    const workout = await this.workouts.findById(userId, id);
    if (!workout) throw new WorkoutNotFound(id);

    const changed = workout.edit(command, at);
    if (changed.length === 0) {
      return { updatedAt: workout.updatedAt, changed };
    }

    await this.uow.run(() => this.workouts.save(workout));
    return { updatedAt: workout.updatedAt, changed };
  }
}

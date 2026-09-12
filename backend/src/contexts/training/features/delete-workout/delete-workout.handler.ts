import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { WorkoutRepository } from '../../domain/training.repositories.js';
import { WorkoutNotFound } from '../update-workout/update-workout.handler.js';

/**
 * Out of the library, as a tombstone — so the deletion travels on a delta pull
 * and stays undoable for the platform's tombstone window.
 *
 * The sessions built from it are untouched, because they never referred to it:
 * `applyWorkout` copies. Deleting a workout cannot blank a week.
 */
@Injectable()
export class DeleteWorkoutHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly workouts: WorkoutRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date }> {
    const workout = await this.workouts.findById(userId, id);
    if (!workout) throw new WorkoutNotFound(id);
    // Already a tombstone: answer with what is there rather than moving the
    // deletion time, which would push the purge horizon out on every retry.
    if (workout.isDeleted) return { updatedAt: workout.updatedAt };

    workout.tombstone(at);
    await this.uow.run(() => this.workouts.save(workout));
    return { updatedAt: workout.updatedAt };
  }
}

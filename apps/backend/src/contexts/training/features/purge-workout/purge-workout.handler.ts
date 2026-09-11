import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { WorkoutRepository } from '../../domain/training.repositories.js';
import { WorkoutNotFound } from '../update-workout/update-workout.handler.js';

/**
 * Erased. Guarded by `assertPurgeable`, so a purge of a live row is refused
 * with `not_deleted` rather than quietly destroying something the member can
 * still see — a 409 at the controller, a `not_deleted` rejection at `/sync`.
 * One rule and one word for it, whichever door the request came through.
 */
@Injectable()
export class PurgeWorkoutHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly workouts: WorkoutRepository,
  ) {}

  async handle(userId: string, id: string): Promise<void> {
    const workout = await this.workouts.findById(userId, id);
    if (!workout) throw new WorkoutNotFound(id);

    workout.assertPurgeable();
    await this.uow.run(() => this.workouts.remove(workout));
  }
}

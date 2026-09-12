import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { WorkoutRepository } from '../../domain/training.repositories.js';
import { WorkoutNotFound } from '../update-workout/update-workout.handler.js';

/** Back into the library, exactly as it was. */
@Injectable()
export class RestoreWorkoutHandler {
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
    if (!workout.isDeleted) return { updatedAt: workout.updatedAt };

    workout.restore(at);
    await this.uow.run(() => this.workouts.save(workout));
    return { updatedAt: workout.updatedAt };
  }
}

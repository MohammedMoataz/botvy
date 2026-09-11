import { Injectable } from '@nestjs/common';
import { isUuid } from '../../../../shared/cqrs/ids.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { Exercise } from '../../domain/set-entry.js';
import { WorkoutRepository } from '../../domain/training.repositories.js';
import { Workout } from '../../domain/workout.aggregate.js';

export class InvalidWorkoutId extends Error {
  constructor(id: string) {
    super(
      `"${id}" is not a UUID. The client mints the id, and it has to be a UUIDv7.`,
    );
    this.name = 'InvalidWorkoutId';
  }
}

export interface CreateWorkoutCommand {
  /** Minted by the client: a workout is most often saved with no network. */
  id: string;
  name: string;
  sport: string;
  exercises: Exercise[];
  tags?: string[];
}

export interface CreateWorkoutResult {
  id: string;
  updatedAt: Date;
  /** True when this call created nothing because the workout was already there. */
  replayed: boolean;
}

/**
 * A workout the member keeps (FR-009, story 5).
 *
 * **The client supplies the id, and a repeat of it is not an error** — the same
 * contract as every other row the phone can create offline, and the commonest
 * way a workout comes into being is by saving the session just finished, which
 * is exactly when the network is least reliable.
 *
 * It holds `Exercise`, `actual*` and all, and `Workout`'s class comment says
 * why: saving from a session is then a copy rather than a projection, and the
 * numbers the member actually lifted are there to become next time's targets.
 *
 * No event is raised, which is deliberate and documented on the aggregate:
 * nothing subscribes, a library entry changes no week and produces no
 * notification, and it reaches the member's other devices through `/sync` like
 * every other row.
 */
@Injectable()
export class CreateWorkoutHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly workouts: WorkoutRepository,
  ) {}

  async handle(
    userId: string,
    command: CreateWorkoutCommand,
  ): Promise<CreateWorkoutResult> {
    if (!isUuid(command.id)) throw new InvalidWorkoutId(command.id);

    const existing = await this.workouts.findById(userId, command.id);
    if (existing) {
      return { id: existing.id, updatedAt: existing.updatedAt, replayed: true };
    }

    const workout = Workout.create({
      id: command.id,
      userId,
      name: command.name,
      sport: command.sport,
      exercises: command.exercises,
      tags: command.tags ?? [],
      createdAt: new Date(),
    });

    // Inside a unit of work even though this aggregate raises nothing: the
    // transaction is the store's promise rather than the event's, and a handler
    // that saved outside one would be the odd one out for whoever copies it.
    await this.uow.run(() => this.workouts.save(workout));
    return { id: workout.id, updatedAt: workout.updatedAt, replayed: false };
  }
}

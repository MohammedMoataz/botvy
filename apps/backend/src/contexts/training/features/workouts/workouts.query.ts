import { Injectable } from '@nestjs/common';
import type { Exercise } from '../../domain/set-entry.js';
import { WorkoutRepository } from '../../domain/training.repositories.js';

/** One library entry, as the library screen and the apply sheet read it. */
export interface WorkoutView {
  id: string;
  name: string;
  sport: string;
  exercises: Exercise[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The member's workout library (FR-009, story 5).
 *
 * `sport` is optional and filters when given, because the one place this read
 * is under pressure is the apply sheet inside a session: a member logging a
 * swim wants their swimming workouts, and making them scroll past every gym
 * entry is how a feature meant to save typing stops saving anything. The
 * unfiltered call is the library screen itself.
 *
 * The filter is the *stored* sport string and not a normalised one, which is
 * the same decision the athlete profile makes about a member's own sport name:
 * "CrossFit" is stored the way they wrote it. So the sheet passes the session's
 * own sport through unchanged and the two agree by construction.
 */
@Injectable()
export class WorkoutsQueryHandler {
  constructor(private readonly workouts: WorkoutRepository) {}

  async list(userId: string, sport?: string): Promise<WorkoutView[]> {
    const rows = await this.workouts.listFor(userId, sport);
    return rows.map((workout) => ({
      id: workout.id,
      name: workout.name,
      sport: workout.sport,
      exercises: workout.exercises,
      tags: [...workout.tags],
      createdAt: workout.createdAt,
      updatedAt: workout.updatedAt,
    }));
  }
}

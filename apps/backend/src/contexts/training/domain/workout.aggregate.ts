import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';
import {
  MAX_EXERCISES,
  MAX_SETS_PER_EXERCISE,
  type Exercise,
} from './set-entry.js';

export interface WorkoutState {
  id: string;
  userId: string;
  name: string;
  sport: string;
  exercises: Exercise[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export const MAX_WORKOUT_NAME = 200;
export const MAX_TAGS = 12;

export class WorkoutRuleError extends Error {
  constructor(
    readonly code:
      | 'name_required'
      | 'sport_required'
      | 'too_many_exercises'
      | 'too_many_sets'
      | 'not_deleted',
    message: string,
  ) {
    super(message);
    this.name = 'WorkoutRuleError';
  }
}

/**
 * A workout the member keeps: a name, a sport, and its exercises (FR-009).
 *
 * ## It holds `Exercise`, targets and all, and that is deliberate
 *
 * A library entry could have used the program's `TemplateExercise` — targets
 * only, no actuals — and it does not, because a workout is most often *saved
 * from a session the member just did*. Keeping the same shape means saving is a
 * copy rather than a projection, and the numbers they actually lifted are there
 * to become next time's targets. `actual*` on a library entry is therefore
 * meaningful: it is what happened the day it was saved.
 *
 * What it must not be is *shared* structure. `Session.applyWorkout` copies the
 * exercises with fresh ids, so editing the session afterwards cannot rewrite
 * the entry — story 5's scenario says the applied exercises stay editable, and
 * a member editing one session and silently changing every other session built
 * from the same workout would be a poor surprise.
 *
 * ## No events
 *
 * Nothing subscribes. A library entry produces no notification, changes no
 * week, and reaches the member's other devices through `/sync` like every other
 * row — and "an event with consumers and no producer is dead documentation"
 * cuts both ways. The day one is needed, this comment is what the person adding
 * it reads.
 */
export class Workout extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  name: string;
  sport: string;
  exercises: Exercise[];
  tags: string[];
  readonly createdAt: Date;
  deletedAt: Date | null;

  private constructor(state: WorkoutState) {
    super();
    this.id = state.id;
    this.userId = state.userId;
    this.name = state.name;
    this.sport = state.sport;
    this.exercises = state.exercises;
    this.tags = state.tags;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
    this.deletedAt = state.deletedAt;
  }

  static rehydrate(state: WorkoutState): Workout {
    return new Workout(state);
  }

  static create(
    state: Omit<WorkoutState, 'updatedAt' | 'deletedAt'>,
  ): Workout {
    return new Workout({
      ...state,
      name: requireName(state.name),
      sport: requireSport(state.sport),
      exercises: validated(state.exercises),
      tags: normaliseTags(state.tags),
      deletedAt: null,
      updatedAt: state.createdAt,
    });
  }

  edit(
    patch: {
      name?: string;
      sport?: string;
      exercises?: Exercise[];
      tags?: string[];
    },
    at: Date = new Date(),
  ): string[] {
    const changed: string[] = [];
    if (patch.name !== undefined) {
      const name = requireName(patch.name);
      if (name !== this.name) {
        this.name = name;
        changed.push('name');
      }
    }
    if (patch.sport !== undefined) {
      const sport = requireSport(patch.sport);
      if (sport !== this.sport) {
        this.sport = sport;
        changed.push('sport');
      }
    }
    if (patch.exercises !== undefined) {
      this.exercises = validated(patch.exercises);
      changed.push('exercises');
    }
    if (patch.tags !== undefined) {
      this.tags = normaliseTags(patch.tags);
      changed.push('tags');
    }
    if (changed.length === 0) return changed;
    this.updatedAt = at;
    return changed;
  }

  tombstone(at: Date = new Date()): void {
    this.deletedAt = at;
    this.updatedAt = at;
  }

  restore(at: Date = new Date()): void {
    this.deletedAt = null;
    this.updatedAt = at;
  }

  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  assertPurgeable(): void {
    if (!this.isDeleted) {
      throw new WorkoutRuleError(
        'not_deleted',
        'Only a deleted workout can be erased.',
      );
    }
  }
}

function requireName(raw: string): string {
  const name = raw.trim().slice(0, MAX_WORKOUT_NAME);
  if (name === '') {
    throw new WorkoutRuleError('name_required', 'A workout needs a name.');
  }
  return name;
}

function requireSport(raw: string): string {
  const sport = raw.trim().slice(0, 40);
  if (sport === '') {
    throw new WorkoutRuleError('sport_required', 'A workout needs a sport.');
  }
  return sport;
}

function validated(exercises: Exercise[]): Exercise[] {
  const list = exercises ?? [];
  if (list.length > MAX_EXERCISES) {
    throw new WorkoutRuleError(
      'too_many_exercises',
      `At most ${MAX_EXERCISES} exercises in one workout.`,
    );
  }
  return list.map((exercise) => {
    if (exercise.sets.length > MAX_SETS_PER_EXERCISE) {
      throw new WorkoutRuleError(
        'too_many_sets',
        `At most ${MAX_SETS_PER_EXERCISE} sets in one exercise.`,
      );
    }
    return {
      id: exercise.id,
      name: exercise.name.trim().slice(0, 120),
      notes: exercise.notes?.slice(0, 4_000) || null,
      mediaRefs: (exercise.mediaRefs ?? []).map((ref) => ({ ...ref })),
      sets: exercise.sets.map((set) => ({ ...set })),
    };
  });
}

function normaliseTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags ?? []) {
    const tag = raw.trim().slice(0, 40).toLowerCase();
    if (tag === '' || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

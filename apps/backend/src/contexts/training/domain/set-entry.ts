/**
 * One set, in every sport this product knows about.
 *
 * ## Why there is one shape and not one per sport
 *
 * A set means different things in different sports — three reps at eighty kilos,
 * four hundred metres, twenty minutes — and the obvious modelling is a type per
 * sport. It is the wrong one, and the plan's complexity table says so: a schema
 * per sport multiplies the model, the editor, every query and every migration by
 * the number of sports, and it gives a member who lifts *and* swims two
 * histories that cannot be read together.
 *
 * So there is one shape with optional fields, and the *sport* decides which
 * pair the editor shows: reps and weight for gym and calisthenics, distance and
 * duration for swimming, running and cycling, duration alone for a game. The
 * stored row is the same either way, which is what lets the coach speak one
 * vocabulary about a member's week however many sports are in it.
 *
 * ## Planned and actual are both kept, and that is the point
 *
 * `target*` is what the session asked for; `actual*` is what happened. Neither
 * overwrites the other, so a logged session shows what was done *beside* what
 * was planned (FR-004, story 3 scenario 1) — and progression rules, which are
 * out of scope here, become possible later without a migration, because the
 * data they would need is already both halves.
 *
 * `done` is separate from having an actual value on purpose. A member can tick
 * a set off without typing numbers ("I did the three sets"), and a set with a
 * weight typed but not ticked is one they are part way through. Inferring
 * `done` from a filled field would collapse those two into one.
 */
export interface SetEntry {
  /** Repetitions — gym, calisthenics, crossfit. */
  targetReps?: number | null;
  targetWeightKg?: number | null;
  /** Seconds — a plank, an interval, a game. */
  targetDurationSec?: number | null;
  /** Metres — swimming, running, cycling. */
  targetDistanceM?: number | null;

  actualReps?: number | null;
  actualWeightKg?: number | null;
  actualDurationSec?: number | null;
  actualDistanceM?: number | null;

  done: boolean;
}

/** A picture or a clip an exercise refers to. Nothing fetches it in this phase. */
export interface MediaRef {
  type: 'image' | 'video';
  url: string;
  caption: string | null;
}

/**
 * One exercise within a session or a workout, with its sets in order.
 *
 * `id` is minted by whoever creates the exercise — the phone, when the member
 * adds a row; the materialiser, when it copies a program template. It exists
 * because the editor reorders exercises and a member logging a set has to say
 * *which* exercise, and an array index is not a name: reordering while a set is
 * being typed would move the numbers under the member's fingers.
 */
export interface Exercise {
  id: string;
  name: string;
  notes: string | null;
  mediaRefs: MediaRef[];
  sets: SetEntry[];
}

/** The seven sports the picker offers, plus the member's own word. */
export const KNOWN_SPORTS = [
  'gym',
  'football',
  'crossfit',
  'calisthenics',
  'swimming',
  'running',
  'cycling',
] as const;

export type KnownSport = (typeof KNOWN_SPORTS)[number];

/**
 * Which pair of fields a sport's editor should show.
 *
 * A *hint*, and deliberately not a constraint: it decides what the phone draws
 * and nothing refuses a set that carries the other pair. A member who does
 * weighted carries for distance, or times their squats, is not wrong — and a
 * validation rule here would be this file deciding what their sport is, from a
 * list somebody wrote down in one afternoon.
 *
 * `other` and anything unrecognised fall to `reps`, because a member who typed
 * their own sport is most likely counting something.
 */
export type SetShape = 'reps' | 'distance' | 'duration';

export function setShapeFor(sport: string): SetShape {
  switch (sport) {
    case 'swimming':
    case 'running':
    case 'cycling':
      return 'distance';
    case 'football':
      return 'duration';
    default:
      return 'reps';
  }
}

export const MAX_EXERCISES = 60;
export const MAX_SETS_PER_EXERCISE = 40;
export const MAX_EXERCISE_NAME = 120;

/** A blank set carrying a target, for a template being copied onto a session. */
export function plannedSet(target: Partial<SetEntry>): SetEntry {
  return {
    targetReps: target.targetReps ?? null,
    targetWeightKg: target.targetWeightKg ?? null,
    targetDurationSec: target.targetDurationSec ?? null,
    targetDistanceM: target.targetDistanceM ?? null,
    actualReps: null,
    actualWeightKg: null,
    actualDurationSec: null,
    actualDistanceM: null,
    done: false,
  };
}

/**
 * True when a set carries anything the member actually did.
 *
 * Used to decide whether a session has content worth protecting from a program
 * apply (FR-008: logged sessions are never overwritten). It reads the `actual*`
 * fields and `done`, never the targets — a session full of targets and no
 * actuals is a *plan*, and replacing a plan is exactly what applying a program
 * is for.
 */
export function isLogged(set: SetEntry): boolean {
  return (
    set.done ||
    set.actualReps !== null && set.actualReps !== undefined ||
    set.actualWeightKg !== null && set.actualWeightKg !== undefined ||
    set.actualDurationSec !== null && set.actualDurationSec !== undefined ||
    set.actualDistanceM !== null && set.actualDistanceM !== undefined
  );
}

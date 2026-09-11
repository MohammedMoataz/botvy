import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';
import {
  isLogged,
  MAX_EXERCISES,
  MAX_EXERCISE_NAME,
  MAX_SETS_PER_EXERCISE,
  type Exercise,
  type SetEntry,
} from './set-entry.js';

/**
 * `planned → completed | cancelled | skipped`.
 *
 * **Four statuses, and "missed" is deliberately not the fifth.** See
 * `isMissed` — it is a reading of the clock, not an outcome anybody records.
 */
export type SessionStatus = 'planned' | 'completed' | 'cancelled' | 'skipped';

export interface SessionState {
  id: string;
  userId: string;
  plannedAt: Date;
  durationMin: number;
  sport: string;
  title: string;
  focus: string | null;
  /** Which program filled this, and which of its weeks. Null for a bare slot. */
  programId: string | null;
  weekIndex: number | null;
  /** Which slot produced it. Null for a session the member made by hand. */
  slotId: string | null;
  /**
   * Carried from the first task and written by nothing in this phase.
   *
   * P7 accepts a suggestion and fills or creates a session from it. The field is
   * here now so that phase needs no migration; the *handler* is built there,
   * beside the event that feeds it, rather than here where it would be a
   * consumer with no producer.
   */
  suggestionId: string | null;
  exercises: Exercise[];
  status: SessionStatus;
  completedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export const MAX_TITLE = 200;
export const MAX_FOCUS = 200;
export const MAX_NOTES = 20_000;
export const MAX_SESSION_MIN = 360;

export class SessionRuleError extends Error {
  constructor(
    readonly code:
      | 'title_required'
      | 'sport_required'
      | 'bad_duration'
      | 'too_many_exercises'
      | 'too_many_sets'
      | 'unknown_exercise'
      | 'not_deleted',
    message: string,
  ) {
    super(message);
    this.name = 'SessionRuleError';
  }
}

/** What a caller may change about a session. */
export interface SessionPatch {
  plannedAt?: Date;
  durationMin?: number;
  sport?: string;
  title?: string;
  focus?: string | null;
  notes?: string | null;
  exercises?: Exercise[];
}

/**
 * One practice, planned or done.
 *
 * ## Sessions are rows, not a projection of the timetable
 *
 * The plan's complexity table argues this and it is worth restating here,
 * because "derive the week from the slots on read" is the first idea anybody
 * has: a derived session has no id, so nothing can be reminded about it, the
 * phone cannot log it offline, and the rhythm has nothing to name in tomorrow's
 * proposal. So sessions are materialised ahead — and the cost of that choice is
 * the reconcile in the saga, which is where the "future only, never the past"
 * rules live.
 *
 * ## Its id says where it came from
 *
 * A slot's session has a **derived** id — `uuidv5(userId:slotId:localDate)` —
 * so creating it is an upsert and a redelivered event writes nothing. A session
 * the member makes by hand has a client-minted UUIDv7 and no `slotId`, which is
 * also what keeps the reconcile away from it. `slot-calendar.ts` has the full
 * argument.
 */
export class Session extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  plannedAt: Date;
  durationMin: number;
  sport: string;
  title: string;
  focus: string | null;
  programId: string | null;
  weekIndex: number | null;
  readonly slotId: string | null;
  suggestionId: string | null;
  exercises: Exercise[];
  status: SessionStatus;
  completedAt: Date | null;
  notes: string | null;
  readonly createdAt: Date;
  deletedAt: Date | null;

  private constructor(state: SessionState) {
    super();
    this.id = state.id;
    this.userId = state.userId;
    this.plannedAt = state.plannedAt;
    this.durationMin = state.durationMin;
    this.sport = state.sport;
    this.title = state.title;
    this.focus = state.focus;
    this.programId = state.programId;
    this.weekIndex = state.weekIndex;
    this.slotId = state.slotId;
    this.suggestionId = state.suggestionId;
    this.exercises = state.exercises;
    this.status = state.status;
    this.completedAt = state.completedAt;
    this.notes = state.notes;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
    this.deletedAt = state.deletedAt;
  }

  static rehydrate(state: SessionState): Session {
    return new Session(state);
  }

  /**
   * A new planned session, from a slot or from the member.
   *
   * **Every creation announces itself**, and that is the only announcement
   * there is: `training.SessionScheduled` is what the alert pipeline, the
   * rhythm's tomorrow draft and P7's suggestion saga all hang off. A session
   * that appears without one is a session nobody is reminded about — which is
   * the shape of a defect this codebase has shipped before, in P2, where a
   * whole notification pipeline was dead for a phase.
   */
  static plan(
    state: Omit<
      SessionState,
      'updatedAt' | 'deletedAt' | 'completedAt' | 'status'
    >,
  ): Session {
    const session = new Session({
      ...state,
      title: requireTitle(state.title),
      sport: requireSport(state.sport),
      durationMin: requireDuration(state.durationMin),
      focus: truncate(state.focus, MAX_FOCUS),
      notes: truncate(state.notes, MAX_NOTES),
      exercises: validatedExercises(state.exercises),
      status: 'planned',
      completedAt: null,
      deletedAt: null,
      updatedAt: state.createdAt,
    });
    session.announceScheduled(state.createdAt);
    return session;
  }

  /**
   * A patch, and a reschedule event when the moment or the wording moved.
   *
   * `SessionRescheduled` rather than a second `SessionScheduled`, because the
   * alert saga reconciles on either and the *catalogue* should say which
   * happened — and because `SessionScheduled` has three other subscribers that
   * have no business hearing about an edited note.
   */
  edit(patch: SessionPatch, at: Date = new Date()): string[] {
    const changed: string[] = [];

    if (patch.title !== undefined) {
      const title = requireTitle(patch.title);
      if (title !== this.title) {
        this.title = title;
        changed.push('title');
      }
    }
    if (patch.sport !== undefined) {
      const sport = requireSport(patch.sport);
      if (sport !== this.sport) {
        this.sport = sport;
        changed.push('sport');
      }
    }
    if (patch.plannedAt !== undefined && patch.plannedAt.getTime() !== this.plannedAt.getTime()) {
      this.plannedAt = patch.plannedAt;
      changed.push('plannedAt');
    }
    if (patch.durationMin !== undefined) {
      const durationMin = requireDuration(patch.durationMin);
      if (durationMin !== this.durationMin) {
        this.durationMin = durationMin;
        changed.push('durationMin');
      }
    }
    if (patch.focus !== undefined) {
      const focus = truncate(patch.focus, MAX_FOCUS);
      if (focus !== this.focus) {
        this.focus = focus;
        changed.push('focus');
      }
    }
    if (patch.notes !== undefined) {
      const notes = truncate(patch.notes, MAX_NOTES);
      if (notes !== this.notes) {
        this.notes = notes;
        changed.push('notes');
      }
    }
    if (patch.exercises !== undefined) {
      this.exercises = validatedExercises(patch.exercises);
      changed.push('exercises');
    }

    if (changed.length === 0) return changed;
    this.updatedAt = at;
    if (changed.some((field) => ALERT_FIELDS.has(field))) {
      this.raise(
        'training.SessionRescheduled',
        'session',
        this.alertFacts(),
        at,
      );
    }
    return changed;
  }

  /**
   * What the member actually did.
   *
   * Sets are replaced wholesale for the exercise named, because the logger
   * writes the whole exercise back — a member adds a fourth set, or deletes the
   * one they mistyped, and a per-set patch protocol would need its own
   * vocabulary for both. `actual*` is written and `target*` is left alone, so a
   * logged session shows what was done beside what was planned (FR-004).
   *
   * Logging does **not** complete the session. A member part way through
   * has logged sets and a `planned` status, which is exactly the state the
   * session screen needs to render; completing is a separate statement and the
   * member makes it. Inferring it from "all sets done" would complete a session
   * the moment somebody ticked the last box, before they had written the note.
   */
  log(exerciseId: string, sets: SetEntry[], at: Date = new Date()): void {
    const exercise = this.exercises.find((entry) => entry.id === exerciseId);
    if (!exercise) {
      throw new SessionRuleError(
        'unknown_exercise',
        `This session has no exercise ${exerciseId}.`,
      );
    }
    if (sets.length > MAX_SETS_PER_EXERCISE) {
      throw new SessionRuleError(
        'too_many_sets',
        `At most ${MAX_SETS_PER_EXERCISE} sets in one exercise.`,
      );
    }
    exercise.sets = sets.map((set) => ({ ...set }));
    this.updatedAt = at;
    this.raise(
      'training.SessionLogged',
      'session',
      { sessionId: this.id, exerciseId, sets: exercise.sets.length },
      at,
    );
  }

  /** Done. Clears any pending reminder (FR-014). */
  complete(at: Date = new Date()): void {
    this.status = 'completed';
    this.completedAt = at;
    this.updatedAt = at;
    this.raise(
      'training.SessionCompleted',
      'session',
      { sessionId: this.id, at, sport: this.sport },
      at,
    );
  }

  /** Not happening. Distinct from skipped, and from deleted. */
  cancel(at: Date = new Date()): void {
    this.status = 'cancelled';
    this.completedAt = null;
    this.updatedAt = at;
    this.raise(
      'training.SessionCancelled',
      'session',
      { sessionId: this.id, at },
      at,
    );
  }

  /**
   * "Not this one", and **the row stays** (FR-005, story 3 scenario 3).
   *
   * That is the whole point of skipped being its own status rather than a
   * delete: the week is an honest record, so a member who looks back sees the
   * session they did not do sitting where it was. Deleting it would make a
   * skipped week and a quiet week look identical.
   */
  skip(at: Date = new Date()): void {
    this.status = 'skipped';
    this.completedAt = null;
    this.updatedAt = at;
    this.raise(
      'training.SessionSkipped',
      'session',
      { sessionId: this.id, at },
      at,
    );
  }

  /** Back to planned, for a member who ticked the wrong thing. */
  reopen(at: Date = new Date()): void {
    this.status = 'planned';
    this.completedAt = null;
    this.updatedAt = at;
    this.announceScheduled(at);
  }

  /**
   * Removed from view, and **nothing else** — the status is untouched.
   *
   * The third context to say this, and it is the same rule: the status is the
   * only record of whether the session happened, was called off or was skipped,
   * and the Deleted view exists to show which.
   */
  tombstone(at: Date = new Date()): void {
    this.deletedAt = at;
    this.updatedAt = at;
    this.raise(
      'training.SessionDeleted',
      'session',
      { sessionId: this.id, at },
      at,
    );
  }

  restore(at: Date = new Date()): void {
    this.deletedAt = null;
    this.updatedAt = at;
    this.announceScheduled(at);
  }

  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  assertPurgeable(): void {
    if (!this.isDeleted) {
      throw new SessionRuleError(
        'not_deleted',
        'Only a deleted session can be erased.',
      );
    }
  }

  /**
   * A member's saved workout, dropped in (FR-009, story 5).
   *
   * Replaces the exercises rather than appending, because that is what the
   * member means by applying a workout to an *empty* session — and the editor
   * only offers it when there is nothing to lose. The exercises are copies with
   * fresh ids, so editing the session afterwards cannot rewrite the library
   * entry: story 5's scenario says they stay editable, and it would be a poor
   * surprise if editing them changed every other session built from the same
   * workout.
   */
  /**
   * A program's week, applied to a session that already exists (FR-008).
   *
   * ## Why this method has to exist at all
   *
   * The materialiser used to fill a session **only at the moment it created
   * it** — its loop skipped every occurrence it already held. So applying a
   * program over a fortnight that was already populated warned the member that
   * it would replace five planned sessions, took their `force`, and then
   * replaced nothing: the five sessions kept the slot's bare title and no
   * exercises, and only the days the horizon had not yet reached ever carried
   * the plan. FR-008's first sentence is that applying a program *fills
   * upcoming slot sessions*, and the warning exists because it replaces
   * content — a warning about a replacement that does not happen is worse than
   * no warning, because the member agreed to it and believes it happened.
   *
   * ## The caller checks `isUntouched`; this method does not
   *
   * Deliberate asymmetry, and the reason is that the caller has already had to
   * ask. `ApplyProgramHandler.gather` filters `wouldReplace` by `isUntouched`
   * and the materialiser filters by the same predicate before calling this, so
   * a guard here would be a third copy of one rule — and the one place it
   * matters is that the list the member is shown and the set of sessions
   * actually rewritten are computed from the same predicate. A throw here
   * would turn a disagreement between those two into a failed nightly pass
   * rather than the visible bug it should be.
   *
   * ## It announces, because the title is the alert
   *
   * A slot session is titled with the slot's sport until a program renames it;
   * the reminder's label is built from the title. `SessionRescheduled` is
   * therefore raised on every fill even though the instant has not moved —
   * without it, the member gets a plan called "Week 2 session" on screen and a
   * notification that says "gym". The alert saga reconciles rather than
   * appends, so an event for a fill that changed nothing but the exercises
   * costs one outbox row and settles on the state it was already in.
   */
  fillFromProgram(
    filling: {
      title: string;
      focus: string | null;
      programId: string;
      weekIndex: number;
      exercises: Exercise[];
    },
    at: Date = new Date(),
  ): void {
    this.title = requireTitle(filling.title);
    this.focus = truncate(filling.focus, MAX_FOCUS);
    this.programId = filling.programId;
    this.weekIndex = filling.weekIndex;
    this.exercises = validatedExercises(filling.exercises);
    this.updatedAt = at;
    this.raise(
      'training.SessionRescheduled',
      'session',
      this.alertFacts(),
      at,
    );
  }

  applyWorkout(
    exercises: Exercise[],
    nextId: () => string,
    at: Date = new Date(),
  ): void {
    this.exercises = validatedExercises(
      exercises.map((exercise) => ({
        ...exercise,
        id: nextId(),
        sets: exercise.sets.map((set) => ({ ...set })),
        mediaRefs: exercise.mediaRefs.map((ref) => ({ ...ref })),
      })),
    );
    this.updatedAt = at;
  }

  /**
   * The window a program apply may fill, and the one it may not.
   *
   * True when nothing in this session records what the member *did*. A session
   * full of targets is a plan, and replacing a plan is what applying a program
   * is for; a session with one actual rep in it is a record, and FR-008 says
   * those are never overwritten. `isLogged` reads the `actual*` fields and
   * `done` and never the targets, which is the distinction.
   *
   * Notes count. A member who wrote "shoulder hurt, stopped early" and logged
   * nothing has recorded the session as surely as one who typed numbers.
   */
  get isUntouched(): boolean {
    if (this.status !== 'planned') return false;
    if (this.notes !== null && this.notes.trim() !== '') return false;
    return !this.exercises.some((exercise) => exercise.sets.some(isLogged));
  }

  /**
   * True when this session's moment has passed with nothing recorded.
   *
   * ## Why this is a question and not a status
   *
   * "Missed" is a reading of the clock. Storing it would mean a sweep that
   * rewrites rows the member never touched — and then *un*-writes them when
   * they log the session late, which FR-018 explicitly allows. So nothing ever
   * writes it: the card, the week view and Today all ask the session, and they
   * therefore cannot disagree.
   *
   * It is `planned` and finished, not `planned` and started: a session under
   * way is not missed, which is why the duration is in the comparison. The
   * spec's last edge case depends on it — a cut-off that falls before a session
   * still to happen today leaves that session today's, not skipped over.
   *
   * `now` is passed in rather than read, so a fixture can put the clock
   * anywhere; the zone is taken for symmetry with the rest of this context even
   * though the comparison is between two instants, because a caller that has a
   * zone in hand and no use for it is a caller about to be given one.
   */
  isMissed(now: Date, _timezone: string): boolean {
    if (this.status !== 'planned' || this.isDeleted) return false;
    const endsAt = this.plannedAt.getTime() + this.durationMin * 60_000;
    return endsAt < now.getTime();
  }

  /** The local date this session belongs to, for grouping a week. */
  localDateIn(timezone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(this.plannedAt);
  }

  private announceScheduled(at: Date): void {
    this.raise(
      'training.SessionScheduled',
      'session',
      this.alertFacts(),
      at,
    );
  }

  /**
   * Everything a consumer of a scheduling event reads, in one place.
   *
   * One builder called from all three raise sites, for the reason Planning's
   * and Meetings' both carry: a payload built inline is a payload that can omit
   * a field the consumer reads, and the type system cannot say so because a
   * domain event's payload is `unknown` by the time it arrives. P2 shipped task
   * events without a `title` and *every task notification in the product said
   * "Task due"*.
   */
  private alertFacts(): {
    sessionId: string;
    plannedAt: Date;
    durationMin: number;
    sport: string;
    title: string;
    focus: string | null;
    status: SessionStatus;
  } {
    return {
      sessionId: this.id,
      plannedAt: this.plannedAt,
      durationMin: this.durationMin,
      sport: this.sport,
      title: this.title,
      focus: this.focus,
      status: this.status,
    };
  }
}

/** The fields an alert is built from; a change to one makes the reminder wrong. */
const ALERT_FIELDS = new Set(['title', 'plannedAt', 'durationMin', 'sport']);

// ------------------------------------------------------------------- guards

function requireTitle(raw: string): string {
  const title = raw.trim().slice(0, MAX_TITLE);
  if (title === '') {
    throw new SessionRuleError('title_required', 'A session needs a title.');
  }
  return title;
}

function requireSport(raw: string): string {
  const sport = raw.trim().slice(0, 40);
  if (sport === '') {
    throw new SessionRuleError('sport_required', 'A session needs a sport.');
  }
  return sport;
}

function requireDuration(durationMin: number): number {
  if (
    !Number.isInteger(durationMin) ||
    durationMin < 1 ||
    durationMin > MAX_SESSION_MIN
  ) {
    throw new SessionRuleError(
      'bad_duration',
      `A session lasts between 1 and ${MAX_SESSION_MIN} minutes.`,
    );
  }
  return durationMin;
}

function validatedExercises(exercises: Exercise[]): Exercise[] {
  const list = exercises ?? [];
  if (list.length > MAX_EXERCISES) {
    throw new SessionRuleError(
      'too_many_exercises',
      `At most ${MAX_EXERCISES} exercises in one session.`,
    );
  }
  return list.map((exercise) => {
    if (exercise.sets.length > MAX_SETS_PER_EXERCISE) {
      throw new SessionRuleError(
        'too_many_sets',
        `At most ${MAX_SETS_PER_EXERCISE} sets in one exercise.`,
      );
    }
    return {
      id: exercise.id,
      name: exercise.name.trim().slice(0, MAX_EXERCISE_NAME),
      notes: truncate(exercise.notes, 4_000),
      mediaRefs: (exercise.mediaRefs ?? []).map((ref) => ({ ...ref })),
      sets: exercise.sets.map((set) => ({ ...set })),
    };
  });
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.slice(0, max);
  return trimmed === '' ? null : trimmed;
}

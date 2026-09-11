import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';
import type { Exercise, MediaRef, SetEntry } from './set-entry.js';

/** Where a program came from. `suggestion` and `link` arrive with P7. */
export type ProgramSource = 'user' | 'suggestion' | 'link';

export type ProgramStatus = 'active' | 'archived';

/**
 * One session as a program describes it — a template, not a session.
 *
 * `weekday` is 1..7 or **null**, and the null is what makes a program portable:
 * a template with no weekday fills whichever slot comes next in order, so the
 * same four-week plan works for a member who trains Monday/Wednesday/Friday and
 * one who trains Tuesday/Thursday/Saturday. A template *with* a weekday is a
 * program written for a specific week shape and only fills that day.
 */
export interface SessionTemplate {
  templateId: string;
  weekday: number | null;
  title: string;
  focus: string | null;
  exercises: TemplateExercise[];
}

/**
 * An exercise in a template: targets only, no actuals.
 *
 * A separate type from `Exercise` because a template has nothing to record —
 * `actual*` on a template would be a field that can only ever be null, and a
 * field that can only be null is a field somebody will one day fill.
 */
export interface TemplateExercise {
  name: string;
  notes: string | null;
  mediaRefs: MediaRef[];
  sets: Array<
    Pick<
      SetEntry,
      | 'targetReps'
      | 'targetWeightKg'
      | 'targetDurationSec'
      | 'targetDistanceM'
    >
  >;
}

export interface ProgramWeek {
  index: number;
  sessions: SessionTemplate[];
}

export interface ProgramState {
  id: string;
  userId: string;
  title: string;
  sport: string;
  source: ProgramSource;
  /** Which saved links it came from. Written by nothing until P7. */
  sourceLinkIds: string[];
  weeks: ProgramWeek[];
  status: ProgramStatus;
  /**
   * The member's local date the program was applied from, or null.
   *
   * The field the blueprint's shape does not carry and this phase adds, because
   * FR-008's second half is impossible without it: a program longer than the
   * materialisation horizon has its later weeks filled *as the horizon reaches
   * them*, which means computing a week index days or weeks after the apply.
   * The apply leaves the date behind and the saga reads it.
   *
   * Additive, so nothing migrates: an existing row has null and is simply not
   * consulted, which is the same as not having been applied.
   *
   * **Archiving does not clear it.** Archiving stops the saga *consulting* the
   * program; clearing the date would additionally make re-activating it fill
   * from the wrong week, and the member never said to forget when they started.
   */
  appliedStartDate: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export const MAX_PROGRAM_TITLE = 200;
export const MAX_WEEKS = 52;
export const MAX_TEMPLATES_PER_WEEK = 14;

export class ProgramRuleError extends Error {
  constructor(
    readonly code:
      | 'title_required'
      | 'sport_required'
      | 'no_weeks'
      | 'too_many_weeks'
      | 'bad_week_index'
      | 'bad_weekday'
      | 'not_active'
      | 'not_deleted',
    message: string,
  ) {
    super(message);
    this.name = 'ProgramRuleError';
  }
}

/**
 * A structured plan: weeks of session templates, applied onto the member's own
 * slots.
 *
 * ## What applying does, and what it deliberately does not do
 *
 * Applying records a start date and raises an event. It does **not** write
 * sessions — the materialiser does, on the way past, because that is the only
 * design in which a program longer than the horizon lands in full (FR-008).
 * Writing sessions at apply time would fill the fortnight it can see and
 * silently drop week four; filling as the horizon advances means week four
 * arrives on the day the horizon reaches it.
 *
 * That is also why `appliedStartDate` is stored rather than the week indices
 * being resolved once: the arithmetic has to be redone later, from a date.
 *
 * ## Archiving stops the filling and rewrites nothing
 *
 * Story 4 scenario 4, and it was one of the six questions the analysis left
 * open. Archiving means "stop putting this into my weeks"; it does not mean
 * "take it out of the weeks I can already see". Deleting content a member has
 * looked at — and may have edited — is worse than leaving it, and there is a
 * path that replaces content on purpose: applying another program, which warns
 * first.
 */
export class Program extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  title: string;
  sport: string;
  readonly source: ProgramSource;
  sourceLinkIds: string[];
  weeks: ProgramWeek[];
  status: ProgramStatus;
  appliedStartDate: string | null;
  readonly createdAt: Date;
  deletedAt: Date | null;

  private constructor(state: ProgramState) {
    super();
    this.id = state.id;
    this.userId = state.userId;
    this.title = state.title;
    this.sport = state.sport;
    this.source = state.source;
    this.sourceLinkIds = state.sourceLinkIds;
    this.weeks = state.weeks;
    this.status = state.status;
    this.appliedStartDate = state.appliedStartDate;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
    this.deletedAt = state.deletedAt;
  }

  static rehydrate(state: ProgramState): Program {
    return new Program(state);
  }

  static create(
    state: Omit<
      ProgramState,
      'updatedAt' | 'deletedAt' | 'status' | 'appliedStartDate'
    >,
  ): Program {
    const program = new Program({
      ...state,
      title: requireTitle(state.title),
      sport: requireSport(state.sport),
      weeks: validatedWeeks(state.weeks),
      status: 'active',
      appliedStartDate: null,
      deletedAt: null,
      updatedAt: state.createdAt,
    });
    program.raise(
      'training.ProgramCreated',
      'program',
      { programId: program.id, title: program.title, weeks: program.weeks.length },
      state.createdAt,
    );
    return program;
  }

  edit(
    patch: { title?: string; sport?: string; weeks?: ProgramWeek[] },
    at: Date = new Date(),
  ): string[] {
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
    if (patch.weeks !== undefined) {
      this.weeks = validatedWeeks(patch.weeks);
      changed.push('weeks');
    }
    if (changed.length === 0) return changed;
    this.updatedAt = at;
    return changed;
  }

  /**
   * Record the date this program's week one begins on.
   *
   * The command decides *whether* to apply — it is the one that gathers the
   * `wouldReplace` list and refuses without `force` — and this records the
   * decision. The event is what the materialiser reacts to.
   *
   * An archived program is refused: re-applying it is a decision to make it
   * active again, and doing that silently would leave the member with a program
   * in their archive that is filling their weeks.
   */
  applyFrom(startDate: string, at: Date = new Date()): void {
    if (this.status !== 'active') {
      throw new ProgramRuleError(
        'not_active',
        'This program is archived. Make it active before applying it.',
      );
    }
    this.appliedStartDate = startDate;
    this.updatedAt = at;
    this.raise(
      'training.ProgramApplied',
      'program',
      {
        programId: this.id,
        title: this.title,
        startDate,
        weeks: this.weeks.length,
      },
      at,
    );
  }

  /** Stop filling new sessions. Leaves the ones already filled alone. */
  archive(at: Date = new Date()): void {
    this.status = 'archived';
    this.updatedAt = at;
    this.raise(
      'training.ProgramArchived',
      'program',
      { programId: this.id },
      at,
    );
  }

  /** Make it fillable again, from the date it was originally applied. */
  activate(at: Date = new Date()): void {
    this.status = 'active';
    this.updatedAt = at;
  }

  tombstone(at: Date = new Date()): void {
    this.deletedAt = at;
    this.updatedAt = at;
    this.raise(
      'training.ProgramDeleted',
      'program',
      { programId: this.id },
      at,
    );
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
      throw new ProgramRuleError(
        'not_deleted',
        'Only a deleted program can be erased.',
      );
    }
  }

  /** True when the materialiser should consult it: active, live, and applied. */
  get isFilling(): boolean {
    return (
      this.status === 'active' &&
      !this.isDeleted &&
      this.appliedStartDate !== null
    );
  }

  /**
   * The template for one week and one weekday, or null.
   *
   * Two matching rules, tried in order, and the order is the point: a template
   * that names a weekday is a program written for a particular week shape and
   * wins for that day; a template with no weekday fills by *position*, so the
   * nth session of the member's week gets the nth template. `slotOrdinal` is
   * that position — the caller knows how the member's week is ordered and this
   * does not.
   *
   * Returns null when the program has no such week, which is how a program
   * shorter than the weeks remaining simply ends (the spec's edge case) — the
   * slots continue, empty, until another is applied.
   */
  templateFor(
    weekIndex: number,
    weekday: number,
    slotOrdinal: number,
  ): SessionTemplate | null {
    const week = this.weeks.find((entry) => entry.index === weekIndex);
    if (!week) return null;

    const byWeekday = week.sessions.find(
      (session) => session.weekday === weekday,
    );
    if (byWeekday) return byWeekday;

    const floating = week.sessions.filter((session) => session.weekday === null);
    return floating[slotOrdinal] ?? null;
  }

  /** A template's exercises as a session's, with ids the caller mints. */
  static exercisesFrom(
    template: SessionTemplate,
    nextId: () => string,
  ): Exercise[] {
    return template.exercises.map((exercise) => ({
      id: nextId(),
      name: exercise.name,
      notes: exercise.notes,
      mediaRefs: exercise.mediaRefs.map((ref) => ({ ...ref })),
      sets: exercise.sets.map((set) => ({
        targetReps: set.targetReps ?? null,
        targetWeightKg: set.targetWeightKg ?? null,
        targetDurationSec: set.targetDurationSec ?? null,
        targetDistanceM: set.targetDistanceM ?? null,
        actualReps: null,
        actualWeightKg: null,
        actualDurationSec: null,
        actualDistanceM: null,
        done: false,
      })),
    }));
  }
}

// ------------------------------------------------------------------- guards

function requireTitle(raw: string): string {
  const title = raw.trim().slice(0, MAX_PROGRAM_TITLE);
  if (title === '') {
    throw new ProgramRuleError('title_required', 'A program needs a title.');
  }
  return title;
}

function requireSport(raw: string): string {
  const sport = raw.trim().slice(0, 40);
  if (sport === '') {
    throw new ProgramRuleError('sport_required', 'A program needs a sport.');
  }
  return sport;
}

function validatedWeeks(weeks: ProgramWeek[]): ProgramWeek[] {
  const list = weeks ?? [];
  if (list.length === 0) {
    throw new ProgramRuleError('no_weeks', 'A program needs at least one week.');
  }
  if (list.length > MAX_WEEKS) {
    throw new ProgramRuleError(
      'too_many_weeks',
      `At most ${MAX_WEEKS} weeks in one program.`,
    );
  }

  return list.map((week) => {
    if (!Number.isInteger(week.index) || week.index < 0) {
      throw new ProgramRuleError(
        'bad_week_index',
        'A week index counts from 0.',
      );
    }
    if (week.sessions.length > MAX_TEMPLATES_PER_WEEK) {
      throw new ProgramRuleError(
        'too_many_weeks',
        `At most ${MAX_TEMPLATES_PER_WEEK} sessions in one week.`,
      );
    }
    return {
      index: week.index,
      sessions: week.sessions.map((session) => {
        if (
          session.weekday !== null &&
          (!Number.isInteger(session.weekday) ||
            session.weekday < 1 ||
            session.weekday > 7)
        ) {
          throw new ProgramRuleError(
            'bad_weekday',
            'A template’s day is 1 (Monday) to 7 (Sunday), or none at all.',
          );
        }
        return {
          templateId: session.templateId,
          weekday: session.weekday,
          title: session.title.trim().slice(0, MAX_PROGRAM_TITLE),
          focus: session.focus?.trim().slice(0, 200) || null,
          exercises: (session.exercises ?? []).map((exercise) => ({
            name: exercise.name.trim().slice(0, 120),
            notes: exercise.notes?.slice(0, 4_000) || null,
            mediaRefs: (exercise.mediaRefs ?? []).map((ref) => ({ ...ref })),
            sets: (exercise.sets ?? []).map((set) => ({ ...set })),
          })),
        };
      }),
    };
  });
}

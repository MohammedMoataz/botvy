import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';

/**
 * One set of a suggested exercise — **targets only**.
 *
 * There is no `actual*` here and there never can be: a suggestion is a proposal
 * about a session that has not happened. Training's own `SetEntry` carries both
 * halves because a logged set is the same row as a planned one; copying that
 * shape here would put eight nullable fields into a document where four of them
 * are unreachable, and the first reader to see `actualReps` on a suggestion
 * would reasonably wonder what fills it.
 */
export interface SuggestedSet {
  targetReps: number | null;
  targetWeightKg: number | null;
  targetDurationSec: number | null;
  targetDistanceM: number | null;
}

export interface SuggestedExercise {
  name: string;
  notes: string | null;
  sets: SuggestedSet[];
}

/** What the model proposed the session should contain. */
export interface SuggestionDraft {
  title: string;
  focus: string | null;
  exercises: SuggestedExercise[];
}

export type SuggestionStatus = 'pending' | 'accepted' | 'dismissed';

/** What became of the session an accepted suggestion produced (T734). */
export type SuggestionOutcome = 'completed' | 'cancelled' | 'skipped';

export const MAX_DRAFT_EXERCISES = 12;
export const MAX_DRAFT_SETS = 12;
export const MAX_RATIONALE = 1_000;

export interface SuggestionState {
  id: string;
  userId: string;
  /** Only `session` exists. A field rather than an implication, because the
   * event catalogue and the data model both name it and a second kind (a meal,
   * a reading order) is the obvious next one. */
  kind: 'session';
  /** The member's own local date — principle XI, and the reason it is a string. */
  forDate: string;
  sport: string;
  /** The session this was generated *for*, which the member may not accept into. */
  sessionId: string | null;
  draft: SuggestionDraft;
  sourceLinkIds: string[];
  rationale: string;
  status: SuggestionStatus;
  acceptedSessionId: string | null;
  outcome: SuggestionOutcome | null;
  createdAt: Date;
  updatedAt: Date;
}

export class SuggestionRuleError extends Error {
  constructor(
    readonly code: 'not_pending' | 'empty_draft',
    message: string,
  ) {
    super(message);
    this.name = 'SuggestionRuleError';
  }
}

/**
 * A proposal for one session, drawn from the member's own saved material
 * (FR-009, FR-010).
 *
 * ## It cites, and the citation is not decoration
 *
 * `sourceLinkIds` is what FR-007 and story 3 both turn on: nothing here is
 * Botvy's own claim about training, it is a reading of things the member chose
 * to save. A suggestion with no sources would be the model inventing exercises,
 * which is the one thing story 3 scenario 3 forbids — so `propose` refuses an
 * empty draft and the saga refuses to run with no readings.
 *
 * ## Dismissing is a record, not a delete
 *
 * "The same session is not proposed again" (FR-010) needs a row saying it was
 * refused. A deleted suggestion would be re-generated the next time the session
 * changed and re-raised the event, which is the same member being asked twice
 * about something they already said no to.
 *
 * ## `acceptedSessionId` is known at the moment of acceptance
 *
 * A suggestion is always *about* a session — it is generated from
 * `training.SessionScheduled` and keeps that id in `sessionId` — so accepting
 * it either names a different session the member chose or means "the one it was
 * about". Either way the handler has the id in hand and writes it here.
 *
 * This phase's task list describes a second route: Training creating a session
 * and naming this suggestion on the `SessionScheduled` it raises, with the id
 * correlated back. That route is unreachable as built, because there is no case
 * in which an accepted suggestion has no session to go into — and a correlation
 * path with no caller is a path nothing is testing. What survives from the note
 * is its point: nothing is ever matched on member, date and sport, because that
 * triple would tie a suggestion to any session that happened to land on the
 * same morning.
 */
export class Suggestion extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  readonly kind: 'session';
  readonly forDate: string;
  readonly sport: string;
  readonly sessionId: string | null;
  readonly draft: SuggestionDraft;
  readonly sourceLinkIds: string[];
  readonly rationale: string;
  status: SuggestionStatus;
  acceptedSessionId: string | null;
  outcome: SuggestionOutcome | null;
  readonly createdAt: Date;

  private constructor(state: SuggestionState) {
    super();
    this.id = state.id;
    this.userId = state.userId;
    this.kind = state.kind;
    this.forDate = state.forDate;
    this.sport = state.sport;
    this.sessionId = state.sessionId;
    this.draft = state.draft;
    this.sourceLinkIds = state.sourceLinkIds;
    this.rationale = state.rationale;
    this.status = state.status;
    this.acceptedSessionId = state.acceptedSessionId;
    this.outcome = state.outcome;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
  }

  static rehydrate(state: SuggestionState): Suggestion {
    return new Suggestion(state);
  }

  static propose(
    state: Omit<
      SuggestionState,
      'status' | 'acceptedSessionId' | 'outcome' | 'updatedAt' | 'kind'
    >,
  ): Suggestion {
    const draft = validatedDraft(state.draft);
    const suggestion = new Suggestion({
      ...state,
      kind: 'session',
      draft,
      rationale: state.rationale.trim().slice(0, MAX_RATIONALE),
      status: 'pending',
      acceptedSessionId: null,
      outcome: null,
      updatedAt: state.createdAt,
    });
    suggestion.raise(
      'knowledge.SuggestionReady',
      'suggestion',
      {
        suggestionId: suggestion.id,
        forDate: suggestion.forDate,
        sport: suggestion.sport,
        sessionId: suggestion.sessionId,
      },
      state.createdAt,
    );
    return suggestion;
  }

  /**
   * The member takes it (FR-010).
   *
   * `sessionId` is the session it goes into — the one the member chose, or the
   * one it was suggested for. This context dispatches no Training command and
   * opens no Training collection: it says what happened and Training decides
   * what that means, which is constitution IX's one sanctioned direction.
   *
   * The event carries the **whole draft**, and that is a deliberate widening of
   * `contracts/events.md`, which types it `{ suggestionId, sessionId? }`. Its
   * own consumer column says "Training → fill/create session", and Training
   * cannot fill a session from a payload that does not contain one. A consumer
   * that has to read the producer's collection to act on an event is the
   * boundary violation the event exists to prevent — and a payload missing a
   * field its consumer reads is the defect this codebase shipped in P2, where
   * every task notification said "Task due".
   */
  accept(sessionId: string | null, at: Date = new Date()): void {
    this.requirePending('accepted');
    this.status = 'accepted';
    this.acceptedSessionId = sessionId;
    this.updatedAt = at;
    this.raise(
      'knowledge.SuggestionAccepted',
      'suggestion',
      {
        suggestionId: this.id,
        sessionId,
        forDate: this.forDate,
        sport: this.sport,
        draft: this.draft,
        sourceLinkIds: [...this.sourceLinkIds],
      },
      at,
    );
  }

  dismiss(at: Date = new Date()): void {
    this.requirePending('dismissed');
    this.status = 'dismissed';
    this.updatedAt = at;
    this.raise(
      'knowledge.SuggestionDismissed',
      'suggestion',
      { suggestionId: this.id, sessionId: this.sessionId },
      at,
    );
  }

  /**
   * What became of it (T734).
   *
   * Silent on a repeat and silent on a suggestion that was never accepted,
   * because the caller is an event handler walking every completed session in
   * the installation: most of them have no suggestion behind them, and that is
   * the normal case rather than an error.
   */
  recordOutcome(outcome: SuggestionOutcome, at: Date = new Date()): boolean {
    if (this.status !== 'accepted') return false;
    if (this.outcome === outcome) return false;
    this.outcome = outcome;
    this.updatedAt = at;
    return true;
  }

  private requirePending(action: string): void {
    if (this.status !== 'pending') {
      throw new SuggestionRuleError(
        'not_pending',
        `This suggestion was already ${this.status}; it cannot be ${action}.`,
      );
    }
  }
}

/**
 * A draft the member could actually accept.
 *
 * The model's output is already schema-constrained, so this is not parsing — it
 * is the second half of the rule the constitution states about grammar-bound
 * extraction: *the schema is enforced by the server, and a different backend or
 * an older Ollama may not*. An empty exercise list is refused outright rather
 * than trimmed, because a suggestion with nothing in it is a notification about
 * nothing.
 */
function validatedDraft(draft: SuggestionDraft): SuggestionDraft {
  const exercises = (draft.exercises ?? [])
    .map((exercise) => ({
      name: exercise.name.trim().slice(0, 120),
      notes: exercise.notes?.trim().slice(0, 1_000) || null,
      sets: (exercise.sets ?? []).slice(0, MAX_DRAFT_SETS).map((set) => ({
        targetReps: set.targetReps ?? null,
        targetWeightKg: set.targetWeightKg ?? null,
        targetDurationSec: set.targetDurationSec ?? null,
        targetDistanceM: set.targetDistanceM ?? null,
      })),
    }))
    .filter((exercise) => exercise.name !== '')
    .slice(0, MAX_DRAFT_EXERCISES);

  if (exercises.length === 0) {
    throw new SuggestionRuleError(
      'empty_draft',
      'A suggestion with no exercises is a notification about nothing.',
    );
  }

  const title = draft.title.trim().slice(0, 200);
  return {
    title: title === '' ? 'Suggested session' : title,
    focus: draft.focus?.trim().slice(0, 200) || null,
    exercises,
  };
}

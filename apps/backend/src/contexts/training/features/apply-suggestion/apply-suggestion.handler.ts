import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { Exercise, SetEntry } from '../../domain/set-entry.js';
import { SessionRepository } from '../../domain/training.repositories.js';

/** Mints the ids the suggested exercises get as they land on a session. */
export type ExerciseIdFactory = () => string;

/** What `knowledge.SuggestionAccepted` carries. */
interface AcceptedPayload {
  suggestionId?: string;
  sessionId?: string | null;
  draft?: {
    title?: string;
    focus?: string | null;
    exercises?: Array<{
      name?: string;
      notes?: string | null;
      sets?: Array<Record<string, unknown>>;
    }>;
  };
}

/**
 * A suggestion the member accepted becomes a real session (P7, FR-010).
 *
 * ## Training does this, and Knowledge does not
 *
 * `sessions` is this context's collection and `Session` is this context's
 * aggregate, so filling one is this context's write — reached by *reacting to*
 * Knowledge's event rather than by Knowledge dispatching a command here, which
 * would be the same constitution IX violation wearing a bus. The direction is
 * the one the rhythm and Planning already use for the end-of-day rollover.
 *
 * Nothing in Knowledge imports this class, and nothing here imports Knowledge:
 * the two meet in `relay.module.ts`'s dispatch table, which is where every
 * cross-context reaction in this platform is written down.
 *
 * ## The payload is the whole draft, and it has to be
 *
 * `contracts/events.md` types this event `{ suggestionId, sessionId? }`, and
 * its own consumer column says "Training → fill/create session". Those two
 * cannot both be true: there is no session in `{ suggestionId, sessionId }`,
 * only a pointer to one, and following it would mean this context reading
 * `suggestions`. The event carries the draft instead, and the contract is
 * corrected in the same change — the mirror of P2's `TaskScheduled`, which
 * omitted `title` and made every notification in the product say "Task due".
 *
 * ## It fills and does not create
 *
 * A suggestion is generated *from* a session, so there is always one to fill,
 * and `AcceptSuggestionHandler` defaults to it. A session that has since been
 * deleted is logged and left alone: creating a replacement would mean inventing
 * an hour of the day the member never chose, and principle XI is the rule that
 * hours belong to them.
 */
@Injectable()
export class ApplySuggestionHandler {
  private readonly logger = new Logger(ApplySuggestionHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly sessions: SessionRepository,
    private readonly nextId: ExerciseIdFactory,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const userId = event.userId;
    const payload = event.payload as AcceptedPayload;
    const sessionId = payload.sessionId;
    const draft = payload.draft;

    if (!userId || !payload.suggestionId || !sessionId || !draft) return;

    const session = await this.sessions.findById(userId, sessionId);
    if (!session || session.isDeleted) {
      this.logger.warn(
        `suggestion ${payload.suggestionId} was accepted into session ${sessionId}, which is gone`,
      );
      return;
    }

    // Idempotent on re-delivery: the relay is at-least-once, and a session
    // already carrying this suggestion has already been filled. Without this,
    // a repeat would mint fresh exercise ids and push a delta at every device
    // for a change that was not one.
    if (session.suggestionId === payload.suggestionId) return;

    session.fillFromSuggestion(
      {
        suggestionId: payload.suggestionId,
        title: draft.title ?? 'Suggested session',
        focus: draft.focus ?? null,
        exercises: (draft.exercises ?? []).map((exercise) =>
          this.exerciseFrom(exercise),
        ),
      },
      event.occurredAt,
    );

    await this.uow.run(() => this.sessions.save(session));
    this.logger.log(
      `session ${sessionId} filled from suggestion ${payload.suggestionId}`,
    );
  }

  /**
   * One suggested exercise as one of this context's.
   *
   * The ids are minted **here**, not carried from the suggestion, for the same
   * reason `applyWorkout` mints them: a member editing this session afterwards
   * must not rewrite anything the suggestion holds, and two rows sharing an
   * exercise id is how that happens.
   *
   * Every `actual*` is null because a suggestion is about a session that has
   * not happened. `done` is false for the same reason — the member has not
   * lifted anything yet, and a set arriving ticked would put a session on the
   * record as part-logged the moment it was suggested.
   */
  private exerciseFrom(exercise: {
    name?: string;
    notes?: string | null;
    sets?: Array<Record<string, unknown>>;
  }): Exercise {
    return {
      id: this.nextId(),
      name: exercise.name ?? 'Exercise',
      notes: exercise.notes ?? null,
      mediaRefs: [],
      sets: (exercise.sets ?? []).map(
        (set): SetEntry => ({
          targetReps: asNumber(set.targetReps),
          targetWeightKg: asNumber(set.targetWeightKg),
          targetDurationSec: asNumber(set.targetDurationSec),
          targetDistanceM: asNumber(set.targetDistanceM),
          actualReps: null,
          actualWeightKg: null,
          actualDurationSec: null,
          actualDistanceM: null,
          done: false,
        }),
      ),
    };
  }
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

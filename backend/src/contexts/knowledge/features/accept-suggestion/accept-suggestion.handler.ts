import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { SuggestionRepository } from '../../domain/knowledge.repositories.js';
import type { SuggestionOutcome } from '../../domain/suggestion.aggregate.js';

export class SuggestionNotFound extends Error {
  constructor(id: string) {
    super(`No suggestion ${id}.`);
  }
}

export interface AcceptSuggestionResult {
  id: string;
  /** The session it went into, or null when Training is about to create one. */
  sessionId: string | null;
}

/**
 * The member takes a suggestion (FR-010).
 *
 * ## This context does not touch a session
 *
 * It marks the suggestion accepted and raises
 * `knowledge.SuggestionAccepted` with the draft. **Training** consumes that and
 * fills the named session or creates one — because a handler that dispatched
 * another context's command would be the same constitution IX violation wearing
 * a bus, and one that opened `sessions` would be the plain version of it.
 *
 * That is also why the event carries the whole draft rather than the
 * `{ suggestionId, sessionId? }` the event catalogue types: its own consumer
 * column says "Training → fill/create session", and Training cannot fill a
 * session from a payload with no session in it. A consumer forced to read the
 * producer's collection is the boundary violation the event exists to prevent.
 *
 * ## The session is always known
 *
 * A suggestion is generated from a session and keeps its id, so accepting it
 * either names a different session the member chose or means "the one it was
 * about". `contracts/rest-commands.md` describes this route as
 * "creates/fills a session" and the creating half turns out to be unreachable:
 * there is no case in which an accepted suggestion has nowhere to go. Building
 * it anyway would mean inventing an hour of the day for a session nobody asked
 * to exist, which constitution XII would then call a hard-coded default.
 *
 * So the outcome is a fill, Training's consumer says so, and the contract is
 * corrected in this phase rather than left to promise something no code does.
 */
@Injectable()
export class AcceptSuggestionHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly suggestions: SuggestionRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    sessionId: string | null = null,
    at: Date = new Date(),
  ): Promise<AcceptSuggestionResult> {
    const suggestion = await this.suggestions.findById(userId, id);
    if (!suggestion) throw new SuggestionNotFound(id);

    /*
     * "The session it was suggested for" is the default, and it is the case
     * that actually happens: a suggestion is generated *from* a session, so it
     * always has one. A member who accepts it into a different session names
     * that one instead.
     *
     * Defaulting here rather than in the aggregate, because the aggregate's
     * `accept(null)` is a meaningful statement — "accepted, into nothing in
     * particular" — and it is the shape a second kind of suggestion (a meal, a
     * reading order) would need.
     */
    suggestion.accept(sessionId ?? suggestion.sessionId, at);
    await this.uow.run(() => this.suggestions.save(suggestion));
    return { id: suggestion.id, sessionId: suggestion.acceptedSessionId };
  }
}

/**
 * "Not this one" (FR-010).
 *
 * A row, not a delete, and that is the requirement rather than a preference:
 * "a dismissed suggestion must not return for the same session" needs something
 * that remembers the refusal. A deleted suggestion would be regenerated the next
 * time the session's event was redelivered, and the member would be asked again
 * about a thing they had already answered.
 */
@Injectable()
export class DismissSuggestionHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly suggestions: SuggestionRepository,
  ) {}

  async handle(userId: string, id: string, at: Date = new Date()): Promise<void> {
    const suggestion = await this.suggestions.findById(userId, id);
    if (!suggestion) throw new SuggestionNotFound(id);

    suggestion.dismiss(at);
    await this.uow.run(() => this.suggestions.save(suggestion));
  }
}

/** Which training event says what became of the session (T734). */
const OUTCOMES: Record<string, SuggestionOutcome> = {
  'training.SessionCompleted': 'completed',
  'training.SessionCancelled': 'cancelled',
  'training.SessionSkipped': 'skipped',
};

/**
 * What became of the session an accepted suggestion produced (T734).
 *
 * ## Most of these events are about nothing this context knows
 *
 * Every completed session in the installation reaches here, and almost none of
 * them came from a suggestion. So a miss is the *normal* case and is silent —
 * `byAcceptedSession` returning null is not a warning, it is the answer for
 * every member who has never used this feature.
 *
 * ## Idempotent by comparison
 *
 * The relay is at-least-once. The aggregate returns false when the outcome is
 * already what the event says, so a redelivery writes nothing and raises
 * nothing — which is what keeps a retried delivery from bumping `updatedAt` and
 * pushing a pointless delta at every device.
 *
 * It closes the loop the event catalogue promised in P0 and nothing had used:
 * an accepted suggestion whose session was skipped is the only evidence this
 * product has that a suggestion was a bad one.
 */
@Injectable()
export class RecordSuggestionOutcomeHandler {
  private readonly logger = new Logger(RecordSuggestionOutcomeHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly suggestions: SuggestionRepository,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const outcome = OUTCOMES[event.name];
    const sessionId = (event.payload as { sessionId?: string })?.sessionId;
    if (!outcome || !event.userId || !sessionId) return;

    const suggestion = await this.suggestions.byAcceptedSession(
      event.userId,
      sessionId,
    );
    if (!suggestion) return;
    if (!suggestion.recordOutcome(outcome, event.occurredAt)) return;

    await this.uow.run(() => this.suggestions.save(suggestion));
    this.logger.log(`suggestion ${suggestion.id} was ${outcome}`);
  }
}

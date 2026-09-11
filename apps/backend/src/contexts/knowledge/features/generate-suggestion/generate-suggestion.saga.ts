import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { localDate } from '../../../../shared/time/time.js';
import {
  AiSuggestionsPort,
  KnowledgeTranscriptPort,
  SuggestionDrafterPort,
  type DraftSource,
} from '../../domain/knowledge.ports.js';
import {
  LinkRepository,
  ReadingRepository,
  SuggestionRepository,
} from '../../domain/knowledge.repositories.js';
import { Suggestion } from '../../domain/suggestion.aggregate.js';

/** Mints the suggestion's id. A token so a spec can substitute a counter. */
export type SuggestionIdFactory = () => string;

/**
 * How close is too close to change.
 *
 * FR-009 says "a session at least a day away"; this is that sentence as a
 * number. A suggestion about this evening's session is a suggestion the member
 * has no time to act on — they have already packed their bag — and a
 * notification about it is an interruption rather than a help.
 */
const MIN_LEAD_MS = 24 * 60 * 60 * 1000;

/** At most five readings go into the prompt. Beyond that nothing fits. */
const MAX_SOURCES = 5;

/** A focus word shorter than this is a preposition, not a subject. */
const MIN_TAG_WORD = 4;

export interface SuggestionOutcomeSummary {
  generated: boolean;
  reason:
    | 'created'
    | 'disabled'
    | 'too_soon'
    | 'already_proposed'
    | 'no_sources'
    | 'no_draft'
    | 'from_suggestion'
    | 'not_a_session';
}

/**
 * A session draft from the member's own reading (FR-009, FR-010, SC-003).
 *
 * ## The preference is checked before anything is read
 *
 * SC-003 is "zero suggestions for members who have turned them off, **and no
 * background work runs for them**", and the second half is what decides the
 * order of this method. The `aiSuggestions` check comes before the first
 * repository call, so a member who turned it off costs one preference read and
 * nothing else — and the spec asserts the link repository was never touched,
 * which is a claim about work rather than about output.
 *
 * ## A session that came *from* a suggestion produces none
 *
 * `training.SessionScheduled` carries `suggestionId` when the session was
 * filled from an accepted draft — the field the event catalogue promised in P0
 * and which P7 is the first phase to write. The saga stops there: suggesting
 * over a session that *is* a suggestion would ask the member about their own
 * answer.
 *
 * ## Nothing is invented
 *
 * No matching readings means no suggestion — story 3 scenario 3 in as many
 * words — and an empty draft from the model means the same. The one thing this
 * saga will not do is propose a session out of its own head, because the whole
 * claim the feature makes to the member is *this came from what you saved*.
 */
@Injectable()
export class GenerateSuggestionSaga {
  private readonly logger = new Logger(GenerateSuggestionSaga.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly links: LinkRepository,
    private readonly readings: ReadingRepository,
    private readonly suggestions: SuggestionRepository,
    private readonly preference: AiSuggestionsPort,
    private readonly drafter: SuggestionDrafterPort,
    private readonly transcript: KnowledgeTranscriptPort,
    private readonly member: MemberContextPort,
    private readonly nextId: SuggestionIdFactory,
  ) {}

  /** `training.SessionScheduled`. */
  async onSessionScheduled(
    event: DomainEvent,
    now: Date = new Date(),
  ): Promise<SuggestionOutcomeSummary> {
    const userId = event.userId;
    const payload = event.payload as {
      sessionId?: string;
      plannedAt?: string | Date;
      durationMin?: number;
      sport?: string;
      focus?: string | null;
      status?: string;
      suggestionId?: string | null;
    };

    if (!userId || !payload.sessionId || !payload.sport) {
      return { generated: false, reason: 'not_a_session' };
    }
    // Only a session still to happen. A completed or cancelled one reaching
    // here is a redelivered event about a past moment.
    if (payload.status && payload.status !== 'planned') {
      return { generated: false, reason: 'not_a_session' };
    }

    // A session Training filled from an accepted suggestion carries its id.
    // Suggesting over it would ask the member about their own answer.
    if (payload.suggestionId) {
      return { generated: false, reason: 'from_suggestion' };
    }

    const plannedAt = asDate(payload.plannedAt);
    if (!plannedAt || plannedAt.getTime() - now.getTime() < MIN_LEAD_MS) {
      return { generated: false, reason: 'too_soon' };
    }

    if (!(await this.preference.enabledFor(userId))) {
      return { generated: false, reason: 'disabled' };
    }

    const already = await this.suggestions.forSession(userId, payload.sessionId);
    // Whatever became of it. A dismissed suggestion is exactly what FR-010's
    // "not proposed again for the same session" is about, and that is the whole
    // reason a dismissal is a row rather than a delete.
    if (already) return { generated: false, reason: 'already_proposed' };

    const sources = await this.gather(userId, payload.sport, payload.focus ?? null);
    if (sources.length === 0) return { generated: false, reason: 'no_sources' };

    const { timezone } = await this.member.clock(userId);
    const forDate = localDate(plannedAt, timezone);

    const attempt = await this.drafter.draft({
      sport: payload.sport,
      focus: payload.focus ?? null,
      forDate,
      durationMin: payload.durationMin ?? null,
      sources: sources.map((source) => source.forPrompt),
    });

    if (!attempt.draft) {
      /*
       * The constitution's plain-reply exit, and the decision this phase's plan
       * states rather than inherits.
       *
       * A half-parsed draft must never become exercises the member can accept,
       * so nothing structured is stored. But the model did say something, and
       * the only honest home for a plain reply about the member's own training
       * material is the coach chat — which is also where a *successful*
       * suggestion is announced, so the member finds both in the same place.
       *
       * `plainReply` is null when the model decoded perfectly well and said
       * there was nothing to suggest. Nothing is delivered then, because
       * nothing happened that the member needs to know about.
       */
      if (attempt.plainReply) {
        await this.transcript.append({
          userId,
          content: `${attempt.plainReply}\n\n— from ${sources
            .map((source) => source.title)
            .join(', ')}`,
          at: now,
        });
      }
      return { generated: false, reason: 'no_draft' };
    }

    const suggestion = Suggestion.propose({
      id: this.nextId(),
      userId,
      forDate,
      sport: payload.sport,
      sessionId: payload.sessionId,
      draft: attempt.draft,
      /*
       * The links the *saga* selected, never the ones the model named.
       *
       * The prompt shows each source's id so the rationale can cite it, and a
       * model that invented an id would otherwise put a citation on somebody
       * else's reading — or on nothing. The citation is a fact about what was
       * shown to the model, which is a thing this code knows and the model does
       * not.
       */
      sourceLinkIds: sources.map((source) => source.forPrompt.linkId),
      rationale: attempt.rationale,
      createdAt: now,
    });

    await this.uow.run(() => this.suggestions.save(suggestion));
    this.logger.log(
      `suggested ${suggestion.draft.exercises.length} exercise(s) for ${payload.sessionId} from ${sources.length} source(s)`,
    );
    return { generated: true, reason: 'created' };
  }

  /**
   * The readings worth showing the model, newest first.
   *
   * ## Recency is the whole of the weighting
   *
   * `doneWithTags` sorts by when the source was *read* and this takes the first
   * five. That is a deliberately blunt rule and the plan says so: suggestions
   * match on sport and tags, not on a deep understanding of the training plan.
   * Anything cleverer — scoring overlap, embedding the summaries — is a
   * ranking model, and a ranking model that cannot be explained to the member
   * is worse here than one that can: "these are the five most recent things you
   * saved about the gym" is a sentence they can check.
   *
   * ## The tags
   *
   * The sport, plus the substantial words of the session's focus. Lower-cased
   * on both sides, which is what lets a member write "Gym" on an article and
   * "gym" in their timetable — the *sport* is still stored as they typed it,
   * because that is the athlete profile's decision, and only the comparison is
   * case-blind.
   */
  private async gather(
    userId: string,
    sport: string,
    focus: string | null,
  ): Promise<Array<{ title: string; forPrompt: DraftSource }>> {
    const tags = tagsFor(sport, focus);
    const links = await this.links.doneWithTags(userId, tags, MAX_SOURCES);
    if (links.length === 0) return [];

    const readings = await this.readings.forLinks(
      userId,
      links.map((link) => link.id),
    );
    const byLink = new Map(readings.map((reading) => [reading.linkId, reading]));

    const out: Array<{ title: string; forPrompt: DraftSource }> = [];
    for (const link of links) {
      const reading = byLink.get(link.id);
      // A link marked `done` whose document is gone: the member purged it, or
      // an admin cleared it. Skipped rather than treated as a source with no
      // content, which would give the model a citation and nothing to cite.
      if (!reading) continue;
      const title = reading.title ?? link.title ?? link.url;
      out.push({
        title,
        forPrompt: {
          linkId: link.id,
          title,
          summary: reading.summary,
          keyPoints: [...reading.keyPoints],
          url: link.url,
        },
      });
    }
    return out;
  }
}

/** Exported for the spec: the matching rule is the feature's whole selectivity. */
export function tagsFor(sport: string, focus: string | null): string[] {
  const tags = new Set<string>([sport.trim().toLowerCase()]);
  for (const word of (focus ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (word.length >= MIN_TAG_WORD) tags.add(word);
  }
  tags.delete('');
  return [...tags];
}

function asDate(value: string | Date | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

import { Injectable } from '@nestjs/common';
import {
  LinkRepository,
  SuggestionRepository,
} from '../../domain/knowledge.repositories.js';
import type {
  SuggestionDraft,
  SuggestionStatus,
} from '../../domain/suggestion.aggregate.js';

/** One cited source, as the suggestion card shows it. */
export interface SuggestionSourceView {
  id: string;
  url: string;
  title: string | null;
}

export interface SuggestionView {
  id: string;
  forDate: string;
  sport: string;
  draft: SuggestionDraft;
  sources: SuggestionSourceView[];
  rationale: string;
  status: SuggestionStatus;
  sessionId: string | null;
  acceptedSessionId: string | null;
  outcome: string | null;
  createdAt: Date;
}

/**
 * The member's suggestions inbox (FR-009, FR-010).
 *
 * ## The sources are resolved, not just listed
 *
 * The stored suggestion holds `sourceLinkIds`; the card shows titles and links
 * out, because FR-007 is that a summary names its source and a *suggestion*
 * drawn from summaries inherits that obligation twice over. An inbox showing
 * "we suggest four sets of squats" with no way to see where that came from is
 * the product making a claim about somebody's training in its own voice.
 *
 * A source the member has since deleted simply drops out of the list rather
 * than appearing as a dead id. The rationale still mentions it by name, which
 * is the honest outcome: the suggestion *was* made from that reading, and the
 * card should not pretend otherwise by silently rewriting its own history.
 */
@Injectable()
export class SuggestionsQueryHandler {
  constructor(
    private readonly suggestions: SuggestionRepository,
    private readonly links: LinkRepository,
  ) {}

  async list(
    userId: string,
    status: SuggestionStatus = 'pending',
  ): Promise<SuggestionView[]> {
    const rows = await this.suggestions.listFor(userId, status);
    if (rows.length === 0) return [];

    // One lookup per distinct source across the whole page rather than per
    // suggestion: a member's pending inbox is a handful of cards that
    // frequently cite the same two articles.
    const wanted = new Set(rows.flatMap((row) => row.sourceLinkIds));
    const found = new Map<string, SuggestionSourceView>();
    for (const id of wanted) {
      const link = await this.links.findById(userId, id);
      if (!link || link.isDeleted) continue;
      found.set(id, { id: link.id, url: link.url, title: link.title });
    }

    return rows.map((row) => ({
      id: row.id,
      forDate: row.forDate,
      sport: row.sport,
      draft: row.draft,
      sources: row.sourceLinkIds
        .map((id) => found.get(id))
        .filter((source): source is SuggestionSourceView => source !== undefined),
      rationale: row.rationale,
      status: row.status,
      sessionId: row.sessionId,
      acceptedSessionId: row.acceptedSessionId,
      outcome: row.outcome,
      createdAt: row.createdAt,
    }));
  }
}

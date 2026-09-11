import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';

/**
 * A picture or clip the reader found in a source.
 *
 * Knowledge declares its own rather than importing Training's identical shape.
 * That is the constitution's rule read literally — duplicate over share, and
 * move to `shared/` on the third copy — and it is right here for a reason
 * beyond obedience: these two will diverge. Training's media is what a member
 * attached to an exercise; this is what a crawler found in somebody else's
 * article, and the fields it will grow (dimensions, the alt text, whether it
 * was the lead image) are meaningless on the other.
 */
export interface SourceMedia {
  type: 'image' | 'video';
  /** The source's own URL. What a client is handed is the proxied form (FR-008). */
  url: string;
  caption: string | null;
}

export const MAX_SUMMARY = 4_000;
export const MAX_KEY_POINTS = 10;
export const MAX_MEDIA = 20;

export interface ReadingState {
  id: string;
  userId: string;
  linkId: string;
  sourceUrl: string;
  title: string | null;
  author: string | null;
  publishedAt: Date | null;
  /** Capped at `knowledge.maxChars` by the extractor, not here. */
  text: string;
  /**
   * The video's captions, or null.
   *
   * Null on an article means "not a video". Null on a *video* is the spec's own
   * edge case: the entry finishes anyway, on title, description and duration
   * alone, and the member is told the summary was built without one. That is
   * why nothing here records a separate flag — the link's kind and this field
   * together already say it, and a third field could disagree with them.
   */
  transcript: string | null;
  summary: string;
  keyPoints: string[];
  media: SourceMedia[];
  durationSec: number | null;
  /** Which model wrote the summary, and what it cost. For the Owner's usage view. */
  model: string;
  tokens: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * What Botvy read, dated (FR-006, FR-007).
 *
 * ## It is written once and never edited
 *
 * A source that changes after being read does not change this: the stored
 * summary is what was read, on the day it was read, and `createdAt` is what
 * says so. Re-reading a link is a *new* document, because the alternative —
 * overwriting — would silently rewrite a suggestion's evidence after the member
 * had accepted it.
 *
 * There is therefore no `edit`, and no event either. Nothing subscribes: the
 * pipeline's own `LinkIngested` is what announces that a reading exists, and it
 * carries the document's id. A second event would be two announcements of one
 * fact, which is how two subscribers come to disagree about which one meant it.
 *
 * ## `title` may be null and the summary may not
 *
 * A page with no readable title is common — a bare CMS route, a video with the
 * title in an image. A finished reading with no *summary* is not a thinner
 * reading, it is a failure wearing a success, so `record` refuses one.
 */
export class Reading extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  readonly linkId: string;
  readonly sourceUrl: string;
  readonly title: string | null;
  readonly author: string | null;
  readonly publishedAt: Date | null;
  readonly text: string;
  readonly transcript: string | null;
  readonly summary: string;
  readonly keyPoints: string[];
  readonly media: SourceMedia[];
  readonly durationSec: number | null;
  readonly model: string;
  readonly tokens: number;
  readonly createdAt: Date;

  private constructor(state: ReadingState) {
    super();
    this.id = state.id;
    this.userId = state.userId;
    this.linkId = state.linkId;
    this.sourceUrl = state.sourceUrl;
    this.title = state.title;
    this.author = state.author;
    this.publishedAt = state.publishedAt;
    this.text = state.text;
    this.transcript = state.transcript;
    this.summary = state.summary;
    this.keyPoints = state.keyPoints;
    this.media = state.media;
    this.durationSec = state.durationSec;
    this.model = state.model;
    this.tokens = state.tokens;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
  }

  static rehydrate(state: ReadingState): Reading {
    return new Reading(state);
  }

  static record(state: Omit<ReadingState, 'updatedAt'>): Reading {
    const summary = state.summary.trim().slice(0, MAX_SUMMARY);
    if (summary === '') {
      throw new Error(
        'A reading with no summary is a failed ingestion, not a finished one.',
      );
    }
    return new Reading({
      ...state,
      summary,
      keyPoints: state.keyPoints
        .map((point) => point.trim())
        .filter((point) => point !== '')
        .slice(0, MAX_KEY_POINTS),
      media: state.media.slice(0, MAX_MEDIA),
      updatedAt: state.createdAt,
    });
  }
}

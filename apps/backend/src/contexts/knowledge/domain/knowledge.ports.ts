import type { Link } from './link.aggregate.js';
import type { SourceMedia } from './reading.js';
import type { SuggestionDraft } from './suggestion.aggregate.js';
import type { LinkKind } from './url-kind.js';

/**
 * What Knowledge needs and does not own.
 *
 * Two groups, and they are different kinds of thing. The first — fetchers,
 * extractors, the summariser, the drafter — are *capabilities*: the pipeline
 * describes what it needs done and `infrastructure/` decides with what. The
 * second — the member's preference, the coach's transcript — are other
 * contexts' facts, reached through the one seam constitution IX sanctions.
 */

// ---------------------------------------------------------------- the pipeline

/**
 * Why a source could not be read.
 *
 * `refused` is the source saying no — a 404, a paywall, a login wall, a page
 * that is not text. It spends an attempt and the link goes to `failed`.
 * `unavailable` is *our* end failing: a network that is down, a model that is
 * not answering, a container that was restarted. It spends nothing and leaves
 * the row where it is for the sweep (FR-016).
 *
 * The two are separated here, at the port, rather than by the pipeline
 * inspecting exceptions — because only the adapter knows which of the two a
 * given error was, and a pipeline guessing from a message string would get it
 * wrong the first time somebody changed a library.
 */
export class SourceRefused extends Error {
  readonly kindOfFailure = 'refused' as const;
  constructor(message: string) {
    super(message);
    this.name = 'SourceRefused';
  }
}

export class SourceUnavailable extends Error {
  readonly kindOfFailure = 'unavailable' as const;
  constructor(message: string) {
    super(message);
    this.name = 'SourceUnavailable';
  }
}

export function isUnavailable(error: unknown): boolean {
  return (error as { kindOfFailure?: string })?.kindOfFailure === 'unavailable';
}

/** One video listed inside a playlist. */
export interface PlaylistItem {
  url: string;
  title: string | null;
}

/**
 * What came back off the wire, before anybody made sense of it.
 *
 * A union expressed as three nullable branches rather than a discriminated
 * union, because an adapter can legitimately fill more than one: a YouTube
 * playlist has a title *and* items, and a page that turns out to be a video
 * embed would have html and video facts both.
 */
export interface RawSource {
  /** Where it actually came from, after redirects. */
  url: string;
  contentType: string | null;
  html: string | null;
  video: {
    title: string | null;
    author: string | null;
    description: string | null;
    durationSec: number | null;
    publishedAt: Date | null;
    /** Null when the video has no captions — a finish, not a failure. */
    transcript: string | null;
  } | null;
  playlist: {
    title: string | null;
    items: PlaylistItem[];
    /** How many the source holds in total, so the skipped count is honest. */
    total: number;
  } | null;
}

/** The limits the Owner set, handed down rather than read by the adapter. */
export interface FetchLimits {
  maxChars: number;
  playlistMaxItems: number;
}

/**
 * Acquisition. One implementation per sort of source.
 *
 * `handles` rather than a registry keyed by kind, so an adapter can claim more
 * than one — the YouTube one takes both `video` and `playlist`, and they share
 * a client, a quota and a set of platform caveats that would be duplicated if
 * they were two adapters.
 */
export abstract class SourceFetcher {
  abstract handles(kind: LinkKind): boolean;
  abstract fetch(link: Link, limits: FetchLimits): Promise<RawSource>;
}

/**
 * Multi-provider tokens for the two capability lists.
 *
 * Symbols rather than class tokens, because there is more than one
 * implementation of each and Nest resolves a class token to exactly one
 * provider. The module assembles the arrays; the pipeline picks the first
 * adapter that claims the link's kind, so adding a source type is a new adapter
 * and one entry in a list rather than a branch inside the pipeline.
 */
export const SOURCE_FETCHERS = Symbol('SOURCE_FETCHERS');
export const CONTENT_EXTRACTORS = Symbol('CONTENT_EXTRACTORS');

/** What a source turned out to say. */
export interface ExtractedContent {
  title: string | null;
  author: string | null;
  publishedAt: Date | null;
  /** Capped at `knowledge.maxChars`. Empty means the page had no readable text. */
  text: string;
  transcript: string | null;
  media: SourceMedia[];
  durationSec: number | null;
}

export abstract class ContentExtractor {
  abstract handles(kind: LinkKind): boolean;
  abstract extract(
    raw: RawSource,
    link: Link,
    limits: FetchLimits,
  ): Promise<ExtractedContent>;
}

/** A summary and its key points, with what it cost. */
export interface Summarised {
  summary: string;
  keyPoints: string[];
  model: string;
  tokens: number;
}

export abstract class SummariserPort {
  abstract summarise(input: {
    title: string | null;
    text: string;
    /** For a video with no captions: say so in the summary rather than faking one. */
    hadTranscript: boolean | null;
    sourceUrl: string;
  }): Promise<Summarised>;
}

/** One reading, as the drafter is shown it. */
export interface DraftSource {
  linkId: string;
  title: string | null;
  summary: string;
  keyPoints: string[];
  url: string;
}

/**
 * Null means the model's answer did not decode.
 *
 * The constitution requires a plain-reply exit from every schema-constrained
 * call, and for a *draft* the honest exit is not a half-parsed suggestion — it
 * is no suggestion and the model's own words delivered as a coach message. So
 * the port returns the plain reply alongside the null, and
 * `generate-suggestion` decides what to do with it.
 */
export interface DraftAttempt {
  draft: SuggestionDraft | null;
  rationale: string;
  /** The model's unstructured answer, when the structured one failed. */
  plainReply: string | null;
  model: string;
  tokens: number;
}

export abstract class SuggestionDrafterPort {
  abstract draft(input: {
    sport: string;
    focus: string | null;
    forDate: string;
    durationMin: number | null;
    sources: DraftSource[];
  }): Promise<DraftAttempt>;
}

// ------------------------------------------------------- other contexts' facts

/**
 * Whether this member wants suggestions at all (FR-011, SC-003).
 *
 * A `user_preferences` field, so it is reached through a port bound to
 * Profile's published read and **never** through
 * `SettingsService.get('defaults.aiSuggestions')`. The two agree for every
 * member who has not changed it, which is exactly what would make reading the
 * registry an invisible bug — and it is the fourth time this project has had
 * that decision in front of it, after the lead times, the meeting duration and
 * the practice cut-off.
 *
 * Never null: a member mid-bootstrap gets the installation default, which is the
 * value their preferences row is about to be written with.
 */
export abstract class AiSuggestionsPort {
  abstract enabledFor(userId: string): Promise<boolean>;
}

/**
 * Saying something in the member's coach chat.
 *
 * Used once, and only for the case the constitution names: a suggestion draft
 * that would not decode. The structured path raises `SuggestionReady` and lets
 * Conversations write the message — this is the *fallback*, where there is no
 * structure to announce and the only honest thing to deliver is what the model
 * actually said.
 *
 * Null is returned rather than thrown when there is no such conversation, for
 * the same reason the rhythm's identical port does: the caller is a worker saga
 * walking events, and one member's missing chat must not abort the rest.
 */
export abstract class KnowledgeTranscriptPort {
  abstract append(input: {
    userId: string;
    content: string;
    at: Date;
  }): Promise<{ seq: number } | null>;
}

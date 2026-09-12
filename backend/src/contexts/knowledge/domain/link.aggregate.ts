import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';
import type { LinkKind } from './url-kind.js';

/**
 * Where a link is in the pipeline (data-model §2.7, FR-003).
 *
 * The member reads four of these as three words — *waiting*, *reading*,
 * *summarising* — because `fetching` and `extracting` are one thing from
 * outside and two things from inside. They are two states here rather than one
 * because a crash between them is recoverable from the second: the text is
 * already in hand, and starting again would re-fetch somebody else's server for
 * nothing. `spec.md`'s own glossary records the translation.
 */
export type LinkStatus =
  | 'queued'
  | 'fetching'
  | 'extracting'
  | 'summarising'
  | 'done'
  | 'failed';

/** The three states that mean "somebody is holding this right now". */
const IN_FLIGHT: ReadonlySet<LinkStatus> = new Set([
  'fetching',
  'extracting',
  'summarising',
]);

export const MAX_LINK_TITLE = 300;
export const MAX_FAIL_REASON = 500;
export const MAX_TAGS = 12;

export interface LinkState {
  id: string;
  userId: string;
  url: string;
  normalizedUrl: string;
  kind: LinkKind;
  /** The video or playlist id, for a YouTube source; null otherwise. */
  externalId: string | null;
  parentLinkId: string | null;
  title: string | null;
  tags: string[];
  status: LinkStatus;
  failReason: string | null;
  attempts: number;
  docId: string | null;
  /**
   * How many videos of a playlist were left behind by
   * `knowledge.playlistMaxItems`, so the member can be told (FR-002's edge
   * case). Null for anything that is not an expanded playlist — which is not
   * the same as zero, and the difference is what lets the list say nothing at
   * all rather than "0 skipped" beside every article.
   */
  skippedCount: number | null;
  addedAt: Date;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class LinkRuleError extends Error {
  constructor(
    readonly code:
      | 'bad_transition'
      | 'attempts_exhausted'
      | 'not_deleted'
      | 'not_failed',
    message: string,
  ) {
    super(message);
    this.name = 'LinkRuleError';
  }
}

/**
 * One thing the member saved, and its journey through the reader.
 *
 * ## The states are the crash log
 *
 * Every step is its own transition with its own event, so a failure is always
 * attributable and a resumption always starts from a known place. That is not
 * bookkeeping: `LinkAdded` is consumed once, so a worker killed mid-pipeline
 * leaves a row that nothing would ever come back for — `requeue` and the sweep
 * that calls it exist precisely because the status says where the process
 * stopped (FR-016).
 *
 * ## Two ways back to `queued`, and they are not the same
 *
 * `requeue` is what the sweep does to a row a dead worker left behind: the
 * machine failed, the *link* did not, so `attempts` is untouched. `retry` is
 * what a member or the Owner does to a `failed` row: the source rejected us,
 * that attempt was spent, and `knowledge.maxAttempts` is the ceiling (FR-004).
 * Collapsing them would make a bad afternoon — a model outage, a restarted
 * container — exhaust the retry limit of every link that happened to be in
 * flight, which is the one thing FR-016 says must not happen.
 *
 * ## Where the attempt is counted
 *
 * On `fail`, not on `retry`. The tasks list says "reset to `queued` with
 * `attempts + 1`", which is the same arithmetic read from the other end and
 * becomes a double count if `fail` also increments — and it leaves a link that
 * has failed once showing an attempt count of zero, which is the number FR-003
 * asks to be shown beside the reason. So `attempts` means "times we tried and
 * were refused", `fail` is what increments it, and `retry` refuses once it has
 * reached the ceiling.
 */
export class Link extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  readonly url: string;
  readonly normalizedUrl: string;
  kind: LinkKind;
  readonly externalId: string | null;
  parentLinkId: string | null;
  title: string | null;
  tags: string[];
  status: LinkStatus;
  failReason: string | null;
  attempts: number;
  docId: string | null;
  skippedCount: number | null;
  readonly addedAt: Date;
  processedAt: Date | null;
  readonly createdAt: Date;
  deletedAt: Date | null;

  private constructor(state: LinkState) {
    super();
    this.id = state.id;
    this.userId = state.userId;
    this.url = state.url;
    this.normalizedUrl = state.normalizedUrl;
    this.kind = state.kind;
    this.externalId = state.externalId;
    this.parentLinkId = state.parentLinkId;
    this.title = state.title;
    this.tags = state.tags;
    this.status = state.status;
    this.failReason = state.failReason;
    this.attempts = state.attempts;
    this.docId = state.docId;
    this.skippedCount = state.skippedCount;
    this.addedAt = state.addedAt;
    this.processedAt = state.processedAt;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
    this.deletedAt = state.deletedAt;
  }

  static rehydrate(state: LinkState): Link {
    return new Link(state);
  }

  /**
   * A link the member saved, or one a playlist produced.
   *
   * `LinkAdded` is what starts the pipeline, and it is raised here rather than
   * by the handler so that every path that creates a link — the REST command,
   * the sync push, the playlist expansion — starts one. A create that
   * announced nothing would be a link that sits in `queued` until somebody
   * notices.
   */
  static save(
    state: Omit<
      LinkState,
      | 'status'
      | 'failReason'
      | 'attempts'
      | 'docId'
      | 'skippedCount'
      | 'processedAt'
      | 'updatedAt'
      | 'deletedAt'
    >,
  ): Link {
    const link = new Link({
      ...state,
      title: truncate(state.title, MAX_LINK_TITLE),
      tags: normaliseTags(state.tags),
      status: 'queued',
      failReason: null,
      attempts: 0,
      docId: null,
      skippedCount: null,
      processedAt: null,
      updatedAt: state.createdAt,
      deletedAt: null,
    });
    link.raise(
      'knowledge.LinkAdded',
      'link',
      { linkId: link.id, url: link.url, kind: link.kind },
      state.createdAt,
    );
    return link;
  }

  // ------------------------------------------------------------ transitions

  /** `queued → fetching`. */
  beginFetch(at: Date = new Date()): void {
    this.move('queued', 'fetching', at);
  }

  /**
   * `fetching → extracting`, carrying what the fetch already learned.
   *
   * The title arrives here rather than at `finish` because it is what the
   * member's list shows while the rest is still being read — a row saying
   * "summarising" beside the article's own headline is a different experience
   * from one saying "summarising" beside a bare URL.
   */
  beginExtract(title: string | null, at: Date = new Date()): void {
    if (title !== null) this.title = truncate(title, MAX_LINK_TITLE);
    this.move('fetching', 'extracting', at);
  }

  /** `extracting → summarising`. */
  beginSummarise(at: Date = new Date()): void {
    this.move('extracting', 'summarising', at);
  }

  /**
   * `summarising → done`, and the one transition anything outside this context
   * listens for.
   *
   * `LinkIngested` carries the document and the tags, because its subscribers —
   * the coach's "I read …" message and this context's own suggestion selection
   * — need both and neither may go looking in Knowledge's collections for them.
   * `docId` is nullable on purpose: an expanded playlist's *parent* finishes
   * with children rather than a document, and a payload that promised a
   * document would make every consumer branch on a value it was told was there.
   */
  finish(docId: string | null, at: Date = new Date()): void {
    // `extracting` is allowed as well as `summarising`, and only a playlist
    // takes that route: its videos are what get summarised, so the parent is
    // finished the moment its children exist. Allowing it here rather than
    // giving the playlist a state of its own keeps one state machine for both,
    // which is what lets the sweep, the queue view and the member's list be
    // written once.
    if (this.status !== 'summarising' && this.status !== 'extracting') {
      throw new LinkRuleError(
        'bad_transition',
        `A link finishes from summarising (or from extracting, for a playlist); this one is ${this.status}.`,
      );
    }
    this.docId = docId;
    this.failReason = null;
    this.processedAt = at;
    this.status = 'done';
    this.updatedAt = at;
    this.announceState(at);
    this.raise(
      'knowledge.LinkIngested',
      'link',
      { linkId: this.id, docId, tags: [...this.tags] },
      at,
    );
  }

  /**
   * The source refused us: a 404, a paywall, a page that parses to nothing.
   *
   * **Not** what a dead worker or an unreachable model produces — those leave
   * the row where it is for `requeue`. The distinction is the whole of FR-016,
   * and it lives at the call sites in `ingest-link`, because only they know
   * which kind of "no" they got.
   */
  fail(reason: string, at: Date = new Date()): void {
    this.status = 'failed';
    this.failReason = truncate(reason, MAX_FAIL_REASON) ?? 'unknown';
    this.attempts += 1;
    this.processedAt = at;
    this.updatedAt = at;
    this.announceState(at);
  }

  /**
   * Back to the queue after a crash. `attempts` is deliberately untouched.
   *
   * Silent on anything not in flight, rather than throwing: the sweep claims
   * rows by a query and a row that finished between the query and the write is
   * a race it should lose quietly, not a stack trace in a nightly log.
   */
  requeue(at: Date = new Date()): boolean {
    if (!IN_FLIGHT.has(this.status)) return false;
    this.status = 'queued';
    this.updatedAt = at;
    this.announceState(at);
    return true;
  }

  /** The member or the Owner asking again (FR-003, FR-004). */
  retry(maxAttempts: number, at: Date = new Date()): void {
    if (this.status !== 'failed') {
      throw new LinkRuleError(
        'not_failed',
        'Only a failed link can be tried again.',
      );
    }
    if (this.attempts >= maxAttempts) {
      throw new LinkRuleError(
        'attempts_exhausted',
        `This link has been refused ${this.attempts} times; the limit is ${maxAttempts}.`,
      );
    }
    this.status = 'queued';
    this.failReason = null;
    this.updatedAt = at;
    this.announceState(at);
  }

  /**
   * Re-run from the top, whatever state the row is in.
   *
   * `POST /internal/knowledge/ingest/:linkId` is specified as "regardless of
   * state", which is the Owner's override and the one path that may move a
   * `done` row backwards. It spends no attempt: the Owner asking is not the
   * source refusing.
   */
  forceRequeue(at: Date = new Date()): void {
    this.status = 'queued';
    this.failReason = null;
    this.updatedAt = at;
    this.announceState(at);
  }

  // --------------------------------------------------------------- playlists

  /**
   * A video the member already had, taken into a playlist's group.
   *
   * The alternative — a second row — cannot exist, because `(userId,
   * normalizedUrl)` is unique; and refusing the parent would punish a member
   * for having saved one of its videos already. So the entry they have is
   * adopted and nothing is read twice, which is FR-005 holding across a case
   * that looks like an exception to it.
   *
   * Returns false when there is nothing to do, so the expander can tell an
   * adoption from a no-op without comparing fields.
   */
  adopt(parentLinkId: string, at: Date = new Date()): boolean {
    if (this.parentLinkId === parentLinkId) return false;
    this.parentLinkId = parentLinkId;
    this.updatedAt = at;
    return true;
  }

  /** How many of a playlist's videos the Owner's limit left behind. */
  recordSkipped(count: number, at: Date = new Date()): void {
    this.skippedCount = count;
    this.updatedAt = at;
  }

  // ------------------------------------------------------------ housekeeping

  retag(tags: string[], at: Date = new Date()): void {
    this.tags = normaliseTags(tags);
    this.updatedAt = at;
  }

  tombstone(at: Date = new Date()): void {
    this.deletedAt = at;
    this.updatedAt = at;
  }

  restore(at: Date = new Date()): void {
    this.deletedAt = null;
    this.updatedAt = at;
  }

  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  /** Whether the pipeline still has work to do on this row. */
  get isFinished(): boolean {
    return this.status === 'done' || this.status === 'failed';
  }

  assertPurgeable(): void {
    if (!this.isDeleted) {
      throw new LinkRuleError(
        'not_deleted',
        'Only a deleted link can be erased.',
      );
    }
  }

  // ---------------------------------------------------------------- internals

  private move(from: LinkStatus, to: LinkStatus, at: Date): void {
    if (this.status !== from) {
      throw new LinkRuleError(
        'bad_transition',
        `A link moves to ${to} from ${from}; this one is ${this.status}.`,
      );
    }
    this.status = to;
    this.updatedAt = at;
    this.announceState(at);
  }

  /**
   * `knowledge.LinkStateChanged`, on every move without exception.
   *
   * It is what nudges the member's devices to re-pull the row and what the
   * Owner's queue counts. Raised from one place rather than at each transition
   * so a state that moves without announcing itself is not something a future
   * step can forget to do — the list would simply stop updating, silently,
   * which is the failure mode this codebase records about every other event.
   */
  private announceState(at: Date): void {
    this.raise(
      'knowledge.LinkStateChanged',
      'link',
      {
        linkId: this.id,
        status: this.status,
        failReason: this.failReason,
      },
      at,
    );
  }
}

function truncate(value: string | null, max: number): string | null {
  if (value === null) return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed === '' ? null : trimmed;
}

/**
 * Tags, lower-cased and de-duplicated.
 *
 * Lower-cased because they are matched against a session's sport, and a member
 * who wrote "Gym" on the article and "gym" in their timetable should still get
 * the suggestion. The *sport* itself is stored as the member typed it — that is
 * the athlete profile's decision and this does not overturn it; the comparison
 * is what is case-blind, and it is case-blind on both sides.
 */
function normaliseTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags ?? []) {
    const tag = raw.trim().slice(0, 40).toLowerCase();
    if (tag === '' || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { HeartbeatService } from '../../../../shared/health/heartbeat.service.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import {
  ContentExtractor,
  SourceFetcher,
  SourceRefused,
  SummariserPort,
  isUnavailable,
  type FetchLimits,
} from '../../domain/knowledge.ports.js';
import {
  LinkRepository,
  ReadingRepository,
} from '../../domain/knowledge.repositories.js';
import type { Link } from '../../domain/link.aggregate.js';
import { Reading } from '../../domain/reading.js';
import { ExpandPlaylistHandler } from '../expand-playlist/expand-playlist.handler.js';

/** The heartbeat key `/health` and the admin overview report staleness on. */
export const KNOWLEDGE_INGEST_JOB = 'knowledge.ingest';

/** Mints the ids of the documents the pipeline writes. */
export type ReadingIdFactory = () => string;

/**
 * How many links one drain will read before it stops and waits for the tick.
 *
 * A bound rather than "until the queue is empty", so a member who pastes two
 * hundred links cannot hold the worker for an hour with no heartbeat in
 * between — the sweep would look stuck while it was working perfectly.
 */
const DRAIN_BUDGET = 50;

export interface DrainResult {
  requeued: number;
  ingested: number;
  failed: number;
  ms: number;
}

/**
 * The pipeline: fetch, extract, summarise, store (FR-012, FR-016, FR-017).
 *
 * ## It runs in the worker, and nothing waits on it
 *
 * Every model call and every outbound fetch happens here, off the request path,
 * which is the whole of FR-012: a member saves a link and is told "saved", and
 * the reading happens whether or not they are still looking at the screen.
 *
 * ## Three ways in, one body
 *
 * `onLinkAdded` is the immediate one — a link saved now is read now, which is
 * what makes SC-001's three minutes achievable. `drain` is the tick, which
 * exists because `LinkAdded` is consumed once: a worker killed mid-pipeline
 * leaves rows nothing would ever come back for, and a relay that was down when
 * the event passed leaves rows nobody ever started. `ingestOne` is the Owner's
 * override, which re-runs a link from whatever state it is in.
 *
 * All three converge on `read`, so a redelivered event, a manual run and a
 * catch-up after an outage do the same thing.
 *
 * ## Which failures spend an attempt
 *
 * The source refusing spends one and leaves the link `failed` with a reason
 * (FR-003, FR-004). Our end failing — the network, the model, a container that
 * was restarted — spends nothing and **leaves the row where it is**, for
 * `requeueStalled` to bring round again (FR-016). The adapters decide which is
 * which, because only they know; this saga branches on `isUnavailable` and
 * never on a message string.
 *
 * An unexpected error — a bug here, a library that threw something new — is
 * treated as the source refusing. That is the bounded direction: a bug read as
 * "try later" would loop through the sweep for ever, and the one thing worse
 * than a link that failed is a link that fails invisibly at four in the
 * morning for the rest of the installation's life.
 *
 * ## Concurrency is the transition, not a lock
 *
 * `beginFetch` moves a row out of `queued`, so a second drain's `nextQueued`
 * cannot see it. The in-process flag below is an optimisation on top of that,
 * and it is honest about its limits: with more than one worker process there is
 * a window between the read and the transition in which two could both claim a
 * link. This compose runs exactly one worker. A second would need the claim to
 * be a `findOneAndUpdate`, and that is the change to make rather than a
 * distributed lock.
 */
@Injectable()
export class IngestLinkSaga {
  private readonly logger = new Logger(IngestLinkSaga.name);
  #draining = false;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly links: LinkRepository,
    private readonly readings: ReadingRepository,
    private readonly fetchers: SourceFetcher[],
    private readonly extractors: ContentExtractor[],
    private readonly summariser: SummariserPort,
    private readonly playlists: ExpandPlaylistHandler,
    private readonly settings: SettingsService,
    private readonly heartbeats: HeartbeatService,
    private readonly nextId: ReadingIdFactory,
  ) {}

  // ---------------------------------------------------------------- triggers

  /** `knowledge.LinkAdded` — read it now rather than at the next tick. */
  async onLinkAdded(event: DomainEvent): Promise<void> {
    if (!event.userId) return;
    const result = await this.drain(event.occurredAt);
    this.logger.log(
      `${event.name}: ingested ${result.ingested}, failed ${result.failed}`,
    );
  }

  /**
   * `knowledge.LinkStateChanged`, and **only** when something went back to the
   * queue.
   *
   * Found by P7's own gate: a member pressed Retry, the link went to `queued`,
   * and then nothing happened. `LinkAdded` is raised once, at creation, so the
   * only thing that would have picked the row up again was the five-minute
   * tick — and FR-003's "offers to try again" is not a promise about the next
   * five minutes. The Owner's force-requeue had the same gap, and so did every
   * row the stall sweep recovered.
   *
   * The guard is the whole of it. This event fires on *every* transition,
   * including the four the drain itself makes, so acting on anything but
   * `queued` would have the pipeline calling itself once per step. `#draining`
   * makes a re-entrant call a no-op in any case, but a handler that relies on a
   * flag to be harmless is a handler one refactor away from a loop.
   */
  async onLinkStateChanged(event: DomainEvent): Promise<void> {
    const status = (event.payload as { status?: string })?.status;
    if (status !== 'queued') return;
    const result = await this.drain(event.occurredAt);
    if (result.ingested > 0 || result.failed > 0) {
      this.logger.log(
        `${event.name} (queued): ingested ${result.ingested}, failed ${result.failed}`,
      );
    }
  }

  /**
   * The worker tick, and the Owner's `/internal/knowledge/ingest`.
   *
   * Stalled rows are returned to the queue **before** the queue is drained, so
   * a link a dead worker left behind is picked up in the same pass rather than
   * waiting another tick. The heartbeat is stamped on the way out either way:
   * a scheduled job that stops arriving has to be visible, and `/health`
   * reports this key alongside the oldest waiting row (FR-017).
   */
  async drain(now: Date = new Date()): Promise<DrainResult> {
    const started = Date.now();
    const result: DrainResult = {
      requeued: 0,
      ingested: 0,
      failed: 0,
      ms: 0,
    };

    if (this.#draining) {
      result.ms = Date.now() - started;
      return result;
    }
    this.#draining = true;

    try {
      /*
       * FR-017's second half, measured **before** the pass rather than after.
       *
       * "A queue nobody is draining looks exactly like an idle queue", and the
       * only moment that difference is visible is at the start: a link still
       * `queued` from three hours ago is a link every pass since then failed to
       * take. Measuring afterwards reports nothing, because this pass moves
       * every row it touches out of `queued` — including the ones it defers,
       * which leave as `fetching` and are the stall sweep's business rather
       * than the queue's. That was the first shape of this check, and its spec
       * caught it answering healthy for a queue that had been stuck for hours.
       *
       * A first pass over an old backlog therefore reports one failure and then
       * succeeds, which is the honest reading: nothing had been draining until
       * now.
       */
      const oldestBefore = await this.links.oldestQueuedAt();

      result.requeued = await this.requeueStalled(now);

      const concurrency = await this.settings.get('knowledge.concurrency');
      let read = 0;
      for (;;) {
        const batch = await this.links.nextQueued(concurrency);
        if (batch.length === 0) break;

        const outcomes = await Promise.all(
          batch.map((link) => this.read(link, now)),
        );
        for (const outcome of outcomes) {
          if (outcome === 'ingested') result.ingested += 1;
          if (outcome === 'failed') result.failed += 1;
        }

        read += batch.length;
        if (read >= DRAIN_BUDGET) break;
        // `deferred` means the row is still in flight and will be picked up by
        // the sweep, so it is no longer `queued` and the next read moves on.
      }

      /*
       * The verdict on the pass, reported through the heartbeat rather than
       * through a new probe in `/health`.
       *
       * `assessHealth` reports `knowledge.ingest` stale from
       * `ops.staleAfterMinutes` after the last *good* pass, with the reason in
       * `lastError` — so this needs no port from `shared/health` into this
       * context and no second definition of "too long to wait". The
       * alternative, a `KnowledgeQueuePort` bound in `HealthModule`, would have
       * put the platform's health check in the business of knowing what a link
       * is.
       */
      const stuckFor = oldestBefore ? now.getTime() - oldestBefore.getTime() : 0;
      const threshold =
        (await this.settings.get('knowledge.stuckAfterMinutes')) * 60_000;

      result.ms = Date.now() - started;
      if (oldestBefore && stuckFor > threshold) {
        const minutes = Math.round(stuckFor / 60_000);
        await this.heartbeats.stamp(
          KNOWLEDGE_INGEST_JOB,
          false,
          `a link had been waiting ${minutes} minutes`,
          result.ms,
        );
        this.logger.error(
          `the reading queue was not draining: the oldest link had waited ${minutes} minutes`,
        );
        return result;
      }

      await this.heartbeats.stamp(
        KNOWLEDGE_INGEST_JOB,
        true,
        undefined,
        result.ms,
      );
      return result;
    } catch (error) {
      result.ms = Date.now() - started;
      await this.heartbeats.stamp(
        KNOWLEDGE_INGEST_JOB,
        false,
        (error as Error).message,
        result.ms,
      );
      throw error;
    } finally {
      this.#draining = false;
    }
  }

  /**
   * One link, from whatever state it is in — the Owner's override.
   *
   * `contracts/internal.md` specifies it as "re-run the ingestion pipeline for
   * one link regardless of state", which is the one path that may move a `done`
   * row backwards. It spends no attempt: the Owner asking again is not the
   * source refusing.
   */
  async ingestOne(linkId: string, now: Date = new Date()): Promise<string> {
    // `findAnyById` rather than the scoped read, because the caller is a
    // service token and has no member. That is the one place in this context
    // where crossing the member boundary is correct, and the repository names
    // it so rather than letting a forgotten argument do it silently.
    const link = await this.links.findAnyById(linkId);
    if (!link) return 'not_found';

    link.forceRequeue(now);
    await this.uow.run(() => this.links.save(link));
    return this.read(link, now);
  }

  /**
   * Rows parked mid-pipeline, back to the queue (FR-016, SC-007).
   *
   * `attempts` is untouched, deliberately and load-bearingly: the machine
   * failed, the link did not. Collapsing this with `retry` would make a model
   * outage or a container restart exhaust the retry limit of every link that
   * happened to be in flight at the time, which is precisely what FR-016 says
   * must not happen.
   */
  async requeueStalled(now: Date = new Date()): Promise<number> {
    const minutes = await this.settings.get('knowledge.stuckAfterMinutes');
    const before = new Date(now.getTime() - minutes * 60_000);
    const stalled = await this.links.stalledSince(before, DRAIN_BUDGET);
    if (stalled.length === 0) return 0;

    let requeued = 0;
    await this.uow.run(async () => {
      for (const link of stalled) {
        if (!link.requeue(now)) continue;
        await this.links.save(link);
        requeued += 1;
      }
    });

    if (requeued > 0) {
      this.logger.warn(
        `${requeued} link(s) were left mid-pipeline for over ${minutes} minutes; back to the queue`,
      );
    }
    return requeued;
  }

  // ---------------------------------------------------------------- the body

  /**
   * Fetch, extract, summarise, store — one transition at a time.
   *
   * Each step is saved before the next begins, which is what makes the status
   * a crash log rather than a progress bar: a worker killed between two of them
   * leaves a row that says where it stopped, and the sweep knows to bring it
   * back. The steps are **not** individually resumable — a requeued row starts
   * again from the fetch — and that is the honest trade: making `extracting`
   * resumable would mean storing every fetched page, which is a large write to
   * save a second request to somebody else's server.
   */
  private async read(
    link: Link,
    now: Date,
  ): Promise<'ingested' | 'failed' | 'deferred'> {
    const limits = await this.limits();

    try {
      const fetcher = this.fetchers.find((candidate) => candidate.handles(link.kind));
      const extractor = this.extractors.find((candidate) =>
        candidate.handles(link.kind),
      );
      if (!fetcher || !extractor) {
        throw new SourceRefused(`Botvy cannot read a ${link.kind} link yet.`);
      }

      link.beginFetch(now);
      await this.uow.run(() => this.links.save(link));

      const raw = await fetcher.fetch(link, limits);

      link.beginExtract(raw.video?.title ?? raw.playlist?.title ?? null, now);
      await this.uow.run(() => this.links.save(link));

      const content = await extractor.extract(raw, link, limits);

      if (link.kind === 'playlist' && raw.playlist) {
        // A playlist is finished by having children; the videos are what get
        // summarised. `expand` writes them in its own transaction and may set
        // the parent's skipped count, so the finish is saved after it.
        const expansion = await this.playlists.handle(
          link,
          raw.playlist.items,
          raw.playlist.total,
          now,
        );
        link.finish(null, now);
        await this.uow.run(() => this.links.save(link));
        this.logger.log(
          `playlist ${link.id}: ${expansion.created} new, ${expansion.adopted} adopted, ${expansion.skipped} skipped`,
        );
        return 'ingested';
      }

      link.beginSummarise(now);
      await this.uow.run(() => this.links.save(link));

      const summarised = await this.summariser.summarise({
        title: content.title,
        text: content.text,
        hadTranscript: link.kind === 'video' ? content.transcript !== null : null,
        sourceUrl: link.url,
      });

      const reading = Reading.record({
        id: this.nextId(),
        userId: link.userId,
        linkId: link.id,
        sourceUrl: raw.url,
        title: content.title,
        author: content.author,
        publishedAt: content.publishedAt,
        text: content.text,
        transcript: content.transcript,
        summary: summarised.summary,
        keyPoints: summarised.keyPoints,
        media: content.media,
        durationSec: content.durationSec,
        model: summarised.model,
        tokens: summarised.tokens,
        createdAt: now,
      });

      // One transaction: the document and the link's `done` — with its
      // `LinkIngested` — commit together or not at all. A document without the
      // event is a reading nothing knows about; the event without the document
      // is a `docId` pointing at nothing.
      link.finish(reading.id, now);
      await this.uow.run(async () => {
        await this.readings.save(reading);
        await this.links.save(link);
      });

      return 'ingested';
    } catch (error) {
      if (isUnavailable(error)) {
        // Left exactly where it is. The sweep returns it to the queue once
        // `knowledge.stuckAfterMinutes` has passed, and `attempts` is untouched.
        this.logger.warn(
          `link ${link.id} deferred at ${link.status}: ${(error as Error).message}`,
        );
        return 'deferred';
      }

      const reason =
        error instanceof SourceRefused
          ? error.message
          : `Botvy could not read this link: ${(error as Error).message}`;
      link.fail(reason, now);
      await this.uow.run(() => this.links.save(link));
      this.logger.warn(`link ${link.id} failed: ${reason}`);
      return 'failed';
    }
  }

  private async limits(): Promise<FetchLimits> {
    const [maxChars, playlistMaxItems] = await Promise.all([
      this.settings.get('knowledge.maxChars'),
      this.settings.get('knowledge.playlistMaxItems'),
    ]);
    return { maxChars, playlistMaxItems };
  }
}

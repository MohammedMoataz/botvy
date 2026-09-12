import { Injectable, Logger } from '@nestjs/common';
import type { Model, mongo } from 'mongoose';
import type { DomainEvent } from '../cqrs/domain-event.js';
import type { RelayStore } from './outbox-relay.js';

/** An outbox row as stored; the relay only ever needs the event inside it. */
export interface OutboxDoc {
  eventId: string;
  name: string;
  context: string;
  aggregate: { type: string; id: string };
  userId: string | null;
  payload: unknown;
  schemaVersion: number;
  occurredAt: Date;
  deliveredAt: Date | null;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date | null;
}

export interface RelayStateDoc {
  _id: string;
  resumeToken: unknown;
  updatedAt: Date;
}

const RELAY_STATE_ID = 'outbox';

/** MongoDB's error when a resume token points before the oplog's horizon. */
const CHANGE_STREAM_HISTORY_LOST = 286;

/**
 * The outbox as the relay sees it: a backlog to drain and a change stream to
 * follow. The resume token is persisted after every delivery, so a restart
 * picks up where it left off rather than replaying — and when the token has
 * fallen off the oplog it is cleared, because a relay that cannot start is
 * worse than one that redelivers what the backlog drain will catch anyway.
 */
@Injectable()
export class MongoOutboxStore implements RelayStore {
  private readonly logger = new Logger(MongoOutboxStore.name);
  #stream: mongo.ChangeStream<OutboxDoc> | null = null;

  constructor(
    private readonly outbox: Model<OutboxDoc>,
    private readonly state: Model<RelayStateDoc>,
  ) {}

  async drain(limit: number): Promise<DomainEvent[]> {
    const now = new Date();
    const rows = await this.outbox
      .find({
        deliveredAt: null,
        $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
      })
      .sort({ occurredAt: 1 })
      .limit(limit)
      .lean<OutboxDoc[]>()
      .exec();
    return rows.map(toEvent);
  }

  async markDelivered(eventId: string): Promise<void> {
    await this.outbox.updateOne({ eventId }, { $set: { deliveredAt: new Date(), lastError: null } });
  }

  async recordFailure(eventId: string, error: string): Promise<number> {
    // `new: true` so the count that comes back is the one just written. Reading
    // it afterwards would be a second query racing the first.
    const row = await this.outbox
      .findOneAndUpdate({ eventId }, { $set: { lastError: error }, $inc: { attempts: 1 } }, { new: true })
      .lean<OutboxDoc>()
      .exec();
    return row?.attempts ?? 1;
  }

  async scheduleRetry(eventId: string, at: Date | null): Promise<void> {
    await this.outbox.updateOne({ eventId }, { $set: { nextAttemptAt: at } });
  }

  async isDelivered(eventId: string): Promise<boolean> {
    const row = await this.outbox
      .findOne({ eventId }, { deliveredAt: 1 })
      .lean<Pick<OutboxDoc, 'deliveredAt'>>()
      .exec();
    return row?.deliveredAt != null;
  }

  async loadResumeToken(): Promise<unknown | null> {
    const row = await this.state.findById(RELAY_STATE_ID).lean<RelayStateDoc>().exec();
    return row?.resumeToken ?? null;
  }

  async saveResumeToken(token: unknown): Promise<void> {
    await this.state.updateOne(
      { _id: RELAY_STATE_ID },
      { $set: { resumeToken: token, updatedAt: new Date() } },
      { upsert: true },
    );
  }

  async *watch(
    resumeToken: unknown | null,
  ): AsyncGenerator<{ event: DomainEvent; token: unknown }> {
    // `this.outbox.collection.watch`, not `this.outbox.watch`.
    //
    // Mongoose's `Model.watch()` returns its own wrapper around the driver's
    // change stream, and that wrapper has no `Symbol.asyncIterator` - so
    // `for await` threw `stream is not async iterable` on the first tick, the
    // relay crash-looped on a 30-second timer, and every domain event was
    // delivered only when a restart happened to sweep the outbox. Nothing was
    // lost, because the sweep is the durable path; nothing was prompt either.
    //
    // The cast below is what hid it: `as AsyncIterable<...>` silenced the type
    // error that was telling the truth. The driver's own
    // `Collection.watch()` *is* async-iterable, so the cast is gone with it.
    const stream = this.outbox.collection.watch<OutboxDoc>(
      [{ $match: { operationType: 'insert' } }],
      {
        fullDocument: 'updateLookup',
        ...(resumeToken ? { resumeAfter: resumeToken as Record<string, unknown> } : {}),
      },
    );
    this.#stream = stream;

    try {
      for await (const change of stream) {
        if (change.operationType !== 'insert' || !change.fullDocument) continue;
        yield { event: toEvent(change.fullDocument), token: change._id };
      }
    } catch (error) {
      if ((error as { code?: number }).code === CHANGE_STREAM_HISTORY_LOST) {
        this.logger.warn('resume token fell off the oplog; clearing it so the next run starts fresh');
        await this.saveResumeToken(null);
      }
      throw error;
    } finally {
      this.#stream = null;
      await stream.close().catch(() => undefined);
    }
  }

  /** Ends the current watch, which lets `run()` return on shutdown. */
  async close(): Promise<void> {
    await this.#stream?.close().catch(() => undefined);
    this.#stream = null;
  }
}

export function toEvent(row: OutboxDoc): DomainEvent {
  return {
    eventId: row.eventId,
    name: row.name,
    context: row.context,
    aggregate: row.aggregate,
    userId: row.userId,
    occurredAt: row.occurredAt,
    payload: row.payload,
    schemaVersion: row.schemaVersion,
  };
}

import { Injectable } from '@nestjs/common';
import { Types, type Model } from 'mongoose';
import {
  MongoRepositoryBase,
  type OutboxInsert,
} from '../../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../../shared/persistence/mongo/mongo-unit-of-work.js';
import type { Mapper } from '../../../shared/persistence/ports/mapper.js';
import {
  Alert,
  type AlertSource,
  type AlertState,
} from '../domain/alert.aggregate.js';
import { AlertRepository } from '../domain/alert.repository.js';

export interface AlertDoc extends Omit<AlertState, 'id'> {
  _id: Types.ObjectId | string;
  schemaVersion: number;
}

const mapper: Mapper<Alert, AlertDoc> = {
  toDomain(doc) {
    return Alert.rehydrate({
      id: String(doc._id),
      userId: doc.userId,
      source: {
        kind: doc.source.kind,
        id: doc.source.id,
        occurrenceAt: doc.source.occurrenceAt ?? null,
      },
      label: doc.label,
      notifyAt: doc.notifyAt,
      title: doc.title,
      body: doc.body ?? '',
      deepLink: doc.deepLink ?? '',
      plannedAt: doc.plannedAt,
      claimedAt: doc.claimedAt ?? null,
      sentAt: doc.sentAt ?? null,
      failedAt: doc.failedAt ?? null,
      error: doc.error ?? null,
      updatedAt: doc.updatedAt ?? doc.plannedAt,
    });
  },
  toPersistence(alert) {
    return {
      // A server-only row, so an ObjectId — but one the aggregate already
      // holds as a string, because `AggregateRoot` is keyed by string and a
      // second id type across the codebase would be a second thing to get
      // wrong.
      _id: new Types.ObjectId(alert.id),
      userId: alert.userId,
      source: alert.source,
      label: alert.label,
      notifyAt: alert.notifyAt,
      title: alert.title,
      body: alert.body,
      deepLink: alert.deepLink,
      plannedAt: alert.plannedAt,
      claimedAt: alert.claimedAt,
      sentAt: alert.sentAt,
      failedAt: alert.failedAt,
      error: alert.error,
      updatedAt: alert.updatedAt,
      schemaVersion: alert.schemaVersion,
    };
  },
};

/** A fresh ObjectId as a string, for `Alert.plan`. */
export function newAlertId(): string {
  return new Types.ObjectId().toHexString();
}

@Injectable()
export class MongoAlertRepository extends AlertRepository {
  readonly #inner: InnerAlertRepository;

  constructor(
    private readonly model: Model<AlertDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerAlertRepository(model, outbox);
  }

  async findById(userId: string, id: string): Promise<Alert | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findOne({ _id: new Types.ObjectId(id), userId })
      .session(MongoUnitOfWork.currentSession())
      .lean<AlertDoc>()
      .exec();
    return doc ? mapper.toDomain(doc) : null;
  }

  async save(alert: Alert): Promise<void> {
    await this.#inner.save(alert);
  }

  async remove(alert: Alert): Promise<void> {
    await this.#inner.remove(alert);
  }

  async pendingForSource(
    userId: string,
    source: Pick<AlertSource, 'kind' | 'id'>,
  ): Promise<Alert[]> {
    const docs = await this.model
      .find({
        userId,
        'source.kind': source.kind,
        'source.id': source.id,
        sentAt: null,
      })
      .session(MongoUnitOfWork.currentSession())
      .lean<AlertDoc[]>()
      .exec();
    return docs.map((doc) => mapper.toDomain(doc));
  }

  /**
   * `sentAt: null` only.
   *
   * An alert already delivered is a thing that happened; deleting it would lose
   * the only record that the member was told. So completing a task drops its
   * *pending* alerts and leaves the history alone.
   */
  async deletePendingForSource(
    userId: string,
    source: Pick<AlertSource, 'kind' | 'id'>,
  ): Promise<number> {
    const result = await this.model
      .deleteMany(
        {
          userId,
          'source.kind': source.kind,
          'source.id': source.id,
          sentAt: null,
        },
        { session: MongoUnitOfWork.currentSession() ?? undefined },
      )
      .exec();
    return result.deletedCount;
  }

  async dueUnsent(now: Date, limit: number): Promise<Alert[]> {
    const docs = await this.model
      .find({ sentAt: null, notifyAt: { $lte: now } })
      .sort({ notifyAt: 1 })
      .limit(limit)
      .session(MongoUnitOfWork.currentSession())
      .lean<AlertDoc[]>()
      .exec();
    return docs.map((doc) => mapper.toDomain(doc));
  }

  async pendingForMember(userId: string, from: Date): Promise<Alert[]> {
    const docs = await this.model
      .find({ userId, sentAt: null, notifyAt: { $gte: from } })
      .sort({ notifyAt: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<AlertDoc[]>()
      .exec();
    return docs.map((doc) => mapper.toDomain(doc));
  }

  async upcomingForMember(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<Alert[]> {
    const docs = await this.model
      .find({ userId, sentAt: null, notifyAt: { $gte: from, $lt: to } })
      .sort({ notifyAt: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<AlertDoc[]>()
      .exec();
    return docs.map((doc) => mapper.toDomain(doc));
  }

  /**
   * The atomic take, and the reason this is a repository method.
   *
   * `findOneAndUpdate` filtered on `claimedAt: null` is **one** round trip that
   * both matches and writes. Two sweeps running at once therefore have exactly
   * one winner: the loser's filter no longer matches and it gets null back.
   *
   * Loading the row, checking `claimedAt` in the handler and saving would let
   * both sweeps pass the check before either wrote, and the member would get
   * the same notification twice. That is not a theoretical race — the sweep
   * runs on a five-minute cron and a slow batch overlaps the next tick.
   *
   * Deliberately *not* in the caller's transaction. A claim has to be visible
   * to the other sweep the instant it happens; inside an uncommitted
   * transaction it would not be, and both would proceed.
   */
  async claim(id: string, at: Date): Promise<Alert | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), claimedAt: null, sentAt: null },
        { $set: { claimedAt: at, updatedAt: at } },
        { returnDocument: 'after' },
      )
      .lean<AlertDoc>()
      .exec();
    return doc ? mapper.toDomain(doc) : null;
  }

  async expiredUnsent(before: Date, limit: number): Promise<Alert[]> {
    const docs = await this.model
      .find({ sentAt: null, notifyAt: { $lt: before } })
      .sort({ notifyAt: 1 })
      .limit(limit)
      .session(MongoUnitOfWork.currentSession())
      .lean<AlertDoc[]>()
      .exec();
    return docs.map((doc) => mapper.toDomain(doc));
  }

  async removeAllFor(userId: string): Promise<number> {
    const result = await this.model
      .deleteMany(
        { userId },
        { session: MongoUnitOfWork.currentSession() ?? undefined },
      )
      .exec();
    return result.deletedCount;
  }
}

class InnerAlertRepository extends MongoRepositoryBase<Alert, AlertDoc> {
  protected readonly mapper = mapper;

  constructor(
    protected readonly model: Model<AlertDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

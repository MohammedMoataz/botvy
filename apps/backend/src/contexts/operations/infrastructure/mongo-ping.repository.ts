import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import {
  MongoRepositoryBase,
  type OutboxInsert,
} from '../../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../../shared/persistence/mongo/mongo-unit-of-work.js';
import type { Mapper } from '../../../shared/persistence/ports/mapper.js';
import { Ping, PingRepository } from '../domain/ping.aggregate.js';

/** The `pings` document. `_id` is only read back; the base writes it from the filter. */
export interface PingDoc {
  _id?: string;
  userId: string;
  clientId: string;
  at: Date;
  updatedAt: Date;
  schemaVersion: number;
}

export const pingMapper: Mapper<Ping, PingDoc> = {
  toDomain: (doc) =>
    Ping.rehydrate(String(doc._id), doc.userId, doc.clientId, doc.at, doc.updatedAt),
  toPersistence: (ping) => ({
    userId: ping.userId,
    clientId: ping.clientId,
    at: ping.at,
    updatedAt: ping.updatedAt,
    schemaVersion: ping.schemaVersion,
  }),
};

/**
 * The demonstration slice's Mongo adapter. It exists to prove the path the
 * base class carries — aggregate write and outbox append in one transaction —
 * with the smallest aggregate there is.
 */
@Injectable()
export class MongoPingRepository extends MongoRepositoryBase<Ping, PingDoc> implements PingRepository {
  protected readonly mapper = pingMapper;

  constructor(
    protected readonly model: Model<PingDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }

  async findByClientId(userId: string, clientId: string): Promise<Ping | null> {
    const session = MongoUnitOfWork.currentSession();
    const doc = await this.model.findOne({ userId, clientId }).session(session).lean<PingDoc>().exec();
    return doc ? this.mapper.toDomain(doc) : null;
  }
}

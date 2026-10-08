import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import {
  ProposalRepository,
  type Proposal,
} from '../domain/proposal.repository.js';

/**
 * The stored proposal. Not written through `MongoRepositoryBase`: a proposal
 * is created once and then only ever moves state by one atomic
 * `findOneAndUpdate`, so there is no aggregate and no lost update to guard
 * with an optimistic filter — the `status: 'open'` in the filter is the guard.
 * The schema still declares `updatedAt` and `version`, which keeps it inside
 * `schemas.spec.ts`'s rule rather than on its exemption list.
 */
export interface ProposalDoc extends Omit<Proposal, 'id'> {
  _id: string;
  version: number;
  schemaVersion: number;
}

function toDomain(doc: ProposalDoc): Proposal {
  return {
    id: doc._id,
    userId: doc.userId,
    conversationId: doc.conversationId,
    action: doc.action,
    item: doc.item,
    change: doc.change,
    arabic: doc.arabic,
    timezone: doc.timezone,
    status: doc.status,
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

@Injectable()
export class MongoProposalRepository extends ProposalRepository {
  constructor(private readonly model: Model<ProposalDoc>) {
    super();
  }

  async create(proposal: Proposal): Promise<void> {
    const { id, ...rest } = proposal;
    await this.model.create({ _id: id, ...rest, version: 1, schemaVersion: 1 });
  }

  async find(userId: string, id: string): Promise<Proposal | null> {
    const doc = await this.model
      .findOne({ _id: id, userId })
      .lean<ProposalDoc>()
      .exec();
    return doc ? toDomain(doc) : null;
  }

  async claim(userId: string, id: string, now: Date): Promise<Proposal | null> {
    return this.move(userId, id, now, 'applied');
  }

  async decline(
    userId: string,
    id: string,
    now: Date,
  ): Promise<Proposal | null> {
    return this.move(userId, id, now, 'declined');
  }

  async openIn(
    userId: string,
    conversationId: string,
    now: Date,
  ): Promise<Proposal | null> {
    const doc = await this.model
      .findOne({
        userId,
        conversationId,
        status: 'open',
        expiresAt: { $gt: now },
      })
      .sort({ createdAt: -1 })
      .lean<ProposalDoc>()
      .exec();
    return doc ? toDomain(doc) : null;
  }

  async removeAllFor(userId: string): Promise<number> {
    const result = await this.model.deleteMany({ userId }).exec();
    return result.deletedCount ?? 0;
  }

  private async move(
    userId: string,
    id: string,
    now: Date,
    status: 'applied' | 'declined',
  ): Promise<Proposal | null> {
    const doc = await this.model
      .findOneAndUpdate(
        { _id: id, userId, status: 'open', expiresAt: { $gt: now } },
        { $set: { status, updatedAt: now }, $inc: { version: 1 } },
        { new: true },
      )
      .lean<ProposalDoc>()
      .exec();
    return doc ? toDomain(doc) : null;
  }
}

import { Injectable } from '@nestjs/common';
import { Types, type Model } from 'mongoose';
import { MongoUnitOfWork } from '../../../shared/persistence/mongo/mongo-unit-of-work.js';
import {
  AuditReadRepository,
  type AuditFilter,
  type AuditPage,
  type AuditRecord,
} from '../domain/audit.repository.js';

/**
 * Reading `audit_log` (P10, FR-005).
 *
 * The writer next door goes through the model directly and so does this, for
 * the reason `schemas.spec.ts` records as an exemption: there is no aggregate
 * here and no row that is ever written twice, so `MongoRepositoryBase` — whose
 * whole job is an optimistic save — has nothing to offer.
 *
 * ## One extra row, and that is the whole of the paging
 *
 * `first + 1` is asked for and the extra is dropped. It answers `hasNextPage`
 * without a `countDocuments` over a collection that only grows, and it cannot
 * be wrong the way a count can: a count taken before the page is read is a
 * claim about a collection that is being appended to while the Owner reads it.
 */
@Injectable()
export class MongoAuditReadRepository extends AuditReadRepository {
  constructor(private readonly model: Model<Record<string, unknown>>) {
    super();
  }

  async list(filter: AuditFilter): Promise<AuditPage> {
    const query: Record<string, unknown> = {};

    if (filter.actor) query['actor.id'] = filter.actor;
    if (filter.action) query.action = filter.action;
    if (filter.targetType) query['target.type'] = filter.targetType;

    if (filter.from || filter.to) {
      const at: Record<string, unknown> = {};
      if (filter.from) at.$gte = filter.from;
      // Exclusive, matching every other range in this codebase: a row stamped
      // exactly on the boundary belongs to the next window, and an audit page
      // that showed it in both would be two answers to one question.
      if (filter.to) at.$lt = filter.to;
      query.at = at;
    }

    /*
     * The cursor is the `_id` of the last row of the previous page, and the
     * comparison is `$lt` because the sort is newest first.
     *
     * An ObjectId rather than a timestamp, because two acts in the same
     * millisecond are ordinary here — banning a member writes the ban and ends
     * their sessions — and a timestamp cursor would either repeat one of them
     * or skip it.
     */
    if (filter.after && Types.ObjectId.isValid(filter.after)) {
      query._id = { $lt: new Types.ObjectId(filter.after) };
    }

    const wanted = Math.max(1, Math.min(filter.first, 200));
    const docs = await this.model
      .find(query)
      .sort({ _id: -1 })
      .limit(wanted + 1)
      .session(MongoUnitOfWork.currentSession())
      .lean<Array<Record<string, unknown>>>()
      .exec();

    const hasNextPage = docs.length > wanted;
    const page = docs.slice(0, wanted);

    return {
      rows: page.map(asRecord),
      endCursor: page.length ? String(page[page.length - 1]!._id) : null,
      hasNextPage,
    };
  }
}

/**
 * A stored row, as the port describes it.
 *
 * `actor` is `Schema.Types.Mixed` — it is whatever `Principal` was — so the two
 * fields the screen needs are read defensively rather than trusted: a service
 * principal has no `email`, and a row written by an older build may have a
 * shape this one has never seen. An audit page that threw on one odd row would
 * hide every row around it.
 */
function asRecord(doc: Record<string, unknown>): AuditRecord {
  const actor = (doc.actor ?? {}) as { type?: unknown; id?: unknown };
  const target = (doc.target ?? {}) as { type?: unknown; id?: unknown };

  return {
    id: String(doc._id),
    at: doc.at instanceof Date ? doc.at : new Date(String(doc.at)),
    actorType: typeof actor.type === 'string' ? actor.type : 'unknown',
    actorId: typeof actor.id === 'string' ? actor.id : '',
    action: typeof doc.action === 'string' ? doc.action : 'unknown',
    targetType: typeof target.type === 'string' ? target.type : 'unknown',
    targetId: typeof target.id === 'string' ? target.id : null,
    meta: (doc.meta ?? null) as Record<string, unknown> | null,
  };
}

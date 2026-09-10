import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import { MongoUnitOfWork } from '../../../shared/persistence/mongo/mongo-unit-of-work.js';
import { UsageRepository, type UsageRow } from '../domain/usage.repository.js';

/**
 * `usage_log` against MongoDB, using the model directly.
 *
 * **Not** through `MongoRepositoryBase`, and that is a decision on the record
 * rather than an omission: the base exists to save an aggregate under an
 * optimistic filter on `updatedAt`, and there is no aggregate here and no row
 * that is ever written twice. `schemas.spec.ts` carries the same reason as an
 * explicit exemption, so a future reader who wonders why this collection is
 * different finds one answer in two places rather than a silence. The audit
 * adapter next door is built the same way for the same reason.
 *
 * It still honours an ambient session, like `MongoAuditAdapter` does, so that a
 * caller who happens to be inside a unit of work gets its row committed with
 * everything else rather than half a step ahead of it. Nothing in this phase
 * calls `append` from inside a transaction — the relay dispatches the handler on
 * its own — but a write that ignores a session it could have joined is the kind
 * of thing that only shows up as a phantom row after a rollback.
 */
@Injectable()
export class MongoUsageRepository extends UsageRepository {
  constructor(private readonly model: Model<Record<string, unknown>>) {
    super();
  }

  /**
   * Insert, and treat the unique index's own complaint as the answer.
   *
   * Two candidate designs, and this is the one that ships:
   *
   * 1. `insertOne` + swallow `E11000` — one round trip, and the arbiter is the
   *    `usage_log_event_unique` index declared in the migration.
   * 2. `updateOne({ eventId }, { $setOnInsert: … }, { upsert: true })`.
   *
   * (2) looks tidier and is not. An upsert is a match followed by an insert, so
   * two concurrent deliveries of the same event can both miss the match and
   * both attempt the insert — and the one that loses gets `E11000` anyway. The
   * catch is unavoidable either way, so the version that needs no read is the
   * smaller one; and `$setOnInsert` would additionally hand a maintainer a
   * document shape they could mistake for an updatable row, which is precisely
   * what this collection is not.
   *
   * This is not belt-and-braces with the handler's own guard: the handler does
   * not have one, and could not have a reliable one. Two relay workers, or a
   * retry after a crash between the send and the ack, race past any read-then-
   * write check in application code. The index is the only place the uniqueness
   * can actually be enforced, so it is the only place it is enforced.
   */
  async append(row: UsageRow): Promise<'appended' | 'already-recorded'> {
    const session = MongoUnitOfWork.currentSession();
    try {
      await this.model.create([{ ...row }], session ? { session } : {});
      return 'appended';
    } catch (error) {
      if (isDuplicateKey(error)) return 'already-recorded';
      throw error;
    }
  }

  /**
   * Summed in the database, not in this process.
   *
   * A member on the default 120000-token allowance can produce a few hundred
   * rows a day and the retention is ninety of them, so loading the window and
   * adding it up here would be tolerable today and quietly stop being so. The
   * aggregation reads the `{ userId, createdAt }` index and returns one number,
   * which is all step 0 of a turn wants — and step 0 is on the latency path the
   * phase measures against SC-001, so it does not get to page a collection.
   *
   * `$gte` / `$lt`: see the port. `to` is tomorrow's midnight and belongs to
   * tomorrow.
   */
  async tokensBetween(userId: string, from: Date, to: Date): Promise<number> {
    const rows = await this.model
      .aggregate<{ total: number }>([
        { $match: { userId, createdAt: { $gte: from, $lt: to } } },
        {
          $group: {
            _id: null,
            total: {
              $sum: { $add: ['$promptTokens', '$completionTokens'] },
            },
          },
        },
      ])
      .exec();

    // No rows in the window is not an error and not a missing value: a member
    // who has not spoken today has spent nothing.
    return rows[0]?.total ?? 0;
  }

  async removeAllFor(userId: string): Promise<number> {
    const result = await this.model.deleteMany({ userId }).exec();
    return result.deletedCount ?? 0;
  }
}

/**
 * Mongo's way of saying it. The driver sets `code` 11000; the in-memory twin
 * never raises it, because it enforces the same rule by looking in a `Set` —
 * which is why the branch above is covered by the Mongo path alone and is
 * written to be obviously right rather than proven by a unit test.
 */
function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === 11_000
  );
}

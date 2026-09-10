import { Injectable } from '@nestjs/common';
import { UsageRepository, type UsageRow } from '../domain/usage.repository.js';

/**
 * The adapter the usage specs bind.
 *
 * Two promises, and both are about matching the Mongo adapter's *predicates*
 * rather than its mechanism:
 *
 * - `append` refuses a second row for an `eventId` it already holds. Mongo gets
 *   that from a unique index and this gets it from a `Set`; what matters is that
 *   the observable answer — `'already-recorded'`, and no new row — is the same,
 *   because a spec that proved idempotence only against an adapter that could
 *   not enforce it would prove nothing about production.
 * - `tokensBetween` uses the same half-open `[from, to)` comparison. An
 *   in-memory adapter that closed the interval would pass a test the real one
 *   fails on the single row stamped exactly at midnight, which is the one row
 *   the quota spec cares about.
 */
@Injectable()
export class InMemoryUsageRepository extends UsageRepository {
  readonly rows: UsageRow[] = [];
  private readonly seen = new Set<string>();

  async append(row: UsageRow): Promise<'appended' | 'already-recorded'> {
    if (this.seen.has(row.eventId)) return 'already-recorded';
    this.seen.add(row.eventId);
    this.rows.push({ ...row });
    return 'appended';
  }

  async tokensBetween(userId: string, from: Date, to: Date): Promise<number> {
    return this.rows
      .filter(
        (row) =>
          row.userId === userId &&
          row.createdAt.getTime() >= from.getTime() &&
          row.createdAt.getTime() < to.getTime(),
      )
      .reduce(
        (total, row) => total + row.promptTokens + row.completionTokens,
        0,
      );
  }

  async removeAllFor(userId: string): Promise<number> {
    const before = this.rows.length;
    for (let i = this.rows.length - 1; i >= 0; i -= 1) {
      const row = this.rows[i]!;
      if (row.userId !== userId) continue;
      // The `eventId` goes with the row. Keeping it would make a member's
      // deletion permanent in a way nothing asked for: if the same event were
      // ever replayed for a re-registered member it must be able to write
      // again, and more to the point a purge that leaves a shadow behind is not
      // a purge. Mongo's `deleteMany` has no shadow to leave, so the twin must
      // not have one either.
      this.seen.delete(row.eventId);
      this.rows.splice(i, 1);
    }
    return before - this.rows.length;
  }
}

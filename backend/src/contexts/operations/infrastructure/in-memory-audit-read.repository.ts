import { Injectable } from '@nestjs/common';
import {
  AuditReadRepository,
  type AuditFilter,
  type AuditPage,
  type AuditRecord,
} from '../domain/audit.repository.js';

/**
 * The adapter the audit specs bind.
 *
 * It keeps the three promises the Mongo one makes, because a spec that proved
 * paging against an adapter with different boundaries would prove nothing:
 *
 * - **Newest first**, ordered by the insertion sequence rather than by `at`,
 *   which is what ordering by `_id` does. Two acts in one millisecond are
 *   ordinary — banning a member writes the ban and ends the sessions — and a
 *   timestamp order would leave their relative position undefined.
 * - **`[from, to)`**, half-open, so a row stamped exactly on the boundary
 *   belongs to the next window and appears on one page only.
 * - **`first + 1`** to decide `hasNextPage`, rather than a count.
 */
@Injectable()
export class InMemoryAuditReadRepository extends AuditReadRepository {
  readonly rows: AuditRecord[] = [];
  #sequence = 0;

  /** Append a row the way the writer would, minting the id the store would. */
  add(row: Omit<AuditRecord, 'id'>): AuditRecord {
    this.#sequence += 1;
    const stored: AuditRecord = {
      ...row,
      // Zero-padded so a string comparison and the insertion order agree, which
      // is what an ObjectId gives the real adapter.
      id: String(this.#sequence).padStart(12, '0'),
    };
    this.rows.push(stored);
    return stored;
  }

  async list(filter: AuditFilter): Promise<AuditPage> {
    const matching = this.rows
      .filter((row) => !filter.actor || row.actorId === filter.actor)
      .filter((row) => !filter.action || row.action === filter.action)
      .filter((row) => !filter.targetType || row.targetType === filter.targetType)
      .filter((row) => !filter.from || row.at.getTime() >= filter.from.getTime())
      .filter((row) => !filter.to || row.at.getTime() < filter.to.getTime())
      .sort((a, b) => b.id.localeCompare(a.id));

    const after = filter.after
      ? matching.findIndex((row) => row.id === filter.after)
      : -1;
    const start = after >= 0 ? after + 1 : 0;

    const wanted = Math.max(1, Math.min(filter.first, 200));
    const page = matching.slice(start, start + wanted);

    return {
      rows: page,
      endCursor: page.length ? page[page.length - 1]!.id : null,
      hasNextPage: matching.length > start + page.length,
    };
  }
}

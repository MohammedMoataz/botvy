/**
 * One recorded act, as the Owner reads it back.
 *
 * The shape the store holds, not the shape the screen draws: `actorLabel` — the
 * name beside the id — is assembled by the query handler from Identity's
 * published read, because Operations owns this collection and knows nothing
 * about who anybody is.
 */
export interface AuditRecord {
  id: string;
  at: Date;
  actorType: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  meta: Record<string, unknown> | null;
}

export interface AuditFilter {
  /** One actor's acts. The principal's id, whichever kind of principal it is. */
  actor?: string | null;
  action?: string | null;
  targetType?: string | null;
  from?: Date | null;
  to?: Date | null;
  first: number;
  /** The `_id` of the last row of the previous page. */
  after?: string | null;
}

export interface AuditPage {
  rows: AuditRecord[];
  /** The cursor to ask for the next page with, or null at the end. */
  endCursor: string | null;
  hasNextPage: boolean;
}

/**
 * Reading the administrative trail (P10, FR-005).
 *
 * A **separate port from `AuditPort`**, which writes, and the split is not
 * ceremony: `AuditPort` lives in `shared/` because four consumers across three
 * contexts record acts through it, and giving that shared token a `list` method
 * would hand every one of them a way to read the whole trail. The reader is
 * Operations' alone — it owns `audit_log` — so it is declared here, in the
 * context whose screen shows it.
 *
 * Append-only on both sides. There is no `update` and no `delete` here for the
 * same reason there is none there: a record that can be edited is not a record.
 *
 * ## Paged by `_id`, not by a skip
 *
 * `_id` is an ObjectId, which is monotonic enough to page by and stable under
 * writes — and rows arrive while the Owner is reading. A `skip` over a
 * collection that is being appended to shows the same row twice and hides
 * another, which for an audit trail is the one failure that matters: the page
 * that quietly omits an act.
 */
export abstract class AuditReadRepository {
  abstract list(filter: AuditFilter): Promise<AuditPage>;
}

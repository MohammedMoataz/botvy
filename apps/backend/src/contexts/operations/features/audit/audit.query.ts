import { Injectable } from '@nestjs/common';
import {
  AuditReadRepository,
  type AuditFilter,
} from '../../domain/audit.repository.js';

export interface AuditEntryView {
  id: string;
  at: Date;
  actorType: string;
  actorId: string;
  /**
   * Who that was, in words.
   *
   * The address for a member, the client's name for a service, and the id
   * itself when neither can be found — a deleted member's acts stay in the
   * trail, which is the point of a trail, and rendering them as a bare uuid
   * would make the one page that answers "who did this" unable to.
   */
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string | null;
  meta: Record<string, unknown> | null;
}

export interface AuditConnectionView {
  nodes: AuditEntryView[];
  endCursor: string | null;
  hasNextPage: boolean;
}

/**
 * Putting a name to a principal id.
 *
 * Declared by the context that needs the answer — this one — and bound in its
 * own `infrastructure/` to Identity's published reads. Operations may not open
 * `users`, and a trail that could not name anybody would be a trail nobody
 * reads.
 *
 * A map rather than a list, and ids that cannot be found are simply absent:
 * a deleted member is the ordinary case here, not an error.
 */
export abstract class ActorLabelPort {
  abstract labelsFor(ids: string[]): Promise<Record<string, string>>;
}

/*
 * Declared **above** the handler that takes it, and that is not a style choice.
 *
 * `emitDecoratorMetadata` writes the constructor's parameter types into a
 * `design:paramtypes` array that is evaluated when the class is defined — so a
 * class token declared further down the same module is read inside its own
 * temporal dead zone and the module throws `Cannot access 'ActorLabelPort'
 * before initialization` on import. It is a runtime failure that no typecheck
 * sees, and the whole file fails to load rather than one call failing.
 */

/**
 * Who did what, and when (P10, FR-005, T1002).
 *
 * ## The label is assembled here, not stored
 *
 * `audit_log` holds the principal as it was at the time — a type and an id —
 * and nothing else, deliberately: a row that also stored the actor's name would
 * be a copy that goes stale the moment they change their address, and an audit
 * trail whose actor column disagrees with the member list is worse than one
 * that shows an id. So the name is looked up when the page is drawn, through
 * Identity's published read, and falls back to the id when the account is gone.
 *
 * ## Resolved in one query for the page, never one per row
 *
 * Fifty rows are typically a handful of distinct actors — an Owner and a
 * service client — so the ids are collected, asked for once, and mapped back.
 * A lookup per row is the shape that makes an audit page slow exactly when it
 * matters, which is when somebody is investigating something.
 */
@Injectable()
export class AuditQueryHandler {
  constructor(
    private readonly audit: AuditReadRepository,
    private readonly labels: ActorLabelPort,
  ) {}

  async list(filter: AuditFilter): Promise<AuditConnectionView> {
    const page = await this.audit.list(filter);

    const ids = [...new Set(page.rows.map((row) => row.actorId).filter(Boolean))];
    const labels = ids.length ? await this.labels.labelsFor(ids) : {};

    return {
      nodes: page.rows.map((row) => ({
        ...row,
        actorLabel: labels[row.actorId] ?? row.actorId,
      })),
      endCursor: page.endCursor,
      hasNextPage: page.hasNextPage,
    };
  }
}

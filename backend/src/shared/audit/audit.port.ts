import type { Principal } from '../auth/principal.js';

export interface AuditEntry {
  actor: Principal;
  action: string;
  target: { type: string; id: string | null };
  at: Date;
  meta?: Record<string, unknown>;
}

/**
 * The administrative trail. One method, and deliberately no update or delete:
 * a record that can be edited is not a record. Every context that performs an
 * administrative action writes through this rather than growing a collection of
 * its own, so "what happened to this account" is answerable from one place.
 *
 * It lives in the shared kernel rather than in Operations, and the move is the
 * point. The port was declared in `contexts/operations/domain/`, and Identity's
 * role change, ban, password change and service-client commands all imported it
 * from there — a context reaching into another context's domain, which is what
 * constitution IX forbids and what made the module graph unresolvable when
 * Operations imported Identity back. `shared/settings` writes through it too.
 *
 * Four consumers in three contexts is the constitution's own test for a shared
 * helper: duplicate over share, and move it on the third copy. This is past the
 * third.
 *
 * The store stays Operations'. `MongoAuditAdapter` is in
 * `contexts/operations/infrastructure/`, because the `audit_log` collection
 * belongs to the context the blueprint gives it to — what moved is where the
 * *contract* is declared, not who owns the data.
 */
export abstract class AuditPort {
  abstract record(entry: AuditEntry): Promise<void>;
}

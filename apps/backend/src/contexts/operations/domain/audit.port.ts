import type { Principal } from '../../../shared/auth/principal.js';

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
 * P0 writes one row itself, the settings patch. The port ships now because P1's
 * role change, ban and password change all write here, and a port introduced in
 * P1 would mean P1 owning a collection the blueprint gives to Operations.
 */
export abstract class AuditPort {
  abstract record(entry: AuditEntry): Promise<void>;
}

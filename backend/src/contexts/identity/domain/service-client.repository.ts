/** A machine caller: n8n today, anything the Owner registers later. */
export interface ServiceClient {
  id: string;
  name: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface ServiceClientUpsert {
  name: string;
  tokenHash: string;
  scopes: string[];
}

/**
 * Service clients. The guard verifies a presented token against the stored
 * hash through this port rather than reading the table, so the one context that
 * owns PostgreSQL stays the one context that opens it.
 */
export abstract class ServiceClientRepository {
  abstract findByName(name: string): Promise<ServiceClient | null>;

  /**
   * Idempotent by name. A changed `INTERNAL_SERVICE_TOKEN` rotates the hash on
   * the existing row rather than leaving a second client with the same name and
   * an old secret still valid.
   */
  abstract upsert(client: ServiceClientUpsert): Promise<ServiceClient>;

  /**
   * Returns the client whose stored hash matches, or null. The comparison is
   * constant-time in the adapter: a timing difference on a token check is a way
   * to guess the token one byte at a time.
   */
  abstract verifyToken(
    presentedTokenHash: string,
  ): Promise<ServiceClient | null>;

  abstract touch(id: string, at: Date): Promise<void>;

  /** Every client, for the portal's listing. Never carries the token hash. */
  abstract listAll(): Promise<ServiceClient[]>;

  /**
   * Revokes rather than deletes. A deleted row loses the audit trail's target
   * and makes "which client was that?" unanswerable six months later; a revoked
   * one is refused by the guard and still nameable.
   */
  abstract revoke(id: string): Promise<boolean>;
}

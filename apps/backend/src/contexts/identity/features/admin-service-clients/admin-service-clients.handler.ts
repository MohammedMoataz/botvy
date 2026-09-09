import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { Principal } from '../../../../shared/auth/principal.js';
import { hashToken } from '../../../../shared/auth/service-token.guard.js';
import { AuditPort } from '../../../operations/domain/audit.port.js';
import { ServiceClientRepository } from '../../domain/service-client.repository.js';

export class ServiceClientNotFound extends Error {
  constructor() {
    super('no such service client');
  }
}

export class ServiceClientNameTaken extends Error {
  constructor(name: string) {
    super(`a service client named ${name} already exists`);
  }
}

export interface CreatedServiceClient {
  id: string;
  name: string;
  scopes: string[];
  /**
   * The only time this is ever returned. It is hashed at rest, so nothing —
   * not this API, not the portal, not the Owner — can read it back afterwards.
   */
  secret: string;
}

/**
 * Registering and revoking machine callers.
 *
 * The secret is 32 random bytes shown once. Storing it recoverably would mean a
 * database dump hands over every integration's credentials, and offering a
 * "show secret" button later is the same mistake with a nicer name — so the
 * portal has to make the one-time display obvious, and a lost secret is
 * replaced by rotating rather than recovered.
 *
 * Both actions write an `audit_log` row through Operations' port. A machine
 * credential appearing or disappearing is exactly the kind of change an Owner
 * needs to be able to find afterwards.
 */
@Injectable()
export class AdminServiceClientsHandler {
  private readonly logger = new Logger(AdminServiceClientsHandler.name);

  constructor(
    private readonly clients: ServiceClientRepository,
    private readonly audit: AuditPort,
  ) {}

  async create(
    actor: Principal,
    name: string,
    scopes: string[],
  ): Promise<CreatedServiceClient> {
    const trimmed = name.trim();

    // Refused rather than rotated. `upsert` is what the *seed* wants, so a
    // changed INTERNAL_SERVICE_TOKEN updates its own row — but an admin
    // creating a client that silently replaced an existing one's secret would
    // break whichever integration held it, with nothing to say why.
    if (await this.clients.findByName(trimmed)) throw new ServiceClientNameTaken(trimmed);

    const secret = randomBytes(32).toString('base64url');
    const client = await this.clients.upsert({
      name: trimmed,
      tokenHash: hashToken(secret),
      scopes,
    });

    await this.audit.record({
      actor,
      action: 'admin.createServiceClient',
      target: { type: 'service_client', id: client.id },
      at: new Date(),
      // The scopes, never the secret. An audit row is read by more people than
      // the response is.
      meta: { name: trimmed, scopes },
    });

    this.logger.log(`service client ${trimmed} created by ${actor.id}`);
    return { id: client.id, name: client.name, scopes: client.scopes, secret };
  }

  async revoke(actor: Principal, name: string): Promise<{ id: string; revoked: true }> {
    const existing = await this.clients.findByName(name.trim());
    if (!existing || existing.revokedAt !== null) throw new ServiceClientNotFound();

    await this.clients.revoke(existing.id);

    await this.audit.record({
      actor,
      action: 'admin.revokeServiceClient',
      target: { type: 'service_client', id: existing.id },
      at: new Date(),
      meta: { name: existing.name },
    });

    this.logger.log(`service client ${existing.name} revoked by ${actor.id}`);
    return { id: existing.id, revoked: true };
  }

  /** The listing. Never carries a hash, let alone a secret. */
  async list(): Promise<
    Array<{
      id: string;
      name: string;
      scopes: string[];
      createdAt: Date;
      lastUsedAt: Date | null;
      revokedAt: Date | null;
    }>
  > {
    return (await this.clients.listAll()).map((client) => ({
      id: client.id,
      name: client.name,
      scopes: client.scopes,
      createdAt: client.createdAt,
      lastUsedAt: client.lastUsedAt,
      revokedAt: client.revokedAt,
    }));
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { hashToken } from '../../../../shared/auth/service-token.guard.js';
import { ServiceClientRepository } from '../../domain/service-client.repository.js';

/** Everything the committed workflows need and nothing more. */
export const N8N_SCOPES = [
  'internal:alerts',
  'internal:sweep',
  'internal:tick',
  'internal:ingest',
  'internal:ops',
] as const;

export const N8N_CLIENT_NAME = 'n8n';

/**
 * Creates the `n8n` service client at boot, from `INTERNAL_SERVICE_TOKEN`.
 *
 * The backend does this rather than the bootstrap script, and that is a
 * constitutional point rather than a convenience: an outside process writing a
 * store the API owns is exactly what principle I forbids, and P0 has no admin
 * sign-in through which the blueprint's create-service-client command could be
 * called. So the seed runs here, beside the admin seed, before the first
 * request can arrive; `bootstrap.mjs` only verifies that it answers.
 *
 * Idempotent by name. A changed token rotates the hash on the row that is
 * already there — leaving a second client with the same name and an old secret
 * still valid would mean revoking a credential had no effect.
 */
@Injectable()
export class ServiceClientSeedService {
  private readonly logger = new Logger(ServiceClientSeedService.name);

  constructor(private readonly clients: ServiceClientRepository) {}

  async seed(
    internalServiceToken: string,
  ): Promise<'created' | 'rotated' | 'unchanged'> {
    const tokenHash = hashToken(internalServiceToken);
    const existing = await this.clients.findByName(N8N_CLIENT_NAME);

    // Asked before the upsert, not after. Afterwards the stored hash is the new
    // one by definition, so the comparison would always read as unchanged and
    // a rotation would go unreported.
    const alreadyMatches =
      existing !== null &&
      (await this.clients.verifyToken(tokenHash))?.name === N8N_CLIENT_NAME;

    await this.clients.upsert({
      name: N8N_CLIENT_NAME,
      tokenHash,
      scopes: [...N8N_SCOPES],
    });

    if (!existing) {
      this.logger.log(`Seeded the ${N8N_CLIENT_NAME} service client.`);
      return 'created';
    }
    if (!alreadyMatches) {
      this.logger.log(`Rotated the ${N8N_CLIENT_NAME} service token.`);
      return 'rotated';
    }
    return 'unchanged';
  }
}

import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ENV } from '../../../../shared/config/config.module.js';
import type { Env } from '../../../../shared/config/env.schema.js';
import { AdminPasswordFlagHandler } from '../../../operations/features/admin-password-flag/admin-password-flag.handler.js';
import { AdminSeedService } from './admin-seed.service.js';
import { ServiceClientSeedService } from './service-client-seed.service.js';

/**
 * Runs the two seeds when the backend starts: the administrator the Owner
 * first signs in with, and the `n8n` service client whose token is
 * INTERNAL_SERVICE_TOKEN. Both are idempotent, so a restart changes nothing.
 *
 * Backend role only. The worker shares the image and the module, and two
 * processes seeding the same rows at the same moment is a race nobody needs.
 * Generation mode has no store and skips too.
 */
@Injectable()
export class IdentityBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(IdentityBootstrap.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly admin: AdminSeedService,
    private readonly serviceClients: ServiceClientSeedService,
    private readonly passwordFlag: AdminPasswordFlagHandler,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.BOTVY_GEN || this.env.BOTVY_ROLE !== 'backend') return;

    const outcome = await this.admin.seed(this.env.ADMIN_EMAIL, this.env.ADMIN_PASSWORD);
    this.logger.log(`administrator seed: ${outcome}`);

    const stillDefault = await this.admin.isStillDefault(
      this.env.ADMIN_EMAIL,
      this.env.ADMIN_PASSWORD,
    );
    this.admin.warnIfDefault(this.env.ADMIN_EMAIL, stillDefault);
    // Recorded as well as logged. A boot log is not a warning anybody sees, and
    // the portal has to be able to say this on every page load.
    await this.passwordFlag.record(stillDefault);

    const client = await this.serviceClients.seed(this.env.INTERNAL_SERVICE_TOKEN);
    this.logger.log(`service client seed: ${client}`);
  }
}

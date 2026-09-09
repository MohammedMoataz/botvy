import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ENV } from '../../../../shared/config/config.module.js';
import type { Env } from '../../../../shared/config/env.schema.js';
import { AdminSeedService } from '../../../identity/features/seeds/admin-seed.service.js';
import { AdminPasswordFlagHandler } from './admin-password-flag.handler.js';

/**
 * Records at boot whether the seeded administrator still has its published
 * password.
 *
 * This lives in Operations, not in Identity's bootstrap, and the direction is
 * the whole reason. The flag is a registry key, the registry is Operations',
 * and `OperationsModule` already imports `IdentityModule` because the alert
 * path needs the devices query. So Operations asking Identity a question is the
 * permitted direction; Identity calling an Operations *feature handler* — which
 * is what it used to do — is the violation constitution IX describes, and it is
 * what made the module graph unresolvable.
 *
 * The ordering is guaranteed rather than hoped for: Nest initialises a module's
 * imports before the module itself, and `OperationsModule` imports
 * `IdentityModule`, so the administrator has been seeded by the time this runs.
 *
 * Backend role only. The worker shares the image and both modules, and two
 * processes writing the same key at the same moment is a race nobody needs.
 */
@Injectable()
export class OperationsBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(OperationsBootstrap.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly admin: AdminSeedService,
    private readonly flag: AdminPasswordFlagHandler,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.BOTVY_GEN || this.env.BOTVY_ROLE !== 'backend') return;

    try {
      const stillDefault = await this.admin.isStillDefault(
        this.env.ADMIN_EMAIL,
        this.env.ADMIN_PASSWORD,
      );
      await this.flag.record(stillDefault);
    } catch (error) {
      // A store that is not up yet must not stop the process starting: the
      // portal falls back to the registry default, which is `true`, so the
      // warning is shown rather than hidden.
      this.logger.warn(
        `could not record the default-password state: ${(error as Error).message}`,
      );
    }
  }
}

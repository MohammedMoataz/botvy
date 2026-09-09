import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ENV } from '../../../../shared/config/config.module.js';
import type { Env } from '../../../../shared/config/env.schema.js';
import {
  ADMIN_PASSWORD_PROBE,
} from '../../infrastructure/admin-password.probe.js';
import {
  AdminPasswordFlagHandler,
  type AdminPasswordProbe,
} from './admin-password-flag.handler.js';

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
 * It asks through a port. This file used to import `AdminSeedService` from
 * Identity's `features/` — the right direction reaching for the wrong thing,
 * because a feature service is private to its context. The adapter that knows
 * Identity exists is in `infrastructure/`, which is the layer for exactly that,
 * and `no-restricted-imports` now refuses the shortcut.
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
    @Inject(ADMIN_PASSWORD_PROBE) private readonly admin: AdminPasswordProbe,
    private readonly flag: AdminPasswordFlagHandler,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.BOTVY_GEN || this.env.BOTVY_ROLE !== 'backend') return;

    try {
      const stillDefault = await this.admin.isStillDefault();
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

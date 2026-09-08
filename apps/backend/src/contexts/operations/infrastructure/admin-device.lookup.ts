import { Inject, Injectable } from '@nestjs/common';
import { DevicesQueryHandler } from '../../identity/features/devices/devices.query.js';
import { UserRepository } from '../../identity/domain/user.repository.js';
import { ENV } from '../../../shared/config/config.module.js';
import type { Env } from '../../../shared/config/env.schema.js';
import type {
  AdminDeviceLookup,
  DeviceSummary,
} from '../features/internal-alerts/internal-alerts.handler.js';

export const ADMIN_DEVICE_LOOKUP = Symbol('ADMIN_DEVICE_LOOKUP');

/**
 * Which phones an operations alert reaches. Operations never opens Identity's
 * tables: it asks the DevicesQuery, which is the one door Identity leaves open.
 *
 * ponytail: the administrators are the seeded Owner, resolved by login. P1 adds
 * a role listing to the UserRepository and this becomes "every admin".
 */
@Injectable()
export class SeededAdminDeviceLookup implements AdminDeviceLookup {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly users: UserRepository,
    private readonly devices: DevicesQueryHandler,
  ) {}

  async adminDevices(): Promise<DeviceSummary[]> {
    const owner = await this.users.findByLogin(this.env.ADMIN_EMAIL);
    if (!owner) return [];
    return this.devices.forAdmins([owner.id]);
  }
}

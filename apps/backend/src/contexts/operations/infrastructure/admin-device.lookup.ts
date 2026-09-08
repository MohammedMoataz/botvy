import { Injectable } from '@nestjs/common';
import { DevicesQueryHandler } from '../../identity/features/devices/devices.query.js';
import type {
  AdminDeviceLookup,
  DeviceSummary,
} from '../features/internal-alerts/internal-alerts.handler.js';

export const ADMIN_DEVICE_LOOKUP = Symbol('ADMIN_DEVICE_LOOKUP');

/**
 * Which phones an operations alert reaches.
 *
 * One dependency, deliberately: Identity's device query and nothing else.
 * This class used to take Identity's `UserRepository` as well and call
 * `findByLogin` to find the Owner — a context reaching into another context's
 * store, under a comment that claimed it did not. Who the administrators are is
 * Identity's question, so Identity answers it; this is the adapter that binds
 * the answer to the port Operations declares.
 */
@Injectable()
export class SeededAdminDeviceLookup implements AdminDeviceLookup {
  constructor(private readonly devices: DevicesQueryHandler) {}

  async adminDevices(): Promise<DeviceSummary[]> {
    return this.devices.forAdministrators();
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../../../shared/config/config.module.js';
import type { Env } from '../../../../shared/config/env.schema.js';
import { DeviceRepository } from '../../domain/device.repository.js';
import { UserRepository } from '../../domain/user.repository.js';

export interface DeviceView {
  userId: string;
  deviceId: string;
  kind: string;
  pushToken: string | null;
  lastSeenAt: Date | null;
}

/**
 * The only way a context on the other store learns about a member's devices.
 *
 * It exists in P0 because internal-alerts already has to reach an
 * administrator's phone, and a Mongo context opening Identity's tables to find
 * one is precisely what principle I forbids. P2's notification sweep binds this
 * same query rather than growing a second one — two queries answering the same
 * question drift, and the one that drifts is the one nobody is testing.
 */
@Injectable()
export class DevicesQueryHandler {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly users: UserRepository,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Batched: the sweep asks about many members at once. */
  async forUsers(userIds: string[]): Promise<DeviceView[]> {
    if (userIds.length === 0) return [];
    const rows = await this.devices.listByUsers(userIds);
    return rows.map(toView);
  }

  async forUser(userId: string): Promise<DeviceView[]> {
    return (await this.devices.listByUser(userId)).map(toView);
  }

  /**
   * Every administrator's devices. Used by the alert path, which needs to reach
   * whoever runs this installation without knowing who that is.
   *
   * Identity resolves who the administrators are, and that is the point: the
   * caller used to be handed Identity's `UserRepository` and look the Owner up
   * itself, which is a context reading another context's store with a comment
   * above it claiming otherwise. Asking here keeps the one door one door.
   *
   * ponytail: the administrators are the seeded Owner, resolved by login. P1
   * adds a role listing and this becomes "every account with the admin role".
   */
  async forAdministrators(): Promise<DeviceView[]> {
    const owner = await this.users.findByLogin(this.env.ADMIN_EMAIL);
    if (!owner) return [];
    return this.forUsers([owner.id]);
  }

  /** Whether an account exists and may still be acted on. */
  async isActive(userId: string): Promise<boolean> {
    const user = await this.users.findById(userId, userId);
    return user?.isActive ?? false;
  }
}

function toView(row: {
  userId: string;
  id: string;
  kind: string;
  pushToken: string | null;
  lastSeenAt: Date | null;
}): DeviceView {
  return {
    userId: row.userId,
    deviceId: row.id,
    kind: row.kind,
    pushToken: row.pushToken,
    lastSeenAt: row.lastSeenAt,
  };
}

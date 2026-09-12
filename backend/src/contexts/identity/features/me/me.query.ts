import { Injectable } from '@nestjs/common';
import { UserRepository } from '../../domain/user.repository.js';
import { DevicesQueryHandler } from '../devices/devices.query.js';

export interface MeView {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  deviceCount: number;
}

/**
 * Who the caller is.
 *
 * The one query every surface runs first, and the reason it is a slice of its
 * own rather than a line in a resolver: `deviceCount` comes from the devices
 * query, and a resolver that reached into two repositories itself would be a
 * second place where "what a member looks like to themselves" is decided.
 *
 * A deleted account resolves to nothing even though the row is still there.
 * The row stays so the id keeps resolving for the contexts that hold it as a
 * plain string; the *member* is gone, and telling their own client otherwise
 * would show them an account they have deleted.
 */
@Injectable()
export class MeQueryHandler {
  constructor(
    private readonly users: UserRepository,
    private readonly devices: DevicesQueryHandler,
  ) {}

  async forUser(userId: string): Promise<MeView | null> {
    const user = await this.users.findById(userId, userId);
    if (!user || user.deletedAt !== null) return null;

    const devices = await this.devices.forUser(userId);

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      deviceCount: devices.length,
    };
  }
}

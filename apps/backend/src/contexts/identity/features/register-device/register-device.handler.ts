import { Injectable, Logger } from '@nestjs/common';
import { newId } from '../../../../shared/cqrs/ids.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { Device } from '../../domain/device.aggregate.js';
import {
  DeviceRepository,
  type DeviceKind,
} from '../../domain/device.repository.js';

export interface RegisterDeviceCommand {
  userId: string;
  installId: string;
  kind: DeviceKind;
  name?: string | null;
  pushToken?: string | null;
}

export interface RegisteredDevice {
  deviceId: string;
  created: boolean;
}

export class DeviceNotFound extends Error {
  constructor() {
    super('no such device');
  }
}

/**
 * Registers, or re-registers, one installation.
 *
 * Idempotent on `installId`, because the same call arriving twice is the normal
 * case: a phone registers on every launch, and it has no way to know whether the
 * first attempt reached the server. Creating a second row would give the member
 * two devices for one handset — and then two push notifications for every
 * reminder.
 *
 * An install id already held by a different member means the handset was handed
 * over or a second account signed in on it. The row moves rather than
 * duplicating: the old owner's alerts must stop going to a phone that is no
 * longer theirs.
 */
@Injectable()
export class RegisterDeviceHandler {
  private readonly logger = new Logger(RegisterDeviceHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly devices: DeviceRepository,
  ) {}

  async handle(
    command: RegisterDeviceCommand,
    at: Date = new Date(),
  ): Promise<RegisteredDevice> {
    // One transaction for the whole decision. The move branch below removes a
    // row and creates another, and a crash between them would take a member's
    // handset off the alert list without putting it back on anybody else's.
    return this.uow.run(() => this.decide(command, at));
  }

  private async decide(
    command: RegisterDeviceCommand,
    at: Date,
  ): Promise<RegisteredDevice> {
    const existing = await this.devices.findByInstallId(command.installId);

    if (existing && existing.userId === command.userId) {
      existing.reregister(
        {
          kind: command.kind,
          name: command.name,
          pushToken: command.pushToken,
        },
        at,
      );
      await this.devices.save(existing);
      return { deviceId: existing.id, created: false };
    }

    if (existing) {
      // Same handset, different member. Remove before creating, so the unique
      // index on `installId` does not refuse the new row — and so the previous
      // owner stops receiving alerts on it.
      this.logger.log(
        `install ${command.installId} moved from user ${existing.userId} to ${command.userId}`,
      );
      existing.remove(at);
      await this.devices.remove(existing);
    }

    const device = Device.register({
      id: newId(),
      userId: command.userId,
      installId: command.installId,
      kind: command.kind,
      name: command.name ?? null,
      pushToken: command.pushToken ?? null,
      lastSeenAt: at,
      createdAt: at,
    });
    await this.devices.save(device);
    return { deviceId: device.id, created: true };
  }

  /** Stamps a known install as seen, without changing anything else. */
  async seen(installId: string, at: Date = new Date()): Promise<string | null> {
    const device = await this.devices.findByInstallId(installId);
    if (!device) return null;

    device.seen(at);
    await this.uow.run(() => this.devices.save(device));
    return device.id;
  }

  async remove(
    userId: string,
    deviceId: string,
    at: Date = new Date(),
  ): Promise<void> {
    // Scoped to the member: removing another member's device is a 404, not a
    // 403, because whether it exists is not this caller's business.
    const device = await this.devices.findById(userId, deviceId);
    if (!device) throw new DeviceNotFound();

    device.remove(at);
    await this.uow.run(() => this.devices.remove(device));
  }
}

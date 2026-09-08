import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';
import type { DeviceKind } from './device.repository.js';

export interface DeviceState {
  id: string;
  userId: string;
  installId: string;
  kind: DeviceKind;
  name: string | null;
  pushToken: string | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One installation of one client.
 *
 * Identified by `installId`, which the client mints once and keeps — not by the
 * push token, which rotates, and not by a server id, which the client does not
 * have before its first call. Registering the same `installId` twice is the
 * normal case, not an error: a phone re-registers on every launch, and a
 * reinstall is a new install id.
 *
 * `lastSeenAt` is load-bearing beyond bookkeeping. The alert sweep skips a
 * device that has synced since an alert was planned, because that device already
 * holds its own local alarm — so a stamp that does not move causes a double
 * notification, and one that moves when it should not causes silence.
 */
export class Device extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  readonly installId: string;
  kind: DeviceKind;
  name: string | null;
  pushToken: string | null;
  lastSeenAt: Date | null;
  readonly createdAt: Date;

  private constructor(state: DeviceState) {
    super();
    this.id = state.id;
    this.userId = state.userId;
    this.installId = state.installId;
    this.kind = state.kind;
    this.name = state.name;
    this.pushToken = state.pushToken;
    this.lastSeenAt = state.lastSeenAt;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
  }

  static rehydrate(state: DeviceState): Device {
    return new Device(state);
  }

  static register(state: Omit<DeviceState, 'updatedAt'>): Device {
    const device = new Device({ ...state, updatedAt: state.createdAt });
    device.raise(
      'identity.DeviceRegistered',
      'device',
      { deviceId: state.id, kind: state.kind, hasPush: state.pushToken !== null },
      state.createdAt,
    );
    return device;
  }

  /**
   * A device that is already known, coming back. No event unless something the
   * consumers care about actually moved — a launch that changes nothing should
   * not wake the notification context.
   */
  reregister(
    changes: { kind?: DeviceKind; name?: string | null; pushToken?: string | null },
    at: Date = new Date(),
  ): void {
    const before = { kind: this.kind, name: this.name, pushToken: this.pushToken };

    if (changes.kind !== undefined) this.kind = changes.kind;
    if (changes.name !== undefined) this.name = changes.name;
    if (changes.pushToken !== undefined) this.pushToken = changes.pushToken;

    this.lastSeenAt = at;
    this.updatedAt = at;

    const pushChanged = before.pushToken !== this.pushToken;
    if (before.kind !== this.kind || pushChanged) {
      this.raise(
        'identity.DeviceRegistered',
        'device',
        { deviceId: this.id, kind: this.kind, hasPush: this.pushToken !== null },
        at,
      );
    }
  }

  seen(at: Date = new Date()): void {
    this.lastSeenAt = at;
    this.updatedAt = at;
  }

  remove(at: Date = new Date()): void {
    this.raise('identity.DeviceRemoved', 'device', { deviceId: this.id }, at);
  }
}

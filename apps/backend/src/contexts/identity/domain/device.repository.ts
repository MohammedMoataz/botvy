import type { Device as DeviceAggregate } from './device.aggregate.js';

export type DeviceKind = 'android' | 'ios' | 'chrome_extension' | 'web';

export interface Device {
  id: string;
  userId: string;
  installId: string;
  kind: DeviceKind;
  name: string | null;
  pushToken: string | null;
  lastSeenAt: Date | null;
}

/**
 * The device store. Read-only in P0, because internal-alerts already had to
 * reach an administrator's phone and a Mongo context reaching into Identity's
 * tables to find one is what principle I forbids. P1 adds the write side.
 *
 * `findByInstallId` is not scoped to a user, and that is deliberate: an install
 * id is unique across the table, so the lookup is how a re-registration is
 * recognised — including one arriving from an account that has since signed a
 * different member in on the same handset. The caller decides what to do about
 * that; the store's job is to find the row.
 */
export abstract class DeviceRepository {
  abstract listByUser(userId: string): Promise<Device[]>;

  /** Batched on purpose: the sweep asks about many members at once. */
  abstract listByUsers(userIds: string[]): Promise<Device[]>;

  abstract findById(
    userId: string,
    id: string,
  ): Promise<DeviceAggregate | null>;

  abstract findByInstallId(installId: string): Promise<DeviceAggregate | null>;

  /**
   * The device holding a particular push token, if any.
   *
   * Added for the notification sweep, which learns from FCM that a token is no
   * longer valid and knows nothing else about the device — the token is all the
   * push service reports. Identity clears it through the aggregate rather than
   * letting anybody write the column, so `DeviceUpdated` still goes out and the
   * alert saga still re-plans for a member who has just lost their push route.
   */
  abstract findByPushToken(token: string): Promise<DeviceAggregate | null>;

  abstract save(device: DeviceAggregate): Promise<void>;

  abstract remove(device: DeviceAggregate): Promise<void>;
}

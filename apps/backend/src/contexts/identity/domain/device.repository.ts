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
 * Read-only in P0 — registration arrives with P1. It exists this early because
 * the internal-alerts slice already has to reach an administrator's phone, and
 * a Mongo context reaching into Identity's tables to find one is exactly what
 * principle I forbids. P2's notification sweep binds the same query rather than
 * growing a second one.
 */
export abstract class DeviceRepository {
  abstract listByUser(userId: string): Promise<Device[]>;

  /** Batched on purpose: the sweep asks about many members at once. */
  abstract listByUsers(userIds: string[]): Promise<Device[]>;
}

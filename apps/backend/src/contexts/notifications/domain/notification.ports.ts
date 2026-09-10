/**
 * The three things the sweep needs that this context does not own.
 *
 * Each is a port declared here, in `domain/`, and bound in this context's own
 * `infrastructure/` to the owning context's published surface. That is the seam
 * constitution IX sanctions and the one the lint rule leaves open:
 * `infrastructure/` is the single layer allowed to know another context exists,
 * because binding a local port to somebody else's query is its job.
 *
 * The alternative — the sweep reading Identity's tables and deleting Planning's
 * rows — is what v1 did, and it is what principle I exists to forbid. The sweep
 * knows *what it needs done*; the context that owns the data decides *how*, and
 * reports back a number the sweep can put in its own output.
 */

/** One device that might receive a notification. Identity's shape, narrowed. */
export interface NotifiableDevice {
  userId: string;
  deviceId: string;
  pushToken: string | null;
  /**
   * When this device last synced.
   *
   * The sweep's whole reason for asking. A device whose `lastSeenAt` is at or
   * after an alert's `plannedAt` has already pulled that alert and scheduled it
   * locally — the phone's own alarm works with the network off, so the server
   * is the fallback, not the primary. Sending to it anyway notifies the member
   * twice for one thing.
   */
  lastSeenAt: Date | null;
}

/** Bound to Identity's `DevicesQueryHandler`. */
export abstract class DeviceLookupPort {
  abstract forUsers(userIds: string[]): Promise<NotifiableDevice[]>;
}

/**
 * Bound to Identity's device removal.
 *
 * A push token FCM reports invalid belongs to a device row in *PostgreSQL*,
 * which this context cannot open and should not want to. It asks.
 */
export abstract class DeviceRemovalPort {
  abstract removeByPushToken(tokens: string[]): Promise<number>;
}

/**
 * Bound to Planning's and Reminders' own purge handlers.
 *
 * Tombstones past the horizon are *their* rows. The sweep is simply the thing
 * that runs on a timer, so it asks each owner to purge its own collections and
 * adds up what they report — which is why the number in the sweep's output is
 * honest: it is a count of rows those contexts deleted, reported by the
 * contexts that deleted them.
 */
export abstract class TombstonePurgePort {
  abstract purgeBefore(before: Date): Promise<number>;
}

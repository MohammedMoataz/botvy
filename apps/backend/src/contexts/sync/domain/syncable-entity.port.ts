import type {
  Rejection,
  SyncChange,
} from '../../../shared/persistence/ports/sync-change.js';

/**
 * One entity the phone can hold a copy of.
 *
 * The facade knows nothing about tasks, reminders or profiles — it knows this
 * interface, and each context provides an implementation from its own
 * `infrastructure/`. That is what keeps `/sync` from becoming the junction box
 * v1's became: adding meetings in P5 means adding an adapter and a name to a
 * list, not editing the endpoint.
 *
 * ## Two responsibilities, and they are deliberately separate
 *
 * `pull` reads. `apply` writes one pushed row and answers whether it took it.
 * The split matters because the conflict rule lives in the *apply* path and
 * nowhere else — an adapter that resolved conflicts inside its pull would be
 * an adapter with two opinions about which copy wins.
 *
 * ## Why `apply` and not `applyChange` on the repository
 *
 * Because applying a pushed row means calling `tombstone()` or `defer()` on an
 * aggregate so the event is raised and the invariant checked, and a repository
 * that invokes domain behaviour has stopped being a repository. The port used
 * to carry that method; it does not now.
 */
export interface SyncableEntity {
  /**
   * The wire name, exactly as `contracts/sync.md` spells it — `tasks`,
   * `labels`, `reminders`, `profile`, `preferences`. It is the key in the
   * request's `push`, the key in the response's `pull`, and the `entity` field
   * of every rejection, so it is one string in one place rather than three that
   * can disagree.
   */
  readonly entity: string;

  /**
   * Where this entity sits in the apply order.
   *
   * Parents before children, because a task carries a snapshot of its label and
   * must not name one the same request has yet to create. Lower runs first.
   * A number rather than a dependency graph: there are five entities and the
   * order is a product decision written down in the contract, not something to
   * be derived.
   */
  readonly applyOrder: number;

  /**
   * Rows changed after the cursor, **tombstones included** — on a delta they
   * are the only way a deletion travels. `since: null` means everything.
   *
   * Returns wire-shaped objects, not aggregates: this is the response body.
   */
  pull(userId: string, since: Date | null): Promise<unknown[]>;

  /** One pushed row. See `contracts/sync.md` for the conflict rule. */
  apply(userId: string, change: SyncChange, now: Date): Promise<ApplyOutcome>;
}

export type ApplyOutcome =
  { applied: true; id: string } | { applied: false; rejection: Rejection };

/**
 * An entity the client patches as a single object rather than as rows —
 * `profile` and `preferences`.
 *
 * Separate from `SyncableEntity` because the protocol genuinely differs: the
 * request carries `{ patch: {...} }` instead of an array of changes, and
 * **there is no conflict check at all.** `contracts/sync.md` says so, and the
 * reason is that the fields a client may write and the fields the server's own
 * jobs write are disjoint sets — so there is no version to lose, and a
 * `baseUpdatedAt` comparison would only invent rejections against a row the
 * client is not competing for.
 *
 * Which means a stale patch is *accepted*, and must never be reported as
 * `stale`: a stale verdict tells the phone to overwrite its copy and retry, and
 * it would retry for ever against a rule that was never going to refuse it.
 */
export interface SyncablePatch {
  readonly entity: string;
  readonly applyOrder: number;
  pull(userId: string): Promise<unknown | null>;
  applyPatch(
    userId: string,
    patch: Record<string, unknown>,
    now: Date,
  ): Promise<ApplyOutcome>;
}

/** Multi-provider tokens. Each context adds itself; the facade collects. */
export const SYNCABLE_ENTITIES = Symbol('SYNCABLE_ENTITIES');
export const SYNCABLE_PATCHES = Symbol('SYNCABLE_PATCHES');

/**
 * Stamping the device's last-seen time, which is Identity's write.
 *
 * The sweep's skip filter rests on this value, so it is not bookkeeping: a
 * completed round trip is the evidence that a device now holds its own alarms,
 * and the sweep reads it to decide whether to push. The facade asks rather than
 * writing `devices.lastSeenAt` itself, because that row is in PostgreSQL and
 * belongs to Identity.
 */
export abstract class DeviceTouchPort {
  /** Returns the device id, or null when the install is unknown to us. */
  abstract touch(installId: string, at: Date): Promise<string | null>;
}

/** The next seven days of alarms, from Notifications, for the phone to schedule. */
export abstract class PendingAlertsPort {
  abstract forMember(userId: string, now: Date): Promise<unknown[]>;
}

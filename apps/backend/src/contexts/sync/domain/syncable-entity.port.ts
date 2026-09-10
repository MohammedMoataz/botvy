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
   *
   * ## Two cursors, and why the second one is a third parameter
   *
   * `since` is a date and every row-shaped entity reads it. **Messages do
   * not.** They are immutable and pulled by `seq > lastSeq` against the
   * member's own counter — that is the whole reason the collection has no
   * `updatedAt` and no tombstone, and it is what makes the phone's cursor one
   * integer instead of a date it has to trust its own clock about. A message
   * adapter handed only a date could not answer at all: there is no field to
   * compare it to.
   *
   * `contracts/sync.md` has carried `lastSeq` in the request since it was
   * written, and P3 shipped the facade without reading it, so this parameter is
   * the missing wire rather than a new idea. Three ways were open:
   *
   * 1. **A second port** (`SyncableSeqEntity`) beside `SyncableEntity` and
   *    `SyncablePatch`, with its own multi-provider token. Rejected: the two
   *    existing ports differ in their *protocol* — an array of rows against a
   *    single patch, a conflict rule against none — where this would differ
   *    only in which cursor its read uses, and the facade would gain a third
   *    loop and a third pull branch to carry the distinction.
   * 2. **A cursor object** (`{ since, lastSeq }`) replacing the date.
   *    Rejected: it changes the signature of all six existing adapters for the
   *    benefit of one.
   * 3. **A third argument.** TypeScript lets an implementation declare fewer
   *    parameters than its interface, so every existing adapter satisfies this
   *    unchanged and simply never sees it. That is what is written.
   *
   * So the rule is: an adapter reads the cursor its collection actually has.
   * `since` for a row with an `updatedAt`, `lastSeq` for messages, and there is
   * exactly one collection in the second group by construction — an entity that
   * wanted both would be an entity whose rows are mutable *and* sequenced, and
   * the sequence is only cheap because the rows are not.
   */
  pull(
    userId: string,
    since: Date | null,
    lastSeq: number,
  ): Promise<unknown[]>;

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

/**
 * How many messages one round trip carries. `contracts/sync.md`'s number.
 *
 * Here rather than inside the messages adapter because two places need to
 * agree on it: the adapter, which asks the store for that many, and the facade,
 * which reports `moreMessages` when a page comes back full. Two constants would
 * be two chances for the flag to be wrong in the direction that matters — a
 * flag stuck at false leaves the rest of a member's transcript unreachable
 * until something else happens to move their cursor, and messages are the one
 * entity whose pull cannot be repaired by a later `full` snapshot, because the
 * snapshot decision is about `updatedAt` and these rows have none.
 *
 * 200 is a page a slow handset can apply inside one local transaction. The
 * phone pages while `moreMessages` is true (capped at 50 pages by the
 * contract), so a member with a year of history catches up over several round
 * trips rather than one that times out.
 */
export const MESSAGE_PAGE_SIZE = 200;

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

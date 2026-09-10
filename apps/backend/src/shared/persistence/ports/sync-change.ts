/**
 * One row a client is pushing. `updatedAt` is when this device last edited it;
 * `baseUpdatedAt` is the server's own value for the version this device last
 * pulled. The API accepts the push outright while the base still matches —
 * send the local time instead and every offline edit falls through to a clock
 * comparison, which a slow handset loses.
 *
 * The five operations are the ones `contracts/sync.md` defines, and they are
 * five rather than three on purpose. `create` and `update` differ because the
 * conflict rule branches on them: a missing server row is an insert for a
 * create and a rejection for an update, since the second means the client is
 * editing something that has been erased. `restore` and `delete` are both
 * writes to `deletedAt` and could have been one op with a flag, but a flag
 * would let a client send `delete` with the flag set and get a restore, and the
 * two are audited differently.
 *
 * The vocabulary matches the contract exactly. It did not at first — the port
 * said `upsert` where the contract said `create|update`, and `not_found` where
 * the contract said `gone`, with no `not_deleted` at all — and nothing had
 * noticed because P2 is the first phase with a `/sync` to disagree with. These
 * strings cross the network and the phone branches on them, so they are fixed
 * here in one place rather than translated at the edge.
 */
export interface SyncChange<Fields = Record<string, unknown>> {
  id: string;
  op: 'create' | 'update' | 'delete' | 'restore' | 'purge';
  updatedAt: Date;
  baseUpdatedAt: Date | null;
  fields: Fields;
}

/**
 * Why a push was refused. Every entity shares this shape, and the rejection
 * names the entity it came from, so a client branches on `entity` before
 * touching any table — writing a refused meeting through the task path
 * corrupts rather than crashes.
 *
 * - `stale` — the server row moved on. The client overwrites its own copy from
 *   `server` and shows the member the winner.
 * - `gone` — the row is not there and the op was not a create. Nothing to edit;
 *   the client deletes its local copy.
 * - `protected` — the row exists and may not be changed this way (a pinned
 *   conversation, say). **Never reported as `stale`**: a stale verdict tells the
 *   phone to overwrite and retry, and against a row it is never allowed to
 *   change it would retry for ever.
 * - `not_deleted` — a purge of something that is not a tombstone. Erasing a
 *   live row is data loss dressed as housekeeping.
 * - `invalid` — the row itself is refused by a domain rule (an empty title, a
 *   moment in the past). Retrying unchanged will fail again, so the client
 *   surfaces it to the member rather than queueing it.
 */
export type RejectionReason =
  'stale' | 'gone' | 'protected' | 'not_deleted' | 'invalid';

export interface Rejection {
  entity: string;
  id: string;
  reason: RejectionReason;
  server?: unknown;
}

export type ApplyResult =
  { applied: true; updatedAt: Date } | { applied: false; rejection: Rejection };

/**
 * The conflict rule from `contracts/sync.md`, in one place because five
 * entities implement it and five copies would be five chances to get the clamp
 * wrong.
 *
 * The order of the checks is the rule: `baseUpdatedAt` matching is the ordinary
 * case and it consults no clock at all, which is the whole point of carrying
 * the base — a device that has not fallen behind never has its wall clock
 * judged. Only when the base has moved does the comparison happen, and then
 * `updatedAt` is clamped to the server's `now` first, so a handset set to 2099
 * cannot win every conflict it ever enters.
 */
export function resolveConflict(
  change: Pick<SyncChange, 'op' | 'updatedAt' | 'baseUpdatedAt'>,
  server: { updatedAt: Date; deletedAt?: Date | null } | null,
  now: Date,
): { accept: true } | { accept: false; reason: RejectionReason } {
  if (!server) {
    // A create with no server row is the ordinary offline case: insert it.
    // Anything else is a client editing a row that has been erased.
    return change.op === 'create'
      ? { accept: true }
      : { accept: false, reason: 'gone' };
  }

  if (change.op === 'purge' && !server.deletedAt) {
    return { accept: false, reason: 'not_deleted' };
  }

  if (
    change.baseUpdatedAt &&
    change.baseUpdatedAt.getTime() === server.updatedAt.getTime()
  ) {
    return { accept: true };
  }

  const claimed = Math.min(change.updatedAt.getTime(), now.getTime());
  if (claimed >= server.updatedAt.getTime()) return { accept: true };

  return { accept: false, reason: 'stale' };
}

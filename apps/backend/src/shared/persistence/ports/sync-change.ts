/**
 * One row a client is pushing. `updatedAt` is when this device last edited it;
 * `baseUpdatedAt` is the server's own value for the version this device last
 * pulled. The API accepts the push outright while the base still matches —
 * send the local time instead and every offline edit falls through to a clock
 * comparison, which a slow handset loses.
 */
export interface SyncChange<Fields = Record<string, unknown>> {
  id: string;
  op: 'upsert' | 'delete' | 'purge';
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
 * `protected` is never reported as `stale`: a stale verdict tells the phone to
 * retry, and it would retry for ever against a row it is not allowed to change.
 */
export type RejectionReason = 'stale' | 'protected' | 'not_found' | 'invalid';

export interface Rejection {
  entity: string;
  id: string;
  reason: RejectionReason;
  server?: unknown;
}

export type ApplyResult = { applied: true; updatedAt: Date } | { applied: false; rejection: Rejection };

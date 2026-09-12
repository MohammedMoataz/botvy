/**
 * Raised when a save would overwrite a row that is newer than the copy being
 * saved. It lives with the ports rather than with either adapter, because both
 * stores enforce the same rule and a handler catching it must not have to know
 * which store it was talking to.
 */
export class StaleWriteError extends Error {
  constructor(readonly aggregateId: string) {
    super(
      `Refusing a stale write to ${aggregateId}: the stored row is newer than the copy being saved.`,
    );
    this.name = 'StaleWriteError';
  }
}

/**
 * Raised when a save names a row that exists and belongs to somebody else.
 *
 * Distinct from `StaleWriteError`, and the distinction matters at the edge:
 * `/sync` reports a stale write as `stale`, which tells the phone to overwrite
 * its copy from the server row and retry. That is exactly wrong here — there is
 * no server row it may see, and it would retry for ever. This is reported as
 * `invalid`, which tells it to stop and surface the problem.
 *
 * It exists because the write path is upsert-shaped. A scoped *read* cannot see
 * another member's row, so the adapter cannot tell "an id I have never seen" —
 * an ordinary offline create — from "an id somebody else owns". Before this,
 * the second case overwrote their row, `userId` and all, for every entity whose
 * id is minted by a client. Nothing but the unguessability of a UUIDv7 stood in
 * the way, which is not an access control.
 */
export class ForeignRowError extends Error {
  constructor(readonly aggregateId: string) {
    super(`Refusing a write to ${aggregateId}: that row is not yours.`);
    this.name = 'ForeignRowError';
  }
}

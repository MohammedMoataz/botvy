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

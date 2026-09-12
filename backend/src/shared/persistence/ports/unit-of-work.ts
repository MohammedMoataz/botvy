/**
 * One transaction. A nested `run` joins the outer one rather than opening a
 * second, so a handler that calls another handler's work does not split a
 * change across two transactions.
 *
 * `onCommit` exists because some effects must not happen inside the
 * transaction and must not happen at all if it rolls back — a socket nudge for
 * a row that was never written is worse than a late one.
 */
export abstract class UnitOfWork {
  abstract run<R>(work: () => Promise<R>): Promise<R>;
  abstract onCommit(callback: () => Promise<void>): void;
}

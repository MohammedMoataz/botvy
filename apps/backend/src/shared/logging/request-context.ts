import { AsyncLocalStorage } from 'node:async_hooks';
import type { Principal } from '../auth/principal.js';

export interface RequestContext {
  requestId: string;
  principal?: Principal;
  /** Bounded context, e.g. `operations`. */
  context?: string;
  /** Vertical slice, e.g. `ping`. */
  slice?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * What a log line says about where it came from, carried without threading a
 * logger through every call.
 *
 * The point of `context` and `slice` is that a line reads as "operations/ping
 * did this" rather than "something did this". When a job goes wrong at three in
 * the morning, the difference between those two is how long it takes to find.
 */
export const RequestContextStore = {
  run<R>(value: RequestContext, work: () => R): R {
    return storage.run(value, work);
  },

  current(): RequestContext | undefined {
    return storage.getStore();
  },

  /** Narrows the current context in place; a no-op outside one. */
  tag(patch: Partial<RequestContext>): void {
    const current = storage.getStore();
    if (!current) return;
    Object.assign(current, patch);
  },

  /** What the logger mixes into every line. Never includes anything secret. */
  bindings(): Record<string, unknown> {
    const current = storage.getStore();
    if (!current) return {};
    return {
      requestId: current.requestId,
      ...(current.context ? { botvyContext: current.context } : {}),
      ...(current.slice ? { slice: current.slice } : {}),
      ...(current.principal
        ? { principal: `${current.principal.kind}:${current.principal.id}` }
        : {}),
    };
  },
};

import { Injectable } from '@nestjs/common';

/** What one `take` decided. */
export interface Verdict {
  allowed: boolean;
  /** How many are left in this window, after this call. */
  remaining: number;
  /** How long until the window rolls, in milliseconds. Zero when allowed. */
  retryAfterMs: number;
}

interface Window {
  count: number;
  /** When this window closes. */
  until: number;
}

/** Windows are dropped this long after they close, so the map cannot grow for ever. */
const SWEEP_EVERY_MS = 60_000;

/**
 * A fixed-window counter, shared by every entry point (P11, T1114).
 *
 * ## Why this and not `@nestjs/throttler`
 *
 * Constitution XII: anything an operator might retune is a key in the settings
 * registry, editable from the portal without a restart. Throttler takes its
 * limits from module configuration at boot, so making it read the registry
 * needs a custom resolver *and* custom storage — at which point the module is
 * providing the decorator and nothing else. It also does not cover the socket,
 * which is one of the four entry points this has to hold, so the alternative
 * was two mechanisms for one idea.
 *
 * ## A fixed window, and what that costs
 *
 * A member who spends a whole window at the end of one and a whole window at
 * the start of the next gets twice the limit across those two minutes. That is
 * the known cost of the cheapest correct answer, and it is the right trade
 * here: the limits exist to stop a runaway client and to make a credential
 * stuffing attempt slow, and neither is defeated by a factor of two. A sliding
 * window costs a list of timestamps per key.
 *
 * ponytail: fixed window, doubles at the boundary; a sliding log if a limit is
 * ever tuned tight enough for that factor to matter.
 *
 * ## In this process only
 *
 * One backend process serves the edge, so a per-process count is the whole
 * count. If the API is ever run more than once behind a load balancer, this
 * becomes per-instance and the effective limit multiplies by the instance
 * count — which fails in the permissive direction and would need a shared
 * store. Stated here rather than discovered later.
 */
@Injectable()
export class RateLimiter {
  readonly #windows = new Map<string, Window>();
  #lastSweep = 0;

  /**
   * Counts one call against `bucket:key` and says whether it may proceed.
   *
   * A limit of zero or less means unlimited, which is how a key set to 0 in the
   * registry turns a limit off without needing a separate switch — an operator
   * chasing a problem should be able to take the limiter out of the picture
   * from the portal rather than by redeploying.
   */
  take(bucket: string, key: string, limit: number, windowMs: number, now = Date.now()): Verdict {
    if (limit <= 0) return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterMs: 0 };

    this.#sweep(now);

    const id = `${bucket}:${key}`;
    const existing = this.#windows.get(id);

    if (!existing || existing.until <= now) {
      this.#windows.set(id, { count: 1, until: now + windowMs });
      return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
    }

    existing.count += 1;
    if (existing.count > limit) {
      // Not reset on a refusal. A client that keeps hammering through a closed
      // window must not be able to hold it closed for everybody else either —
      // the count is per key, and the key is per caller.
      return { allowed: false, remaining: 0, retryAfterMs: existing.until - now };
    }

    return { allowed: true, remaining: limit - existing.count, retryAfterMs: 0 };
  }

  /** For a spec, and for the rare case of an operator clearing a stuck key. */
  forget(bucket: string, key: string): void {
    this.#windows.delete(`${bucket}:${key}`);
  }

  get size(): number {
    return this.#windows.size;
  }

  /**
   * Drops closed windows, at most once a minute.
   *
   * Without it the map holds an entry per key for ever, and the key for an
   * anonymous caller is their address — so a scan from a botnet would be a
   * memory leak shaped exactly like the attack the limiter exists to survive.
   */
  #sweep(now: number): void {
    if (now - this.#lastSweep < SWEEP_EVERY_MS) return;
    this.#lastSweep = now;
    for (const [id, window] of this.#windows) {
      if (window.until <= now) this.#windows.delete(id);
    }
  }
}

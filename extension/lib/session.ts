import { db } from './db';

/**
 * Everything this browser profile knows about the member, in one file (T911).
 *
 * Three kinds of thing live in `chrome.storage.local` and nothing else does:
 * the **tokens**, the **address of the member's Botvy**, and a small **cached
 * copy of their profile** — the zone, the language and the name the panel
 * greets them by. Entity data never comes here: `chrome.storage.local` is
 * capped at ten megabytes and is not a database, and the tasks and meetings
 * live in Dexie where they can be queried.
 *
 * ## Why one file
 *
 * Sign-out has to clear *everything* the member left behind, and the way that
 * goes wrong is a key written in one place and forgotten in another — a
 * cached display name that survives into the next member's panel, a cursor
 * that makes their first sync a delta against somebody else's. `clearAll()`
 * is the one implementation, and every key it clears is declared beside it.
 */

/** The panel and the worker share these. Declared once, cleared together. */
export const KEYS = {
  tokens: 'botvy.tokens',
  gateway: 'botvy.gateway',
  profile: 'botvy.profile',
  /** This browser's row in the member's device list, for sign-out to remove. */
  device: 'botvy.deviceId',
} as const;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * What the panel needs about the member that is not an entity.
 *
 * `fetchedAt` is what makes FR-013's "within a day" real: the panel refreshes
 * this when the copy is older than a day, so a member who moves to another
 * country or switches to Arabic on their phone sees the panel follow without
 * signing out. It is a *cache* — the profile is the server's — so a stale copy
 * is wrong for at most a day rather than for ever.
 */
export interface CachedProfile {
  timezone: string;
  locale: string;
  displayName: string | null;
  fetchedAt: number;
}

/** A cached profile older than this is refreshed on the next panel mount. */
export const PROFILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Where this member's Botvy lives.
 *
 * A per-browser **setting**, not an operator key and not a build constant: the
 * address differs per member and per install, and an operator has no way to
 * reach a browser that is already installed. The build-time default is only a
 * convenience for the dev stack.
 */
export const DEFAULT_GATEWAY =
  (import.meta.env.WXT_GATEWAY_URL as string | undefined) ??
  'http://localhost:8080';

export async function readTokens(): Promise<TokenPair | null> {
  const stored = await chrome.storage.local.get(KEYS.tokens);
  const value = stored[KEYS.tokens] as TokenPair | undefined;
  return value?.accessToken ? value : null;
}

export async function writeTokens(tokens: TokenPair | null): Promise<void> {
  if (tokens) await chrome.storage.local.set({ [KEYS.tokens]: tokens });
  else await chrome.storage.local.remove(KEYS.tokens);
}

export async function readGateway(): Promise<string> {
  const stored = await chrome.storage.local.get(KEYS.gateway);
  const value = stored[KEYS.gateway] as string | undefined;
  return (value ?? DEFAULT_GATEWAY).replace(/\/$/, '');
}

export async function writeGateway(url: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.gateway]: url.replace(/\/$/, '') });
}

export async function readDeviceId(): Promise<string | null> {
  const stored = await chrome.storage.local.get(KEYS.device);
  return (stored[KEYS.device] as string | undefined) ?? null;
}

export async function writeDeviceId(deviceId: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.device]: deviceId });
}

export async function readProfile(): Promise<CachedProfile | null> {
  const stored = await chrome.storage.local.get(KEYS.profile);
  return (stored[KEYS.profile] as CachedProfile | undefined) ?? null;
}

export async function writeProfile(
  profile: Omit<CachedProfile, 'fetchedAt'>,
  at: number = Date.now(),
): Promise<void> {
  await chrome.storage.local.set({
    [KEYS.profile]: { ...profile, fetchedAt: at },
  });
}

export function profileIsStale(
  profile: CachedProfile | null,
  now: number = Date.now(),
): boolean {
  return !profile || now - profile.fetchedAt > PROFILE_MAX_AGE_MS;
}

/**
 * Refresh the tokens under a lock the panel and the worker share.
 *
 * **Refresh tokens rotate, and reuse revokes the family.** The panel and the
 * background worker are separate JavaScript contexts over one
 * `chrome.storage.local` key, so the SDK's in-memory single-flight — which is
 * per context — does not protect them from each other: two refreshes fired in
 * the same second spend the same token twice, the API reads the second as a
 * stolen token, and the member is signed out of a session they never touched.
 *
 * The Web Locks API is shared across every same-origin context an extension
 * has, including the service worker, which is exactly the scope the problem
 * has. The **re-read inside the lock** is the other half and is easy to leave
 * out: the loser of the race must not refresh the token it read *before*
 * waiting, because the winner has already rotated it. It asks again, finds a
 * token it has not seen, and returns that instead of spending anything.
 *
 * `refreshFn` is the SDK's — this adds the mutex and nothing else.
 */
export async function refreshUnderLock(
  refreshFn: (refreshToken: string) => Promise<TokenPair | null>,
  before: TokenPair | null,
): Promise<TokenPair | null> {
  const run = async (): Promise<TokenPair | null> => {
    const current = await readTokens();

    // Somebody else rotated while this call was queued. Their answer is the
    // live one; spending `before.refreshToken` now is precisely the replay that
    // revokes the family.
    if (current && before && current.refreshToken !== before.refreshToken) {
      return current;
    }
    if (!current?.refreshToken) return null;

    const rotated = await refreshFn(current.refreshToken);
    await writeTokens(rotated);
    return rotated;
  };

  // `navigator.locks` exists in extension pages and in MV3 service workers.
  // Guarded anyway: a test environment without it should refresh rather than
  // throw, and one refresher racing nobody is the ordinary case.
  if (typeof navigator === 'undefined' || !navigator.locks) return run();
  return navigator.locks.request('botvy.refresh', run);
}

/**
 * Everything this member left on this computer, gone (FR-009, SC-005).
 *
 * Dexie first and `chrome.storage` second, and the order is not arbitrary: the
 * tokens are what a failed clear would leave *usable*, so they go last and a
 * half-finished clear leaves no readable data behind them. The sign-out flow
 * calls the two server-side steps **before** this — see `signOut` — because
 * clearing first would throw away the credentials those steps need.
 *
 * The whole Dexie database is deleted rather than each table emptied: a table
 * added by a later version and forgotten here is a table that survives sign-out
 * with the previous member's rows in it, and "forgotten here" is the failure
 * this function exists to prevent.
 */
export async function clearAll(): Promise<void> {
  await db.delete();
  await db.open();
  await chrome.storage.local.remove([KEYS.tokens, KEYS.profile, KEYS.device]);
  // The address stays. It is not the member's data — it is where this browser
  // was told to look — and a member signing out on their own machine should not
  // have to type their tunnel URL again to sign back in.
}

export interface SignOutSteps {
  /** `POST /auth/logout` with the refresh token. */
  revoke(): Promise<unknown>;
  /** `DELETE /devices/:id` for this browser's install id. */
  forgetDevice(): Promise<unknown>;
}

/** How long either server step may take before sign-out proceeds without it. */
export const SIGN_OUT_GRACE_MS = 3_000;

/**
 * Sign out: revoke, forget this browser, then clear (T952).
 *
 * The order matters and it is the one thing this function exists to hold.
 * Clearing first would throw away the refresh token the revoke needs and the
 * install id the device delete needs, leaving a live session and a phantom
 * device on the member's account — which is exactly the state this used to
 * leave behind.
 *
 * Both server steps are **best-effort with a bounded wait**: a member signing
 * out on a plane still gets their cache cleared, and the refresh token they
 * could not revoke dies of its own rotation. What must not happen is a sign-out
 * that hangs, because a member who cannot sign out on a borrowed computer is
 * the worst case this flow has.
 */
export async function signOut(
  steps: SignOutSteps,
  graceMs: number = SIGN_OUT_GRACE_MS,
): Promise<{ revoked: boolean; deviceForgotten: boolean }> {
  const revoked = await bounded(steps.revoke(), graceMs);
  const deviceForgotten = await bounded(steps.forgetDevice(), graceMs);
  await clearAll();
  return { revoked, deviceForgotten };
}

/** Whether a promise settled successfully inside the grace period. */
async function bounded(work: Promise<unknown>, graceMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), graceMs);
  });
  try {
    const done = await Promise.race([work.then(() => true), timeout]);
    return done;
  } catch {
    // A refusal is an answer — the session may already be gone — and it must
    // not stop the clear.
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

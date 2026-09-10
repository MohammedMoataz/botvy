/** Build-time only: set WXT_GATEWAY_URL when building for anything but the dev stack. */
export const GATEWAY_URL: string =
  import.meta.env.WXT_GATEWAY_URL ?? 'http://localhost:8080';

/** chrome.storage.local key holding the token pair, shared by panel and background. */
export const TOKEN_STORAGE_KEY = 'botvy.tokens';

/**
 * The message the service worker sends the panel when the server nudges.
 *
 * The whole push path for this surface, and there is no other one: **FCM does
 * not work in an extension**, so `sync.nudge` over the socket is how the
 * extension learns that something changed elsewhere. The worker owns the socket
 * and the panel owns the round trip (see `store.ts` on why), so the nudge has
 * to cross between them, and one message type is the crossing.
 */
export const SYNC_NUDGE_MESSAGE = 'botvy.sync.nudge';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function readTokens(): Promise<TokenPair | null> {
  const stored = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
  const value = stored[TOKEN_STORAGE_KEY] as TokenPair | undefined;
  return value?.accessToken ? value : null;
}

export async function writeTokens(tokens: TokenPair | null): Promise<void> {
  if (tokens) await chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: tokens });
  else await chrome.storage.local.remove(TOKEN_STORAGE_KEY);
}

/** Build-time only: set WXT_GATEWAY_URL when building for anything but the dev stack. */
export const GATEWAY_URL: string =
  import.meta.env.WXT_GATEWAY_URL ?? 'http://localhost:8080';

/** chrome.storage.local key holding the token pair, shared by panel and background. */
export const TOKEN_STORAGE_KEY = 'botvy.tokens';

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

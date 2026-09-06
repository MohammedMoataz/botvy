/**
 * @botvy/sdk — the one client the frontend and the extension talk to the API
 * through. ESM and browser-safe: no Node built-ins, no DOM globals touched at
 * import time.
 *
 * This is the P0 skeleton. The real surface arrives with task T050:
 *
 *   - `client.ts`  — typed fetch over `@botvy/contracts` (base URL + bearer)
 *   - `socket.ts`  — Socket.IO wrapper, JWT in the handshake `auth` payload,
 *                    reconnect with a fresh token on `token_expired`
 *   - `stores/auth.store.ts` — MobX token store with single-flight refresh
 *                    (ported from legacy/apps/admin/src/api/client.ts)
 *   - `stores/root.store.ts`
 *
 * Nothing above is implemented here; a placeholder implementation would be a
 * lie the surfaces would build against. Only the option shape T050 is written
 * to is declared, so a skeleton screen can name it.
 */

/** Options the typed client (T050) is constructed with. */
export interface BotvyClientOptions {
  /** Origin the API is reached at, e.g. `https://botvy.example` — no trailing slash. */
  readonly baseUrl: string;
  /** Current access token, or `null` when signed out. Read per request. */
  readonly getAccessToken?: () => string | null;
}

/** Marks this build as the P0 skeleton; flipped when T050 lands the client. */
export const SDK_IMPLEMENTED = false;

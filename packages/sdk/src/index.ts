/**
 * @botvy/sdk — the one client the frontend and the extension reach the API
 * through. ESM and browser-safe: no Node built-ins, no DOM globals touched at
 * import time.
 *
 * It exists because v1 wrote the domain three times — in the gateway, in the
 * admin app, on the phone — and the three drifted. One client, generated types,
 * one place to fix a mistake.
 */
export { BotvyClient, ApiError, NotAvailableYetError, type ClientOptions } from './client.js';
export {
  TokenStore,
  inMemoryStorage,
  type RefreshFn,
  type TokenPair,
  type TokenStorage,
} from './tokens.js';
export { SocketClient, type SocketOptions, type SocketState } from './socket.js';
export {
  AuthStore,
  EmailTaken,
  GoogleLinkRequired,
  RegistrationClosed,
  type DeviceDescriptor,
  type DeviceKind,
  type DeviceView,
  type Role,
  type SignedInMember,
  type SignedOutReason,
} from './auth-store.js';
export {
  ProfileStore,
  type BodyMetric,
  type PreferencesView,
  type ProfilePatch,
  type ProfileView,
} from './profile-store.js';

/** Options the typed client is constructed with. */
export interface BotvyClientOptions {
  /** Origin the API is reached at, e.g. `https://botvy.example` — no trailing slash. */
  readonly baseUrl: string;
  /** Current access token, or `null` when signed out. Read per request. */
  readonly getAccessToken?: () => string | null;
}

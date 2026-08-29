import type { HealthResponse, LoginDto, RefreshDto, TokenPairDto } from './types';

export const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

const STORAGE_KEY = 'botvy.tokens';

// In-memory copy is the source of truth for a request; localStorage survives reload.
let tokens: TokenPairDto | null = readStored();
let listeners: Array<() => void> = [];

function readStored(): TokenPairDto | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TokenPairDto) : null;
  } catch {
    return null;
  }
}

function setTokens(next: TokenPairDto | null): void {
  tokens = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode / storage disabled — in-memory tokens still work for this tab */
  }
  for (const l of listeners) l();
}

/** For React's useSyncExternalStore, so a token loss anywhere re-renders the guard. */
export function subscribeAuth(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

/** Stable snapshot: the access token string, or null. */
export function getAccessToken(): string | null {
  return tokens?.accessToken ?? null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, body || `${res.status} ${res.statusText}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

function send(path: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

// Single in-flight refresh, so parallel queries hitting 401 don't each burn a
// refresh token (the gateway rotates them — the losers would be rejected).
let refreshing: Promise<TokenPairDto | null> | null = null;

function refresh(): Promise<TokenPairDto | null> {
  if (refreshing) return refreshing;
  const refreshToken = tokens?.refreshToken;
  if (!refreshToken) return Promise.resolve(null);
  refreshing = send('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken } satisfies RefreshDto),
  })
    .then((res) => (res.ok ? (res.json() as Promise<TokenPairDto>) : null))
    .catch(() => null)
    .then((pair) => {
      setTokens(pair);
      return pair;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Authenticated fetch. Retries exactly once via POST /auth/refresh on a 401. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await send(path, init, getAccessToken());
  if (res.status !== 401) return parse<T>(res);

  const pair = await refresh();
  if (!pair) throw new ApiError(401, 'Session expired — please sign in again.');
  return parse<T>(await send(path, init, pair.accessToken));
}

export async function login(body: LoginDto): Promise<void> {
  const res = await send('/auth/login', { method: 'POST', body: JSON.stringify(body) }, null);
  setTokens(await parse<TokenPairDto>(res));
}

export function logout(): void {
  setTokens(null);
}

export const getHealth = (): Promise<HealthResponse> => api<HealthResponse>('/health');

// ── STUBS FOR THE MAIN SESSION ────────────────────────────────────────────────
// None of these endpoints exist on the gateway yet. Each function below already
// carries its intended URL and response type; the fetch call is written and
// type-checked but short-circuited by ADMIN_API_LIVE.
//
// TO ACTIVATE: flip ADMIN_API_LIVE to true once /admin/* lands. Adjust a URL or
// a type here only if the shipped contract differs from what is written below.
// ─────────────────────────────────────────────────────────────────────────────

import { api } from './client';

export const NOT_IMPLEMENTED = 'NOT_IMPLEMENTED' as const;

/** Thrown by every stub until ADMIN_API_LIVE flips. UI renders an empty state on it. */
export class NotImplementedError extends Error {
  readonly code = NOT_IMPLEMENTED;
  constructor(readonly endpoint: string) {
    super(`Endpoint not yet available: ${endpoint}`);
    this.name = 'NotImplementedError';
  }
}

export const isNotImplemented = (e: unknown): e is NotImplementedError =>
  e instanceof NotImplementedError;

const ADMIN_API_LIVE = false;

function pending<T>(endpoint: string): () => Promise<T> {
  return () =>
    ADMIN_API_LIVE ? api<T>(endpoint) : Promise.reject(new NotImplementedError(endpoint));
}

// ── Overview stats ────────────────────────────────────────────────────────────
export interface AdminStats {
  totalUsers: number;
  totalDevices: number;
  messagesToday: number;
  tokensToday: number;
}
export const getStats = pending<AdminStats>('/admin/stats');

// ── Users ─────────────────────────────────────────────────────────────────────
export interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  role: 'user' | 'admin';
  createdAt: string;
}
export const listUsers = pending<AdminUser[]>('/admin/users');

// ── Devices ───────────────────────────────────────────────────────────────────
export interface AdminDevice {
  id: string;
  userId: string;
  platform: string;
  lastSeenAt: string | null;
}
export const listDevices = pending<AdminDevice[]>('/admin/devices');

// ── Config / settings ─────────────────────────────────────────────────────────
export interface AdminSetting {
  key: string;
  value: string;
}
export const listSettings = pending<AdminSetting[]>('/admin/settings');

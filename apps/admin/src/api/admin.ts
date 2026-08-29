// All four /admin/* endpoints are live on the gateway and verified against it.
// The NotImplementedError machinery below is retained only so a future
// endpoint added here can reuse the same pending() + empty-state path.

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

const ADMIN_API_LIVE = true;

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
  status: 'active' | 'banned';
  createdAt: string;
  lastLoginAt: string | null;
}
export const listUsers = pending<AdminUser[]>('/admin/users');

// ── Devices ───────────────────────────────────────────────────────────────────
export interface AdminDevice {
  id: string;
  userId: string;
  name: string | null;
  platform: string;
  lastSeenAt: string | null;
  createdAt: string;
}
export const listDevices = pending<AdminDevice[]>('/admin/devices');

// ── Config / settings ─────────────────────────────────────────────────────────
export interface AdminSetting {
  key: string;
  /** jsonb column — shape varies per setting key. */
  value: unknown;
  updatedAt: string;
}
export const listSettings = pending<AdminSetting[]>('/admin/settings');

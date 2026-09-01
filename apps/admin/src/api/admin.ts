// All four /admin/* endpoints are live on the gateway and verified against it.

import { api } from './client';

// ── Overview stats ────────────────────────────────────────────────────────────
export interface AdminStats {
  totalUsers: number;
  totalDevices: number;
  messagesToday: number;
  tokensToday: number;
}
export const getStats = (): Promise<AdminStats> => api<AdminStats>('/api/admin/stats');

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
export const listUsers = (): Promise<AdminUser[]> => api<AdminUser[]>('/api/admin/users');

// ── Devices ───────────────────────────────────────────────────────────────────
export interface AdminDevice {
  id: string;
  userId: string;
  name: string | null;
  platform: string;
  lastSeenAt: string | null;
  createdAt: string;
}
export const listDevices = (): Promise<AdminDevice[]> => api<AdminDevice[]>('/api/admin/devices');

// ── Config / settings ─────────────────────────────────────────────────────────
export interface AdminSetting {
  key: string;
  /** jsonb column — shape varies per setting key. */
  value: unknown;
  /** False when the gateway is running on the coded default for this key. */
  overridden: boolean;
  default: unknown;
  description: string;
}

/** Written by the gateway itself (last sweep, last coaching tick). Read-only. */
export interface OpsRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface AdminSettings {
  settings: AdminSetting[];
  ops: OpsRecord[];
}

export const listSettings = (): Promise<AdminSettings> => api<AdminSettings>('/api/admin/settings');

/** Values are validated per key by the gateway and take effect without a restart. */
export const updateSetting = (key: string, value: unknown): Promise<AdminSetting> =>
  api<AdminSetting>(`/api/admin/settings/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    body: JSON.stringify({ value }),
  });

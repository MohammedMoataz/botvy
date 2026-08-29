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
  updatedAt: string;
}
export const listSettings = (): Promise<AdminSetting[]> => api<AdminSetting[]>('/api/admin/settings');

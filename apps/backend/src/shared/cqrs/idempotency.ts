import type { Principal } from '../auth/principal.js';
import { principalId } from '../auth/principal.js';

export const IDEMPOTENCY_HEADER = 'idempotency-key';

/**
 * Retention is the collection's TTL index, not a timer in code (plan,
 * "Constants and keys"). A replay older than a day is a new request.
 */
export const IDEMPOTENCY_TTL_HOURS = 24;

export interface IdempotencyRecord {
  id: string;
  route: string;
  status: number;
  response: unknown;
  createdAt: Date;
}

export abstract class IdempotencyStore {
  abstract find(id: string): Promise<IdempotencyRecord | null>;
  abstract remember(record: IdempotencyRecord): Promise<void>;
}

/**
 * Keyed by principal **and** key.
 *
 * Keying by the key alone would let one member's replayed request return
 * another member's answer, simply by guessing a key — which for a client-minted
 * uuid is unlikely but not something to leave to chance.
 */
export function idempotencyId(principal: Principal, key: string): string {
  return `${principalId(principal)}:${key}`;
}

export function readIdempotencyKey(headers: Record<string, unknown> | undefined): string | null {
  const raw = headers?.[IDEMPOTENCY_HEADER];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * A sign-in's refresh-token chain, and the rule that tells rotation apart from
 * theft.
 *
 * Every refresh token descended from one sign-in shares a `familyId`. Exchanging
 * a token marks it `replacedBy` the next one, so the chain is a linked list. A
 * client that presents a token which has already been exchanged is either
 * replaying an old request or holding a stolen copy — and there is no way to
 * tell which, so the whole family is revoked and the member signs in again.
 *
 * Without the family, a leaked refresh token is indistinguishable from a normal
 * rotation and lives until it expires: thirty days of access to an account whose
 * owner has no way to notice.
 */

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy: string | null;
  deviceId: string | null;
  createdAt: Date;
}

/** What the caller should do with a presented token. */
export type ChainVerdict =
  | { outcome: 'rotate'; record: RefreshTokenRecord }
  | { outcome: 'expired' }
  | { outcome: 'unknown' }
  /**
   * The dangerous one. `revokedAt` or `replacedBy` being set means this token
   * has been seen before, and the caller must revoke the entire family rather
   * than only refusing this request.
   */
  | { outcome: 'replayed'; record: RefreshTokenRecord };

/**
 * Judges a presented token. Pure, so the branch that decides a session was
 * stolen is testable without a database — it is the branch a member's account
 * security rests on, and it is not a branch anyone exercises by hand.
 */
export function judgeRefresh(
  record: RefreshTokenRecord | null,
  now: Date = new Date(),
): ChainVerdict {
  if (!record) return { outcome: 'unknown' };

  // Replay is checked before expiry on purpose. An expired token that was also
  // already exchanged is still evidence of a leak, and reporting it as merely
  // expired would let the holder of a stolen copy keep the family alive by
  // waiting.
  if (record.revokedAt !== null || record.replacedBy !== null) {
    return { outcome: 'replayed', record };
  }
  if (record.expiresAt.getTime() <= now.getTime()) return { outcome: 'expired' };

  return { outcome: 'rotate', record };
}

/** How long a refresh token lives, from a duration like `30d` or `12h`. */
export function refreshExpiry(ttl: string, from: Date = new Date()): Date {
  const match = /^(\d+)\s*([smhd])$/.exec(ttl.trim());
  if (!match) {
    throw new Error(
      `JWT_REFRESH_TTL must look like "30d", "12h", "45m" or "90s"; got "${ttl}"`,
    );
  }

  const amount = Number(match[1]);
  const unitMs = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
    match[2] as 's' | 'm' | 'h' | 'd'
  ];
  return new Date(from.getTime() + amount * unitMs);
}

import type { RefreshTokenRecord } from './session-chain.js';

export interface IssueRefreshToken {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  deviceId: string | null;
}

/**
 * The refresh chain's store.
 *
 * `rotate` is one method rather than a mark-then-insert pair because it has to
 * be one transaction: marking the old token exchanged and failing to write the
 * new one signs the member out, and writing the new one without marking the old
 * leaves two live tokens in a family whose whole purpose is that there is only
 * ever one.
 */
export abstract class RefreshTokenRepository {
  abstract findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;

  /** A fresh family — a new sign-in. */
  abstract issue(token: IssueRefreshToken): Promise<RefreshTokenRecord>;

  /** Marks `previousId` exchanged and writes its successor, atomically. */
  abstract rotate(
    previousId: string,
    next: IssueRefreshToken,
  ): Promise<RefreshTokenRecord>;

  /** One token, on sign-out. Returns whether there was anything to revoke. */
  abstract revoke(tokenId: string): Promise<boolean>;

  /**
   * Every live token in a family. Called when a replay is detected, and on a
   * password change — the point of changing a password is that sessions opened
   * with the old one end.
   */
  abstract revokeFamily(familyId: string): Promise<number>;

  /** Every family the member holds. Used by a ban and by a password change. */
  abstract revokeAllForUser(userId: string): Promise<number>;

  /** Housekeeping: expired rows are evidence of nothing once they are past. */
  abstract deleteExpired(before: Date): Promise<number>;
}

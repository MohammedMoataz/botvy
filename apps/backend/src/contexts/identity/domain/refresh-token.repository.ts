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

  /**
   * Claims `previousId`, then writes its successor — and returns `null` when
   * the claim failed because somebody else got there first.
   *
   * The claim is the whole contract. Reading a row, judging it live, and then
   * writing it unconditionally is a check-then-act race: two concurrent
   * refreshes both read `replacedBy: null`, both decide to rotate, and both
   * blind-write the old row. The result is two live tokens in a family whose
   * entire purpose is that there is only ever one — and the replay detection
   * that family exists for is then dead for good, which is exactly what a
   * stolen token needs.
   *
   * `null` is not an error. It means this exchange lost the race, and the
   * caller must treat it as a replay: it cannot tell a lost race from a theft,
   * and neither can anybody else.
   */
  abstract rotate(
    previousId: string,
    next: IssueRefreshToken,
  ): Promise<RefreshTokenRecord | null>;

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

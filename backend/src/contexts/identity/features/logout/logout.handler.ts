import { Injectable } from '@nestjs/common';
import { RefreshTokenRepository } from '../../domain/refresh-token.repository.js';
import { hashRefreshToken } from '../refresh/refresh.handler.js';

/**
 * Signs out one session.
 *
 * One row, not the family and not the account: signing out a phone must leave
 * the tablet signed in. The family only dies wholesale on a replay, a ban or a
 * password change, and each of those is a different decision from this one.
 *
 * Always succeeds. A logout that returns an error for an unknown token tells
 * the caller something about which tokens exist, and there is nothing useful for
 * a client to do with the answer anyway — it is signing out either way.
 */
@Injectable()
export class LogoutHandler {
  constructor(private readonly tokens: RefreshTokenRepository) {}

  async handle(refreshToken: string): Promise<{ signedOut: boolean }> {
    const record = await this.tokens.findByHash(hashRefreshToken(refreshToken));
    if (!record) return { signedOut: false };

    return { signedOut: await this.tokens.revoke(record.id) };
  }

  /** Every session the member holds. The portal's "sign out everywhere". */
  async everywhere(userId: string): Promise<{ sessionsEnded: number }> {
    return { sessionsEnded: await this.tokens.revokeAllForUser(userId) };
  }
}

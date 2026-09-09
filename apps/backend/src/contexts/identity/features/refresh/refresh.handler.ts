import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtSigner } from '../../../../shared/auth/jwt.signer.js';
import { ENV } from '../../../../shared/config/config.module.js';
import type { Env } from '../../../../shared/config/env.schema.js';
import { RefreshTokenRepository } from '../../domain/refresh-token.repository.js';
import { judgeRefresh, refreshExpiry } from '../../domain/session-chain.js';
import { UserRepository } from '../../domain/user.repository.js';

export interface IssuedSession {
  accessToken: string;
  expiresIn: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export class RefreshRejected extends Error {
  constructor(
    readonly code: 'token_invalid' | 'token_expired' | 'session_replay',
    message: string,
  ) {
    super(message);
  }
}

/**
 * The opaque half of a session.
 *
 * A refresh token is random bytes, not a JWT: it is checked against the store
 * on every use, which is what makes revoking one possible at all. Only its hash
 * is kept, so a leaked database dump does not hand over live sessions.
 */
export function mintRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  // SHA-256 and not a password hash, deliberately. This is a 256-bit random
  // value, not a human-chosen secret, so there is nothing to brute-force and
  // nothing for a work factor to buy — while refresh happens often enough that
  // an expensive comparison would be felt.
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Exchanges a refresh token for the next pair, and detects a leak while doing
 * it.
 *
 * A token that has already been exchanged is either a replay or a theft, and
 * nothing in the request can tell them apart — so the entire family is revoked
 * and the member signs in again. That is the cost of the rule, and it is worth
 * it: without it, a stolen refresh token is indistinguishable from a normal
 * rotation and lives until it expires.
 */
@Injectable()
export class RefreshHandler {
  private readonly logger = new Logger(RefreshHandler.name);

  constructor(
    private readonly tokens: RefreshTokenRepository,
    private readonly users: UserRepository,
    private readonly signer: JwtSigner,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async handle(presented: string): Promise<IssuedSession> {
    const record = await this.tokens.findByHash(hashRefreshToken(presented));
    const verdict = judgeRefresh(record);

    if (verdict.outcome === 'unknown') {
      throw new RefreshRejected('token_invalid', 'that refresh token is not recognised');
    }
    if (verdict.outcome === 'expired') {
      throw new RefreshRejected('token_expired', 'that refresh token has expired');
    }
    if (verdict.outcome === 'replayed') {
      const revoked = await this.tokens.revokeFamily(verdict.record.familyId);
      this.logger.warn(
        `refresh replay on family ${verdict.record.familyId} for user ` +
          `${verdict.record.userId}; revoked ${revoked} token(s)`,
      );
      throw new RefreshRejected(
        'session_replay',
        'that refresh token was already used; the session has been ended',
      );
    }

    const user = await this.users.findById(verdict.record.userId, verdict.record.userId);
    if (!user?.isActive) {
      // Banned or deleted between issuing and refreshing. The family goes too,
      // otherwise the holder keeps refreshing against an account that is gone.
      await this.tokens.revokeFamily(verdict.record.familyId);
      throw new RefreshRejected('token_invalid', 'that account can no longer sign in');
    }

    const next = mintRefreshToken();
    const expiresAt = refreshExpiry(this.env.JWT_REFRESH_TTL);
    const rotated = await this.tokens.rotate(verdict.record.id, {
      userId: user.id,
      familyId: verdict.record.familyId,
      tokenHash: next.hash,
      expiresAt,
      deviceId: verdict.record.deviceId,
    });

    // The claim failed, so this token was exchanged between the read above and
    // the write. Indistinguishable from a replay from here — and treated as
    // one, because the alternative is deciding that a race is probably
    // innocent, which is precisely the assumption a thief relies on.
    if (!rotated) {
      const revoked = await this.tokens.revokeFamily(verdict.record.familyId);
      this.logger.warn(
        `refresh raced on family ${verdict.record.familyId} for user ` +
          `${verdict.record.userId}; revoked ${revoked} token(s)`,
      );
      throw new RefreshRejected(
        'session_replay',
        'that refresh token was already used; the session has been ended',
      );
    }

    const { accessToken, expiresIn } = this.signer.sign({
      sub: user.id,
      role: user.role,
      email: user.email,
    });

    return { accessToken, expiresIn, refreshToken: next.token, refreshExpiresAt: expiresAt };
  }

  /** A fresh family. Called by sign-in, not by this slice's endpoint. */
  async open(
    userId: string,
    deviceId: string | null,
  ): Promise<{ refreshToken: string; refreshExpiresAt: Date }> {
    const minted = mintRefreshToken();
    const expiresAt = refreshExpiry(this.env.JWT_REFRESH_TTL);
    await this.tokens.issue({
      userId,
      familyId: randomUUID(),
      tokenHash: minted.hash,
      expiresAt,
      deviceId,
    });
    return { refreshToken: minted.token, refreshExpiresAt: expiresAt };
  }
}

import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseDurationToMs } from './duration.js';
import { assertRegistrationOpen } from './registration-gate.js';
import type { ChangePasswordDto, RegisterDto, LoginDto } from './dto.js';

interface AccessTokenPayload {
  sub: string;
  role: string;
}

interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}


@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    assertRegistrationOpen(this.config);
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
      },
    });
    return { id: user.id, email: user.email, role: user.role };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await this.passwordMatches(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return this.issueTokenPair(user.id, user.role);
  }

  /**
   * Changes a password, and signs every other session out.
   *
   * Revoking the refresh tokens is the point: a password is usually changed
   * because someone else might know the old one, and leaving their session
   * alive would make the change cosmetic. The caller keeps working — access
   * tokens are short-lived and this issues a fresh pair.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await this.passwordMatches(user.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(dto.newPassword) },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair(user.id, user.role);
  }

  async refresh(refreshToken: string) {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const stored = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });
    if (
      !stored ||
      stored.revokedAt !== null ||
      stored.expiresAt < new Date() ||
      stored.tokenHash !== hashToken(refreshToken)
    ) {
      throw new UnauthorizedException('Refresh token has already been used or revoked');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair(user.id, user.role);
  }

  /**
   * argon2.verify THROWS on a value that is not a valid argon2 hash, rather
   * than returning false. Google-only accounts deliberately store a
   * non-argon2 placeholder, so an unguarded call would turn a wrong-password
   * attempt into a 500 instead of a clean 401.
   */
  private async passwordMatches(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /** Issues a token pair for an already-authenticated user (e.g. via Google). */
  async issueForUser(userId: string, role: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
    return this.issueTokenPair(userId, role);
  }

  private async issueTokenPair(userId: string, role: string) {
    const accessPayload: AccessTokenPayload = { sub: userId, role };
    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL') as JwtSignOptions['expiresIn'],
    });

    const jti = randomUUID();
    const refreshPayload: RefreshTokenPayload = { sub: userId, jti };
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL')!;
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshTtl as JwtSignOptions['expiresIn'],
    });

    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + parseDurationToMs(refreshTtl)),
      },
    });

    return { accessToken, refreshToken };
  }
}

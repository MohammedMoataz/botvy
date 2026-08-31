import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

/**
 * Guards every path that CREATES an account. Two of them exist —
 * AuthService.register (email/password) and GoogleAuthService.findOrCreateUser
 * (first Google sign-in) — so the check lives next to each `user.create`
 * rather than on the controller, where covering only /auth/register would
 * leave /auth/google as a trivial bypass.
 *
 * Only an explicit `false` closes registration: an unset value stays
 * permissive so existing deployments keep working.
 */
export function assertRegistrationOpen(config: ConfigService): void {
  if (config.get<boolean>('ALLOW_REGISTRATION') === false) {
    throw new ForbiddenException('Registration is closed on this server');
  }
}

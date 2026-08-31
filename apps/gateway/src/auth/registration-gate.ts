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
  // Both shapes have to be accepted. ConfigService.get() consults process.env
  // BEFORE the validated config, so whenever the variable is actually set in
  // the environment — precisely when closing registration matters — this
  // arrives as the string "false" and never as the zod-transformed boolean.
  // Comparing only against boolean false meant the gate never fired and
  // registration stayed open on a server configured to refuse it.
  const allowed = config.get<boolean | string>('ALLOW_REGISTRATION');
  if (allowed === false || allowed === 'false') {
    throw new ForbiddenException('Registration is closed on this server');
  }
}

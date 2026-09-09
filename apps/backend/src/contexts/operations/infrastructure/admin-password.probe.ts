import { Injectable } from '@nestjs/common';
import { AdminCredentialsQueryHandler } from '../../identity/features/seeds/admin-credentials.query.js';
import type { AdminPasswordProbe } from '../features/admin-password-flag/admin-password-flag.handler.js';

export const ADMIN_PASSWORD_PROBE = Symbol('ADMIN_PASSWORD_PROBE');

/**
 * Binds Operations' question to Identity's answer.
 *
 * The same shape as `SeededAdminDeviceLookup` beside it, and for the same
 * reason: Operations declares the port it needs, and the one file that knows
 * another context exists is this adapter. A cross-context import belongs in
 * `infrastructure/` — that is the layer whose whole job is binding a port to
 * something outside the context — and never in `features/`, where it was.
 */
@Injectable()
export class IdentityAdminPasswordProbe implements AdminPasswordProbe {
  constructor(private readonly credentials: AdminCredentialsQueryHandler) {}

  async isStillDefault(): Promise<boolean> {
    return this.credentials.seededAdminIsStillDefault();
  }
}

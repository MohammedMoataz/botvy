import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

/**
 * Guards the /internal/* endpoints that n8n calls. These are machine-to-
 * machine and must NOT accept a user JWT — a compromised user account
 * should not be able to trigger a system-wide reminder sweep.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('INTERNAL_SERVICE_TOKEN');
    if (!expected) throw new UnauthorizedException('Internal endpoints are not configured');

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const presented = request.headers['x-service-token'];
    if (!presented) throw new UnauthorizedException('Missing service token');

    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid service token');
    }
    return true;
  }
}

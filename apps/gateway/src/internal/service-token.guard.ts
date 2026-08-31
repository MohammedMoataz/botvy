import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

/**
 * Guards the /internal/* endpoints that n8n calls. These are machine-to-
 * machine and must NOT accept a user JWT — a compromised user account
 * should not be able to trigger a system-wide reminder sweep.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  private readonly logger = new Logger(ServiceTokenGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      url?: string;
    }>();

    const expected = this.config.get<string>('INTERNAL_SERVICE_TOKEN');
    if (!expected) {
      this.reject(request.url, 'INTERNAL_SERVICE_TOKEN is not set on the gateway');
      throw new UnauthorizedException('Internal endpoints are not configured');
    }

    const presented = request.headers['x-service-token'];
    if (!presented) {
      this.reject(
        request.url,
        'no X-Service-Token header — the caller (usually n8n) is missing INTERNAL_SERVICE_TOKEN in its environment',
      );
      throw new UnauthorizedException('Missing service token');
    }

    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.reject(request.url, 'token does not match INTERNAL_SERVICE_TOKEN');
      throw new UnauthorizedException('Invalid service token');
    }
    return true;
  }

  /** A rejected sweep used to leave no gateway-side trace at all. */
  private reject(url: string | undefined, why: string): void {
    this.logger.warn(`internal call rejected (${url ?? 'unknown route'}): ${why}`);
  }
}

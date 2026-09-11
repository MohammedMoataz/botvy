import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { principalFrom } from '../auth/principal-from-context.js';
import { RateLimiter } from './rate-limiter.js';
import { SettingsService } from '../settings/settings.service.js';
import type { SettingKey } from '../settings/settings.registry.js';

const WINDOW_MS = 60_000;

/** Which limit applies, and what the caller is counted as. */
export interface Bucket {
  name: string;
  key: string;
  setting: SettingKey;
}

/**
 * Reads the address a request came from, through one proxy.
 *
 * The edge is Caddy and it sets `X-Forwarded-For`, so the socket's own address
 * is always Caddy's — counting by it would put every anonymous caller in the
 * world into one bucket and lock the sign-in form for everybody the moment one
 * person got it wrong.
 *
 * **Only the first hop is trusted**, and only because the platform has exactly
 * one public surface in front of it. A client can send its own
 * `X-Forwarded-For`, so the leftmost entry is attacker-controlled on any
 * deployment where something other than our own edge can reach the API — which
 * constitution V says is none. If that ever stops being true, this is the line
 * that has to change.
 */
function addressOf(request: {
  headers?: Record<string, unknown>;
  ip?: string;
  socket?: { remoteAddress?: string };
}): string {
  const forwarded = request.headers?.['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof first === 'string' && first.length > 0) {
    return first.split(',')[0]?.trim() || 'unknown';
  }
  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}

/**
 * A limit on every entry point (P11, T1114).
 *
 * ## Four buckets, because they are four different questions
 *
 * - **anonymous** — no principal yet: sign-in, registration, the refresh
 *   exchange. Counted by address, and the tightest of the four, because it is
 *   the one a credential-stuffing attempt uses.
 * - **internal** — a machine principal on `/internal/*`. Counted by its client
 *   id, and generous: these are our own scheduled jobs.
 * - **graphql** — a signed-in read. Counted by member, and looser than
 *   commands because one screen is several reads.
 * - **rest** — a signed-in command.
 *
 * One bucket for all four would mean the sign-in limit and the nightly sweep's
 * limit were the same number, and no single number is right for both.
 *
 * ## Global, and what that means for a route that is exempt
 *
 * Bound as an application guard, so a route added later is limited by default
 * rather than by somebody remembering. Nothing is exempt: `/health` is behind
 * the anonymous limit too, and that is deliberate — a health endpoint anybody
 * may poll without limit is a health endpoint anybody may use to make the
 * database busy.
 *
 * ## Failing open
 *
 * If the registry cannot be read, the call proceeds. A limiter that refused
 * every request when the settings store hiccuped would turn a slow database
 * into a total outage, which is a worse failure than the one it guards against
 * — and the guard is a ceiling on abuse, not an authorisation decision. The
 * authorisation guards fail closed; this one does not.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly limiter: RateLimiter,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const kind = context.getType<string>();
    // The socket counts its own messages in the gateway: a Socket.IO event has
    // no response to carry a `Retry-After`, and refusing it as an exception
    // would disconnect a client that merely needs to slow down.
    if (kind === 'ws') return true;

    const bucket = this.bucketFor(context);
    if (!bucket) return true;

    let limit: number;
    try {
      limit = (await this.settings.get(bucket.setting)) as number;
    } catch (error) {
      this.logger.warn(
        `${bucket.setting} unreadable, not limiting this call: ${(error as Error).message}`,
      );
      return true;
    }

    const verdict = this.limiter.take(bucket.name, bucket.key, limit, WINDOW_MS);
    if (verdict.allowed) return true;

    const seconds = Math.max(Math.ceil(verdict.retryAfterMs / 1000), 1);
    // 429 with `Retry-After`, which is what a well-behaved client backs off on.
    // A bare 429 leaves it guessing, and the guess is usually "immediately".
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'too_many_requests',
        message: `Too many requests. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`,
        retryAfterSeconds: seconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** Exposed for the spec: the classification is the part worth pinning. */
  bucketFor(context: ExecutionContext): Bucket | null {
    const principal = principalFrom(context);
    const graphql = context.getType<string>() === 'graphql';
    const request = graphql
      ? context.getArgByIndex(2)?.req
      : context.switchToHttp().getRequest();

    if (!request) return null;

    if (!principal) {
      return {
        name: 'anonymous',
        key: addressOf(request),
        setting: 'limits.anonymousPerMinute',
      };
    }

    if (principal.kind === 'service') {
      return {
        name: 'internal',
        key: principal.id,
        setting: 'limits.internalPerMinute',
      };
    }

    return graphql
      ? { name: 'graphql', key: principal.id, setting: 'limits.graphqlPerMinute' }
      : { name: 'rest', key: principal.id, setting: 'limits.restPerMinute' };
  }
}

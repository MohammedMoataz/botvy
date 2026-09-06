import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, of, switchMap, tap } from 'rxjs';
import { principalFrom } from '../auth/principal-from-context.js';
import {
  IdempotencyStore,
  idempotencyId,
  readIdempotencyKey,
} from './idempotency.js';

/**
 * Replays the first answer when a command arrives twice under the same
 * `Idempotency-Key`.
 *
 * The phone creates rows offline and flushes them later, so a dropped
 * connection means a retry that must not create a second row. The aggregate's
 * own unique constraint already makes the *write* a no-op; this makes the
 * *answer* identical too, which is what stops a client treating the second
 * attempt as a different outcome.
 *
 * Only commands carry the header. A query replayed is just a query.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly store: IdempotencyStore) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const key = readIdempotencyKey(request?.headers);
    const principal = principalFrom(context);

    if (!key || !principal) return next.handle();

    const id = idempotencyId(principal, key);
    const route = `${request.method} ${request.route?.path ?? request.url}`;

    return from(this.store.find(id)).pipe(
      switchMap((existing) => {
        if (existing) return of(existing.response);

        return next.handle().pipe(
          tap((response) => {
            // Recorded after the handler succeeded. Remembering first would
            // replay an answer for work that then failed.
            void this.store
              .remember({ id, route, status: 200, response, createdAt: new Date() })
              .catch(() => undefined);
          }),
        );
      }),
    );
  }
}

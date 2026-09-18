import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ENV } from '../../../../shared/config/config.module.js';
import type { Env } from '../../../../shared/config/env.schema.js';
import { AdminCredentialsQueryHandler } from './admin-credentials.query.js';
import { AdminSeedService } from './admin-seed.service.js';
import { ServiceClientSeedService } from './service-client-seed.service.js';

/**
 * Runs the two seeds when the backend starts: the administrator the Owner
 * first signs in with, and the `n8n` service client whose token is
 * INTERNAL_SERVICE_TOKEN. Both are idempotent, so a restart changes nothing.
 *
 * Backend role only. The worker shares the image and the module, and two
 * processes seeding the same rows at the same moment is a race nobody needs.
 * Generation mode has no store and skips too.
 */
@Injectable()
export class IdentityBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(IdentityBootstrap.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly admin: AdminSeedService,
    private readonly credentials: AdminCredentialsQueryHandler,
    private readonly serviceClients: ServiceClientSeedService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.BOTVY_GEN || this.env.BOTVY_ROLE !== 'backend') return;

    /*
     * A first install has no schema yet, and that must not be fatal (P11).
     *
     * The documented order is `up -d` then `node infra/bootstrap.mjs`, and
     * bootstrap applies the migrations by `exec`-ing into **this** container —
     * so a seed that throws here takes the process down before there is
     * anything to exec into, and the install cannot proceed at all. The
     * symptom on a genuinely empty database was
     * `The table 'public.users' does not exist`, every ten seconds, for ever.
     *
     * It stayed invisible for eleven phases because no installation ever had an
     * empty PostgreSQL: the volume always predated the container. The first
     * genuine first-install found it immediately, which is what a first install
     * is for.
     *
     * So the missing schema is reported and the application starts. Bootstrap
     * then migrates and restarts this container, and the seeds run for real on
     * the way back up.
     */
    try {
      await this.seed();
    } catch (error) {
      /*
       * A first install has no schema yet, and that must not be fatal (P11).
       *
       * Asked by **doing the work and catching the one error that means "no
       * schema"**, rather than by probing first. The probe is what the first
       * attempt at this used, and it did not work: it called
       * `seededAdminIsStillDefault()`, which returns early — before it touches
       * the database at all — whenever the operator has changed both
       * `ADMIN_EMAIL` and `ADMIN_PASSWORD` away from the shipped pair. That is
       * every real installation. So the probe answered a clean `false`, the
       * guard read that as "the schema is fine", and the seed below died on
       * `public.users` exactly as before.
       *
       * It looked fixed for three days because the only databases it ran
       * against already had their schema. CI's fresh one found it in 153
       * seconds, and could only say so once the job started keeping the
       * container's log.
       *
       * The lesson is the general one: a readiness check that shares a code
       * path with a business rule inherits its short circuits. This one cannot
       * — the error it catches can only come from the query actually running.
       */
      if (!isMissingSchema(error)) throw error;
      this.logger.warn(
        'The Identity schema has not been applied yet, so the administrator and ' +
          'service-client seeds are skipped. Run `node infra/bootstrap.mjs`; it ' +
          'applies both sets of migrations and restarts this service.',
      );
    }
  }

  private async seed(): Promise<void> {
    const outcome = await this.admin.seed(
      this.env.ADMIN_EMAIL,
      this.env.ADMIN_PASSWORD,
    );
    this.logger.log(`administrator seed: ${outcome}`);

    // Through the query rather than the seed, because Operations asks the same
    // question through the same handler. Two implementations of "is this still
    // the shipped password" would eventually disagree, and the one that drifts
    // is the one nobody is looking at.
    this.admin.warnIfDefault(
      this.env.ADMIN_EMAIL,
      await this.credentials.seededAdminIsStillDefault(),
    );
    // Recorded in the registry too, so the portal can say it on every page
    // load rather than only in the seconds after a restart — by Operations,
    // which owns that key. `OperationsBootstrap` runs straight after this one,
    // because its module imports this one.

    const client = await this.serviceClients.seed(
      this.env.INTERNAL_SERVICE_TOKEN,
    );
    this.logger.log(`service client seed: ${client}`);
  }
}

/**
 * Whether this error is PostgreSQL telling us Identity's tables are not there.
 *
 * Narrow on purpose. Anything else — the database refusing connections, a
 * password that does not work, a typo in `DATABASE_URL` — must reach the
 * operator as a failed boot rather than as a silent start with no
 * administrator, which is the failure this whole path exists to make loud.
 *
 * Prisma's code is the primary signal; the message is checked too, for the
 * benefit of any adapter that does not set one.
 */
function isMissingSchema(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  const message = (error as Error)?.message ?? '';
  return (
    code === 'P2021' || /does not exist in the current database/i.test(message)
  );
}

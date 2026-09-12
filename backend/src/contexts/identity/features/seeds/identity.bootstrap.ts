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
    if (!(await this.schemaIsReady())) {
      this.logger.warn(
        'The Identity schema has not been applied yet, so the administrator and ' +
          'service-client seeds are skipped. Run `node infra/bootstrap.mjs`; it ' +
          'applies both sets of migrations and restarts this service.',
      );
      return;
    }

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

  /**
   * Whether Identity's tables exist.
   *
   * Asked by doing the cheapest read there is and catching the one error that
   * means "no schema". Anything else — the database refusing connections, a
   * password that does not work — is **rethrown**, because those are faults the
   * operator has to see rather than reasons to start half-configured. A blanket
   * catch here would turn a wrong `DATABASE_URL` into a silent boot with no
   * administrator, which is the failure this method exists to make loud.
   */
  private async schemaIsReady(): Promise<boolean> {
    try {
      await this.credentials.seededAdminIsStillDefault();
      return true;
    } catch (error) {
      // Prisma's code for "the table does not exist", and the message for the
      // benefit of any adapter that does not set one.
      const code = (error as { code?: string }).code;
      const message = (error as Error).message ?? '';
      if (code === 'P2021' || /does not exist in the current database/i.test(message)) {
        return false;
      }
      throw error;
    }
  }
}

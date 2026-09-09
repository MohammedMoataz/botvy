import { Module } from '@nestjs/common';
import { AuthModule } from './shared/auth/auth.module.js';
import { PlatformModule } from './shared/platform/platform.module.js';
import { CqrsModule } from '@nestjs/cqrs';
import { IdentityModule } from './contexts/identity/identity.module.js';
import { OperationsModule } from './contexts/operations/operations.module.js';
import { ProfileModule } from './contexts/profile/profile.module.js';
import { ConfigModule } from './shared/config/config.module.js';
import { HealthzController } from './shared/health/healthz.controller.js';
import { OutboxModule } from './shared/outbox/outbox.module.js';
import { RelayModule } from './shared/outbox/relay.module.js';
import { MongoPersistenceModule } from './shared/persistence/mongo/mongoose.module.js';
import { PrismaModule } from './shared/persistence/prisma/prisma.module.js';

/**
 * The worker role: the outbox relay, the identity forwarder and the scheduled
 * work, with no public edge.
 *
 * It carries no authentication guards because it serves exactly one route,
 * `/healthz`, to the container runtime on the Docker network. Everything else
 * it does is driven by the outbox and by n8n calling the *backend's*
 * `/internal/*` endpoints — never this process directly. It imports the same
 * context modules as the backend for their services; the routes stay with the
 * backend because they are declared there, not in the modules.
 */
@Module({
  imports: [
    AuthModule,
    PlatformModule,
    ConfigModule,
    CqrsModule.forRoot(),
    PrismaModule,
    MongoPersistenceModule,
    IdentityModule,
    OutboxModule,
    OperationsModule,
    ProfileModule,
    RelayModule,
  ],
  controllers: [HealthzController],
})
export class WorkerModule {}

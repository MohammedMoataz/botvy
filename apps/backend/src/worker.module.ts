import { Module } from '@nestjs/common';
import { AuthModule } from './shared/auth/auth.module.js';
import { PlatformModule } from './shared/platform/platform.module.js';
import { CqrsModule } from '@nestjs/cqrs';
import { IdentityModule } from './contexts/identity/identity.module.js';
import { OperationsModule } from './contexts/operations/operations.module.js';
import { NotificationsModule } from './contexts/notifications/notifications.module.js';
import { SyncModule } from './contexts/sync/sync.module.js';
import { PlanningModule } from './contexts/planning/planning.module.js';
import { RemindersModule } from './contexts/reminders/reminders.module.js';
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
    // For `LabelSnapshotHandler`, which reacts to `planning.LabelUpdated` in
    // the relay, and for `PurgeTaskHandler.purgeTombstones`, which the sweep
    // dispatches. Neither has an HTTP surface, which is why they belong here.
    PlanningModule,
    // For `ReminderLifecycleHandler.purgeTombstones`, the other half of the
    // command the sweep dispatches rather than doing itself.
    RemindersModule,
    // The alert planning saga reacts to events from four contexts, so it runs
    // where the relay runs. The sweep's own route stays with the backend.
    NotificationsModule,
    // For `NudgeOnChangesHandler`, which turns `sync.ChangesApplied` into a
    // socket nudge and therefore runs where the relay runs.
    SyncModule,
    RelayModule,
  ],
  controllers: [HealthzController],
})
export class WorkerModule {}

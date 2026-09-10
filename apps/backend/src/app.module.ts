import { Module } from '@nestjs/common';
import { PlatformModule } from './shared/platform/platform.module.js';
import { APP_GUARD } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { IdentityModule } from './contexts/identity/identity.module.js';
import { InternalAlertsController } from './contexts/operations/features/internal-alerts/internal-alerts.controller.js';
import { InternalHeartbeatController } from './contexts/operations/features/internal-heartbeat/internal-heartbeat.controller.js';
import { AdminController } from './contexts/identity/features/admin-members/admin.controller.js';
import { AuthController } from './contexts/identity/features/sign-in/auth.controller.js';
import { PingController } from './contexts/operations/features/ping/ping.controller.js';
import { OperationsModule } from './contexts/operations/operations.module.js';
import { PlanningModule } from './contexts/planning/planning.module.js';
import { ProfileModule } from './contexts/profile/profile.module.js';
import { TasksController } from './contexts/planning/features/create-task/tasks.controller.js';
import { SettingsController } from './contexts/operations/features/patch-setting/settings.controller.js';
import { ProfileController } from './contexts/profile/features/update-profile/profile.controller.js';
import { AuthModule } from './shared/auth/auth.module.js';
import { JwtAuthGuard } from './shared/auth/jwt-auth.guard.js';
import { KindGuard } from './shared/auth/kind.guard.js';
import { RolesGuard } from './shared/auth/roles.guard.js';
import { ServiceTokenGuard } from './shared/auth/service-token.guard.js';
import { ConfigModule } from './shared/config/config.module.js';
import { HealthModule } from './shared/health/health.module.js';
import { OutboxModule } from './shared/outbox/outbox.module.js';
import { MongoPersistenceModule } from './shared/persistence/mongo/mongoose.module.js';
import { PrismaModule } from './shared/persistence/prisma/prisma.module.js';
import { GraphQLModule } from './graphql/graphql.module.js';
import { WsModule } from './ws/ws.module.js';

/**
 * The backend role: the public edge.
 *
 * The guards are registered globally and in this order. Authentication decides
 * who a caller is — a JWT for members, a service token for machines on the
 * routes marked for them; the kind check decides whether that sort of caller
 * belongs on the route at all; the role check decides whether they are allowed
 * the particular thing. Registering them per-controller instead would protect
 * the controllers someone remembered, and the endpoint added in a hurry is the
 * one that ships open.
 *
 * The routes are declared here rather than in the context modules so that the
 * worker, which imports the same modules for their services, mounts none of
 * them.
 */
@Module({
  imports: [
    PlatformModule,
    ConfigModule,
    AuthModule,
    CqrsModule.forRoot(),
    PrismaModule,
    MongoPersistenceModule,
    IdentityModule,
    OutboxModule,
    OperationsModule,
    ProfileModule,
    PlanningModule,
    HealthModule,

    // The other two edges. Commands are REST above; these are the reads and the
    // live connection, and the worker imports neither - it has no HTTP surface
    // and nothing is watching from inside it.
    GraphQLModule,
    WsModule,
  ],
  // Declared here rather than on IdentityModule, because the worker imports
  // that module too and would otherwise mount the auth routes as well. One
  // image, two roles: only the backend role has an HTTP surface.
  controllers: [
    AuthController,
    AdminController,
    ProfileController,
    SettingsController,
    PingController,
    TasksController,
    InternalAlertsController,
    InternalHeartbeatController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: ServiceTokenGuard },
    { provide: APP_GUARD, useClass: KindGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

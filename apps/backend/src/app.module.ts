import { Module } from '@nestjs/common';
import { PlatformModule } from './shared/platform/platform.module.js';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from './shared/rate-limit/rate-limit.guard.js';
import { CqrsModule } from '@nestjs/cqrs';
import { IdentityModule } from './contexts/identity/identity.module.js';
import { InternalAlertsController } from './contexts/operations/features/internal-alerts/internal-alerts.controller.js';
import { InternalBackupsController } from './contexts/operations/features/backup-report/internal-backups.controller.js';
import { InternalHeartbeatController } from './contexts/operations/features/internal-heartbeat/internal-heartbeat.controller.js';
import { AdminController } from './contexts/identity/features/admin-members/admin.controller.js';
import { AuthController } from './contexts/identity/features/sign-in/auth.controller.js';
import { OperationsModule } from './contexts/operations/operations.module.js';
import { NotificationsModule } from './contexts/notifications/notifications.module.js';
import { InternalSweepController } from './contexts/notifications/features/sweep/internal-sweep.controller.js';
import { PlanningModule } from './contexts/planning/planning.module.js';
import { RemindersModule } from './contexts/reminders/reminders.module.js';
import { CalendarEventsController } from './contexts/meetings/features/create-event/calendar-events.controller.js';
import { MeetingsController } from './contexts/meetings/features/create-meeting/meetings.controller.js';
import { MeetingsModule } from './contexts/meetings/meetings.module.js';
import { AthleteController } from './contexts/training/features/choose-sports/athlete.controller.js';
import { ProgramsController } from './contexts/training/features/create-program/programs.controller.js';
import { SessionsController } from './contexts/training/features/create-session/sessions.controller.js';
import { WorkoutsController } from './contexts/training/features/create-workout/workouts.controller.js';
import { InternalMaterialiseController } from './contexts/training/features/materialise/internal-materialise.controller.js';
import { TrainingModule } from './contexts/training/training.module.js';
import { LinksController } from './contexts/knowledge/features/add-link/links.controller.js';
import { SuggestionsController } from './contexts/knowledge/features/accept-suggestion/suggestions.controller.js';
import { AdminKnowledgeController } from './contexts/knowledge/features/admin-clear-link/admin-knowledge.controller.js';
import { InternalIngestController } from './contexts/knowledge/features/ingest-link/internal-ingest.controller.js';
import { KnowledgeModule } from './contexts/knowledge/knowledge.module.js';
import { MealsController } from './contexts/nutrition/features/add-meal/meals.controller.js';
import { AdminWorkflowsController } from './contexts/operations/features/workflows/admin-workflows.controller.js';
import { NutritionModule } from './contexts/nutrition/nutrition.module.js';
import { InternalReconcileController } from './contexts/notifications/features/reconcile-meeting-alerts/internal-reconcile.controller.js';
import { SyncModule } from './contexts/sync/sync.module.js';
import { RhythmModule } from './contexts/rhythm/rhythm.module.js';
import { ConversationsModule } from './contexts/conversations/conversations.module.js';
import { InternalRhythmController } from './contexts/rhythm/features/tick/internal-rhythm.controller.js';
import { RhythmController } from './contexts/rhythm/features/confirm-plan/rhythm.controller.js';
import { ConversationsController } from './contexts/conversations/features/manage-conversation/conversations.controller.js';
import { ConversationsBatchController } from './contexts/conversations/features/batch/conversations.batch.controller.js';
import { QuickQuestionsController } from './contexts/conversations/features/quick-questions/quick-questions.controller.js';
import { SyncController } from './contexts/sync/features/sync/sync.controller.js';
import { RemindersController } from './contexts/reminders/features/manage-reminder/reminders.controller.js';
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
import { MediaController } from './shared/media/media.controller.js';
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
    RemindersModule,
    NotificationsModule,
    ConversationsModule,
    RhythmModule,
    MeetingsModule,
    TrainingModule,
    KnowledgeModule,
    NutritionModule,
    SyncModule,
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
    TasksController,
    RemindersController,
    InternalSweepController,
    InternalRhythmController,
    RhythmController,
    ConversationsController,
    ConversationsBatchController,
    QuickQuestionsController,
    MeetingsController,
    CalendarEventsController,
    InternalReconcileController,
    AthleteController,
    SessionsController,
    ProgramsController,
    WorkoutsController,
    InternalMaterialiseController,
    LinksController,
    MealsController,
    AdminWorkflowsController,
    SuggestionsController,
    AdminKnowledgeController,
    InternalIngestController,
    /*
     * The signed image proxy, and the one controller in this list that lives
     * in `shared/`.
     *
     * It belongs to no context: `media.signing.ts` was ported in P0 and
     * `rest-commands.md` has listed `GET /media` since the blueprint, with
     * nothing behind it until P7 gave the product its first external images.
     * Declaring it here rather than in `HealthModule` or `KnowledgeModule`
     * keeps it out of the worker — which imports the contexts for their
     * services and must mount no public route — and keeps a context from
     * owning a capability three of them will eventually want.
     */
    MediaController,
    SyncController,
    InternalAlertsController,
    InternalBackupsController,
    InternalHeartbeatController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: ServiceTokenGuard },
    { provide: APP_GUARD, useClass: KindGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Last, so a refused call has already been identified: the limit a caller
    // is held to depends on which principal they are, and a limiter that ran
    // before authentication would count every signed-in member as anonymous.
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ENV } from '../../shared/config/config.module.js';
import type { Env } from '../../shared/config/env.schema.js';
import { OutboxModule } from '../../shared/outbox/outbox.module.js';
import { MongoUnitOfWork } from '../../shared/persistence/mongo/mongo-unit-of-work.js';
import {
  AuditLogSchema,
  HeartbeatSchema,
  MODEL_NAMES,
  SettingSchema,
  UsageLogSchema,
} from '../../shared/persistence/mongo/schemas.js';
import { UnitOfWork } from '../../shared/persistence/ports/unit-of-work.js';
import { PushService } from '../../shared/push/push.service.js';
import { IdentityModule } from '../identity/identity.module.js';
import { UsageRepository } from './domain/usage.repository.js';
import { AdminPasswordFlagHandler } from './features/admin-password-flag/admin-password-flag.handler.js';
import { OperationsBootstrap } from './features/admin-password-flag/operations.bootstrap.js';
import { OperationsPurgeOnDeletedHandler } from './features/purge-on-deleted/purge-on-deleted.handler.js';
import { RecordUsageHandler } from './features/record-usage/record-usage.handler.js';
import { UsageTodayQueryHandler } from './features/usage-today/usage-today.query.js';
import {
  ADMIN_DEVICE_LOOKUP,
  SeededAdminDeviceLookup,
} from './infrastructure/admin-device.lookup.js';
import {
  ADMIN_PASSWORD_PROBE,
  IdentityAdminPasswordProbe,
} from './infrastructure/admin-password.probe.js';
import { MongoUsageRepository } from './infrastructure/mongo-usage.repository.js';
import { MongoAuditReadRepository } from './infrastructure/mongo-audit-read.repository.js';
import { IdentityActorLabels } from './infrastructure/operations-audit.adapter.js';
import { AuditReadRepository } from './domain/audit.repository.js';
import { ActorLabelPort, AuditQueryHandler } from './features/audit/audit.query.js';
import { UsageQueryHandler } from './features/usage/usage.query.js';
import { WorkflowsPort } from './domain/workflows.port.js';
import { N8nWorkflowsAdapter } from './infrastructure/n8n-workflows.adapter.js';

/**
 * Operations: settings, heartbeats, the audit trail and the demonstration
 * slice, all on MongoDB. Providers only — the controllers are declared by the
 * backend role, so importing this module into the worker gives it the
 * services and none of the routes.
 */
@Module({
  imports: [
    OutboxModule,
    IdentityModule,
    MongooseModule.forFeature([
      { name: MODEL_NAMES.heartbeat, schema: HeartbeatSchema },
      { name: MODEL_NAMES.setting, schema: SettingSchema },
      { name: MODEL_NAMES.auditLog, schema: AuditLogSchema },
      { name: MODEL_NAMES.usageLog, schema: UsageLogSchema },
    ]),
  ],
  providers: [
    { provide: UnitOfWork, useExisting: MongoUnitOfWork },
    {
      provide: PushService,
      inject: [ENV],
      useFactory: (env: Env) => {
        const push = new PushService(env.FIREBASE_CREDENTIALS_FILE);
        push.initialise();
        return push;
      },
    },
    { provide: ADMIN_DEVICE_LOOKUP, useClass: SeededAdminDeviceLookup },
    { provide: ADMIN_PASSWORD_PROBE, useClass: IdentityAdminPasswordProbe },
    /*
     * `useFactory` with an explicit `inject`, not `useClass`, and the reason is
     * the Nest failure mode this repo has been bitten by: a constructor
     * parameter whose type carries no runtime token — a `Model<T>` from
     * Mongoose among them — emits nothing for the injector to resolve and fails
     * at *boot* with `UnknownDependenciesException`, not at build. The model
     * token has to be named, so it is named. Same shape as `PlatformModule`'s
     * settings, audit and heartbeat adapters, and as `RemindersModule`'s
     * repository.
     *
     * The abstract class is the token: `UsageRepository` is declared in
     * `domain/` and every consumer depends on that, so the handler and the
     * query handler never learn which store is behind them and their specs bind
     * the in-memory twin instead.
     */
    {
      provide: UsageRepository,
      inject: [getModelToken(MODEL_NAMES.usageLog)],
      useFactory: (model: Model<Record<string, unknown>>) =>
        new MongoUsageRepository(model),
    },
    /*
     * The audit *reader*, which is a different port from the writer.
     *
     * `AuditPort` lives in `shared/` because four consumers across three
     * contexts record through it, and giving that shared token a `list` method
     * would hand every one of them the whole trail. The reader belongs to the
     * context that owns `audit_log`, which is this one.
     */
    {
      provide: AuditReadRepository,
      inject: [getModelToken(MODEL_NAMES.auditLog)],
      useFactory: (model: Model<Record<string, unknown>>) =>
        new MongoAuditReadRepository(model),
    },
    { provide: ActorLabelPort, useClass: IdentityActorLabels },
    /*
     * A factory, because the adapter takes the parsed `Env` and assigns its own
     * `fetch`. A constructor parameter typed `typeof fetch` emits `Function`,
     * which Nest tries to resolve and cannot — an `UnknownDependenciesException`
     * at boot that no typecheck sees.
     */
    {
      provide: WorkflowsPort,
      inject: [ENV],
      useFactory: (env: Env) => new N8nWorkflowsAdapter(env),
    },
    AuditQueryHandler,
    UsageQueryHandler,
    AdminPasswordFlagHandler,
    OperationsBootstrap,
    RecordUsageHandler,
    UsageTodayQueryHandler,
    OperationsPurgeOnDeletedHandler,
  ],
  // The shared-kernel services are no longer re-exported: `PlatformModule` is
  // global, so a context that needs `SettingsService` or `AuditPort` gets it
  // without naming anybody. Re-exporting them here is what made this module
  // look like the only way to reach them, and then made Identity import it.
  exports: [
    UnitOfWork,
    PushService,
    ADMIN_DEVICE_LOOKUP,
    AdminPasswordFlagHandler,
    MongooseModule,
    /*
     * The usage loop's two published surfaces.
     *
     * `RecordUsageHandler` is exported for `relay.module.ts`'s dispatch table,
     * which is where a `conversations.MessageSent` reaches it — and a handler
     * that is provided but not named in that table is never called and nothing
     * fails, which is how `bootstrap-on-registered` and `purge-on-deleted` both
     * sat dead for a phase. `UsageTodayQueryHandler` is exported because
     * Conversations' `infrastructure/` binds its `UsagePort` to it; a
     * `*.query.ts` handler is this context's published read surface, and
     * `usage_log` itself stays private to Operations.
     *
     * `UsageRepository` is deliberately **not** exported. Nothing outside this
     * context has any business appending to or deleting from `usage_log`, and
     * exporting the port is how the query surface above stops being the only way
     * in.
     */
    RecordUsageHandler,
    UsageTodayQueryHandler,
    OperationsPurgeOnDeletedHandler,
    /*
     * The Owner's two reads, for `graphql.module.ts`'s resolver list.
     *
     * Exported rather than only provided, for the reason every controller in
     * `AppModule` needs its handlers exported: Nest resolves a resolver's
     * dependencies from the module that *declares* it, and the resolvers are
     * declared over there so the worker can import this module without gaining
     * a GraphQL surface. The failure is an `UnknownDependenciesException` at
     * boot that no typecheck sees.
     */
    AuditQueryHandler,
    UsageQueryHandler,
    /*
     * For the admin controller, which `AppModule` declares — Nest resolves a
     * controller's dependencies from the module that declares it, so a port
     * merely provided here would be a boot failure over there.
     */
    WorkflowsPort,
  ],
})
export class OperationsModule {}

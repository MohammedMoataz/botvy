import { Global, Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AuditPort } from '../audit/audit.port.js';
import { HeartbeatRepository } from '../../contexts/operations/domain/heartbeat.repository.js';
import {
  MongoAuditAdapter,
  MongoHeartbeatRepository,
  MongoSettingsStore,
} from '../../contexts/operations/infrastructure/mongo-operations.adapters.js';
import { EVENT_SCHEMA_VERSION, contextOf } from '../cqrs/domain-event.js';
import { newId } from '../cqrs/ids.js';
import { HeartbeatService } from '../health/heartbeat.service.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { OutboxWriter } from '../outbox/outbox-writer.js';
import {
  AuditLogSchema,
  HeartbeatSchema,
  MODEL_NAMES,
  SettingSchema,
} from '../persistence/mongo/schemas.js';
import {
  SETTINGS_EVENT_SINK,
  SettingsService,
  type SettingsEventSink,
} from '../settings/settings.service.js';
import { SettingsStore } from '../settings/settings.store.js';

type AnyModel = Model<Record<string, unknown>>;

/**
 * The three things every context reads, provided once and globally.
 *
 * `SettingsService`, `AuditPort` and `HeartbeatService` are shared kernel by
 * design rather than by convenience. The constitution says an operator knob is
 * a registry key and an administrative action leaves an audit row — so *every*
 * context needs both, and Identity's ban, role change and service-client
 * commands are named in the audit port's own docstring as its callers.
 *
 * They used to be provided by `OperationsModule`, and that was a boot failure
 * waiting to be noticed. `OperationsModule` imports `IdentityModule` (it needs
 * the devices query to reach an administrator's phone), so Identity could not
 * import it back for `AuditPort` without a cycle — and Identity's providers
 * asked for `AuditPort` anyway. The graph did not resolve, in either role, and
 * no test saw it because every spec hand-builds its providers instead of
 * compiling a module.
 *
 * Global, so a context declares no import for them at all. That is the point:
 * a shared-kernel service reached through an import is a service some context
 * will eventually reach *around*.
 *
 * The Mongo adapters still live under `contexts/operations/infrastructure/`,
 * because those collections are Operations'. What moved is where the binding is
 * declared, not who owns the data.
 */
@Global()
@Module({
  imports: [
    OutboxModule,
    MongooseModule.forFeature([
      { name: MODEL_NAMES.setting, schema: SettingSchema },
      { name: MODEL_NAMES.auditLog, schema: AuditLogSchema },
      { name: MODEL_NAMES.heartbeat, schema: HeartbeatSchema },
    ]),
  ],
  providers: [
    {
      provide: SettingsStore,
      inject: [getModelToken(MODEL_NAMES.setting)],
      useFactory: (model: AnyModel) => new MongoSettingsStore(model),
    },
    {
      provide: AuditPort,
      inject: [getModelToken(MODEL_NAMES.auditLog)],
      useFactory: (model: AnyModel) => new MongoAuditAdapter(model),
    },
    {
      provide: HeartbeatRepository,
      inject: [getModelToken(MODEL_NAMES.heartbeat)],
      useFactory: (model: AnyModel) => new MongoHeartbeatRepository(model),
    },
    {
      // A changed setting is an event like any other: through the outbox, so
      // the other role's cache learns about it the same way n8n would.
      provide: SETTINGS_EVENT_SINK,
      inject: [OutboxWriter],
      useFactory: (writer: OutboxWriter): SettingsEventSink => ({
        publish: (name, payload) =>
          writer.append([
            {
              eventId: newId(),
              name,
              context: contextOf(name),
              aggregate: {
                type: 'setting',
                id: String((payload as { key?: string })?.key ?? ''),
              },
              userId: null,
              occurredAt: new Date(),
              payload,
              schemaVersion: EVENT_SCHEMA_VERSION,
            },
          ]),
      }),
    },
    SettingsService,
    HeartbeatService,
  ],
  exports: [
    SettingsStore,
    SettingsService,
    AuditPort,
    HeartbeatRepository,
    HeartbeatService,
    MongooseModule,
  ],
})
export class PlatformModule {}

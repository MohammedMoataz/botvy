import { Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { HeartbeatService } from '../../shared/health/heartbeat.service.js';
import { MemberContextPort } from '../../shared/member/member-context.port.js';
import { OutboxModule } from '../../shared/outbox/outbox.module.js';
import type { OutboxInsert } from '../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../shared/persistence/mongo/mongo-unit-of-work.js';
import {
  AlertSchema,
  MODEL_NAMES,
} from '../../shared/persistence/mongo/schemas.js';
import { UnitOfWork } from '../../shared/persistence/ports/unit-of-work.js';
import { PushService } from '../../shared/push/push.service.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { IdentityModule } from '../identity/identity.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { MeetingsModule } from '../meetings/meetings.module.js';
import { TrainingModule } from '../training/training.module.js';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';
import { PlanningModule } from '../planning/planning.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import { RemindersModule } from '../reminders/reminders.module.js';
import { AlertRepository } from './domain/alert.repository.js';
import {
  DeviceLookupPort,
  DeviceRemovalPort,
  MeetingMembersPort,
  MeetingOccurrencesPort,
  TombstonePurgePort,
} from './domain/notification.ports.js';
import { PendingAlertsQueryHandler } from './features/pending-alerts/pending-alerts.query.js';
import { NotificationsPurgeOnDeletedHandler } from './features/purge-on-deleted/purge-on-deleted.handler.js';
import {
  ALERT_ID,
  PlanAlertsSaga,
  type AlertIdFactory,
} from './features/plan-alerts-saga/plan-alerts.saga.js';
import { SweepHandler } from './features/sweep/sweep.handler.js';
import { ReconcileMeetingAlertsHandler } from './features/reconcile-meeting-alerts/reconcile-meeting-alerts.handler.js';
import {
  IdentityDeviceLookup,
  IdentityDeviceRemoval,
  MeetingsMemberLookup,
  MeetingsOccurrenceLookup,
  MeetingsTombstonePurge,
  TrainingTombstonePurge,
  KnowledgeTombstonePurge,
  PlanningTombstonePurge,
  RemindersTombstonePurge,
} from './infrastructure/notification.adapters.js';
import {
  MongoAlertRepository,
  newAlertId,
  type AlertDoc,
} from './infrastructure/mongo-alert.repository.js';

/**
 * The token the sweep injects to get every context that owns tombstones.
 *
 * A multi-provider array rather than two named dependencies, so P5's meetings
 * and P6's sessions join by adding a provider here instead of by editing the
 * sweep. The sweep's job is to run on a timer and add up what the owners
 * report; which owners exist is not its business.
 */
export const TOMBSTONE_PURGES = Symbol('TOMBSTONE_PURGES');

/**
 * Notifications: one place that decides when to tell the member something, and
 * one place that tells them.
 *
 * It imports four other context modules, which looks like a lot until you see
 * *what for*: every one is a binding for a port declared in this context's own
 * `domain/`, made in this context's own `infrastructure/`. Nothing in `domain/`
 * or `features/` imports any of them — the saga takes `MemberContextPort` and
 * the sweep takes three abstract ports, and neither can name a context. That is
 * the seam constitution IX sanctions, and the lint rule enforces the half of it
 * that matters by refusing such an import anywhere but `infrastructure/`.
 */
@Module({
  imports: [
    OutboxModule,
    OperationsModule,
    ProfileModule,
    IdentityModule,
    PlanningModule,
    RemindersModule,
    MeetingsModule,
    TrainingModule,
    KnowledgeModule,
    MongooseModule.forFeature([
      { name: MODEL_NAMES.alert, schema: AlertSchema },
    ]),
  ],
  providers: [
    {
      provide: AlertRepository,
      inject: [
        getModelToken(MODEL_NAMES.alert),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (model: Model<AlertDoc>, outbox: Model<OutboxInsert>) =>
        new MongoAlertRepository(model, outbox),
    },
    {
      // Server-only rows, so ObjectIds. A token rather than a call inside the
      // saga, because the in-memory adapter mints its own sortable ids and a
      // spec has to be able to substitute them.
      provide: ALERT_ID,
      useValue: newAlertId satisfies AlertIdFactory,
    },
    { provide: DeviceLookupPort, useClass: IdentityDeviceLookup },
    { provide: DeviceRemovalPort, useClass: IdentityDeviceRemoval },
    // Where an occurrence falls, and which members have a diary at all. Both
    // are Meetings' published surface: this context owns `alerts` and may not
    // read `meetings`, and the rule for a recurring meeting is never expanded
    // into rows, so there is nothing to read even if it could.
    { provide: MeetingOccurrencesPort, useClass: MeetingsOccurrenceLookup },
    { provide: MeetingMembersPort, useClass: MeetingsMemberLookup },
    PlanningTombstonePurge,
    RemindersTombstonePurge,
    MeetingsTombstonePurge,
    TrainingTombstonePurge,
    KnowledgeTombstonePurge,
    {
      provide: TOMBSTONE_PURGES,
      inject: [
        PlanningTombstonePurge,
        RemindersTombstonePurge,
        MeetingsTombstonePurge,
        TrainingTombstonePurge,
        KnowledgeTombstonePurge,
      ],
      useFactory: (...purges: TombstonePurgePort[]) => purges,
    },
    /*
     * The meeting window's reconciliation, and it is provided *before* the saga
     * because the saga takes it.
     *
     * A recurring meeting has many occurrences under one meeting id, and P2's
     * `reconcile` keys on the alert's label alone — so reusing it would have
     * occurrence two's `30m` warning overwrite occurrence one's. This handler
     * keys on `alertKey` (`kind:id:occurrenceMs:label`) instead, which is also
     * what `source.occurrenceAt` is on the row for. The task and reminder paths
     * are untouched, which is why it is a sibling rather than a widening.
     */
    {
      provide: ReconcileMeetingAlertsHandler,
      inject: [
        UnitOfWork,
        AlertRepository,
        MemberContextPort,
        MeetingOccurrencesPort,
        MeetingMembersPort,
        SettingsService,
        HeartbeatService,
        ALERT_ID,
      ],
      useFactory: (
        uow: UnitOfWork,
        alerts: AlertRepository,
        member: MemberContextPort,
        occurrences: MeetingOccurrencesPort,
        members: MeetingMembersPort,
        settings: SettingsService,
        heartbeats: HeartbeatService,
        nextId: AlertIdFactory,
      ) =>
        new ReconcileMeetingAlertsHandler(
          uow,
          alerts,
          member,
          occurrences,
          members,
          settings,
          heartbeats,
          nextId,
        ),
    },
    {
      provide: PlanAlertsSaga,
      inject: [
        UnitOfWork,
        AlertRepository,
        MemberContextPort,
        ALERT_ID,
        ReconcileMeetingAlertsHandler,
      ],
      useFactory: (
        uow: UnitOfWork,
        alerts: AlertRepository,
        member: MemberContextPort,
        nextId: AlertIdFactory,
        meetings: ReconcileMeetingAlertsHandler,
      ) => new PlanAlertsSaga(uow, alerts, member, nextId, meetings),
    },
    {
      provide: SweepHandler,
      inject: [
        UnitOfWork,
        AlertRepository,
        DeviceLookupPort,
        DeviceRemovalPort,
        TOMBSTONE_PURGES,
        PushService,
        SettingsService,
        HeartbeatService,
      ],
      useFactory: (
        uow: UnitOfWork,
        alerts: AlertRepository,
        devices: DeviceLookupPort,
        removal: DeviceRemovalPort,
        purges: TombstonePurgePort[],
        push: PushService,
        settings: SettingsService,
        heartbeats: HeartbeatService,
      ) =>
        new SweepHandler(
          uow,
          alerts,
          devices,
          removal,
          purges,
          push,
          settings,
          heartbeats,
        ),
    },
    PendingAlertsQueryHandler,
    NotificationsPurgeOnDeletedHandler,
    MongoUnitOfWork,
    { provide: UnitOfWork, useExisting: MongoUnitOfWork },
  ],
  exports: [
    NotificationsPurgeOnDeletedHandler,
    AlertRepository,
    PlanAlertsSaga,
    SweepHandler,
    PendingAlertsQueryHandler,
    DeviceLookupPort,
    // For the internal controller the backend role declares, and for the gate.
    ReconcileMeetingAlertsHandler,
  ],
})
export class NotificationsModule {}

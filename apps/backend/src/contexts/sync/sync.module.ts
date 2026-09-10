import { Module } from '@nestjs/common';
import { MemberContextPort } from '../../shared/member/member-context.port.js';
import { OutboxModule } from '../../shared/outbox/outbox.module.js';
import { OutboxWriter } from '../../shared/outbox/outbox-writer.js';
import { UnitOfWork } from '../../shared/persistence/ports/unit-of-work.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { WsModule } from '../../ws/ws.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RhythmModule } from '../rhythm/rhythm.module.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { ConversationRepository } from '../conversations/domain/conversations.repositories.js';
import { ConversationSyncAdapter } from '../conversations/infrastructure/conversations-sync.adapter.js';
import {
  CheckinRepository,
  DailyPlanRepository,
  RhythmStateRepository,
} from '../rhythm/domain/rhythm.repositories.js';
import {
  CheckinSyncAdapter,
  DailyPlanSyncAdapter,
  RhythmStateSyncAdapter,
} from '../rhythm/infrastructure/rhythm-sync.adapters.js';
import { OperationsModule } from '../operations/operations.module.js';
import { LabelRepository } from '../planning/domain/label.repository.js';
import { TaskRepository } from '../planning/domain/task.repository.js';
import {
  LabelSyncAdapter,
  TaskSyncAdapter,
} from '../planning/infrastructure/planning-sync.adapters.js';
import { PlanningModule } from '../planning/planning.module.js';
import {
  PreferencesPatchAdapter,
  ProfilePatchAdapter,
} from '../profile/infrastructure/profile-sync.adapters.js';
import { ProfileModule } from '../profile/profile.module.js';
import { ReminderRepository } from '../reminders/domain/reminder.repository.js';
import { ReminderSyncAdapter } from '../reminders/infrastructure/reminder-sync.adapter.js';
import { RemindersModule } from '../reminders/reminders.module.js';
import { ProfileQueryHandler } from '../profile/features/profile-query/profile.query.js';
import { UpdatePreferencesHandler } from '../profile/features/update-preferences/update-preferences.handler.js';
import { UpdateProfileHandler } from '../profile/features/update-profile/update-profile.handler.js';
import {
  DeviceTouchPort,
  PendingAlertsPort,
  SYNCABLE_ENTITIES,
  SYNCABLE_PATCHES,
  type SyncableEntity,
  type SyncablePatch,
} from './domain/syncable-entity.port.js';
import { NudgeOnChangesHandler } from './features/nudge-on-changes/nudge-on-changes.handler.js';
import { SyncHandler } from './features/sync/sync.handler.js';
import {
  IdentityDeviceTouch,
  NotificationsPendingAlerts,
} from './infrastructure/sync.adapters.js';

/**
 * Sync: one round trip that carries the whole offline contract.
 *
 * The facade owns no collection. What it owns is the *protocol* — the apply
 * order, the conflict rule's application, the cursor lag, the full-snapshot
 * decision — and it reaches every entity through `SyncableEntity`.
 *
 * ## The adapters are constructed here, and that is the compromise
 *
 * Each adapter belongs to the context whose store it reads, and each is
 * declared in that context's `infrastructure/`. But they are *provided* here,
 * because a multi-provider token has to be assembled somewhere and the facade
 * is the only place that knows the full list. The alternative — every context
 * module contributing to a token the facade defines — would have five modules
 * importing the Sync context, which is a worse direction: the facade depending
 * on the contexts is a dependency the architecture already accepts, where the
 * contexts depending on the facade is one it does not.
 *
 * So P5 adds meetings by writing an adapter in Meetings' `infrastructure/` and
 * adding one line to this file, which is the seam being deliberately kept in
 * one visible place rather than spread across five modules.
 */
@Module({
  imports: [
    OutboxModule,
    OperationsModule,
    IdentityModule,
    ProfileModule,
    PlanningModule,
    RemindersModule,
    NotificationsModule,
    RhythmModule,
    ConversationsModule,
    WsModule,
  ],
  providers: [
    // ---- the row-shaped entities, in apply order --------------------------
    {
      provide: LabelSyncAdapter,
      inject: [UnitOfWork, LabelRepository],
      useFactory: (uow: UnitOfWork, labels: LabelRepository) =>
        new LabelSyncAdapter(uow, labels),
    },
    {
      provide: TaskSyncAdapter,
      inject: [UnitOfWork, TaskRepository, LabelRepository, MemberContextPort],
      useFactory: (
        uow: UnitOfWork,
        tasks: TaskRepository,
        labels: LabelRepository,
        member: MemberContextPort,
      ) => new TaskSyncAdapter(uow, tasks, labels, member),
    },
    {
      provide: ReminderSyncAdapter,
      inject: [UnitOfWork, ReminderRepository],
      useFactory: (uow: UnitOfWork, reminders: ReminderRepository) =>
        new ReminderSyncAdapter(uow, reminders),
    },
    /*
     * The rhythm's two row entities, both **pull-only**.
     *
     * They are here so the phone can hold a copy and render Home with the
     * network off, and their `apply` refuses with `invalid` — the two writes
     * are REST commands (`/rhythm/plans/:date/confirm`, `/rhythm/checkins`),
     * because a named-command push would have needed a third protocol beside
     * the row and patch ones to buy an atomicity neither of them needs.
     * `contracts/sync.md` carries the full argument.
     */
    {
      provide: DailyPlanSyncAdapter,
      inject: [DailyPlanRepository],
      useFactory: (plans: DailyPlanRepository) =>
        new DailyPlanSyncAdapter(plans),
    },
    {
      provide: CheckinSyncAdapter,
      inject: [CheckinRepository],
      useFactory: (checkins: CheckinRepository) =>
        new CheckinSyncAdapter(checkins),
    },
    /*
     * The chat list, pull-only until P4.
     *
     * It is here in P3 because FR-005 requires every member to *have* the coach
     * conversation from the moment they register, and without a read surface
     * that requirement is unverifiable from outside the process — while its
     * failure is silent, because a touch written into a missing conversation
     * logs and carries on looking successful.
     */
    {
      provide: ConversationSyncAdapter,
      inject: [ConversationRepository],
      useFactory: (conversations: ConversationRepository) =>
        new ConversationSyncAdapter(conversations),
    },
    {
      provide: SYNCABLE_ENTITIES,
      inject: [
        LabelSyncAdapter,
        TaskSyncAdapter,
        ReminderSyncAdapter,
        DailyPlanSyncAdapter,
        CheckinSyncAdapter,
        ConversationSyncAdapter,
      ],
      useFactory: (...adapters: SyncableEntity[]) => adapters,
    },

    // ---- the patch-shaped entities ---------------------------------------
    {
      provide: ProfilePatchAdapter,
      inject: [UpdateProfileHandler, ProfileQueryHandler],
      useFactory: (
        profiles: UpdateProfileHandler,
        queries: ProfileQueryHandler,
      ) => new ProfilePatchAdapter(profiles, queries),
    },
    {
      provide: PreferencesPatchAdapter,
      inject: [UpdatePreferencesHandler, ProfileQueryHandler],
      useFactory: (
        preferences: UpdatePreferencesHandler,
        queries: ProfileQueryHandler,
      ) => new PreferencesPatchAdapter(preferences, queries),
    },
    /*
     * `rhythm_state` is patch-shaped rather than row-shaped: one singleton row
     * per member, so `pull` returning the row or null is the honest signature
     * and an array of one would be a lie the phone had to unwrap. Its
     * `applyPatch` refuses — the three claim dates are the server's entire
     * once-a-day guarantee, and a phone that could write them could suppress
     * or re-fire its own member's evening.
     */
    {
      provide: RhythmStateSyncAdapter,
      inject: [RhythmStateRepository],
      useFactory: (states: RhythmStateRepository) =>
        new RhythmStateSyncAdapter(states),
    },
    {
      provide: SYNCABLE_PATCHES,
      inject: [
        ProfilePatchAdapter,
        PreferencesPatchAdapter,
        RhythmStateSyncAdapter,
      ],
      useFactory: (...adapters: SyncablePatch[]) => adapters,
    },

    // ---- what the facade needs from elsewhere ----------------------------
    { provide: DeviceTouchPort, useClass: IdentityDeviceTouch },
    { provide: PendingAlertsPort, useClass: NotificationsPendingAlerts },

    {
      provide: SyncHandler,
      inject: [
        SYNCABLE_ENTITIES,
        SYNCABLE_PATCHES,
        DeviceTouchPort,
        PendingAlertsPort,
        SettingsService,
        OutboxWriter,
      ],
      useFactory: (
        entities: SyncableEntity[],
        patches: SyncablePatch[],
        devices: DeviceTouchPort,
        alerts: PendingAlertsPort,
        settings: SettingsService,
        outbox: OutboxWriter,
      ) =>
        new SyncHandler(entities, patches, devices, alerts, settings, outbox),
    },
    NudgeOnChangesHandler,
  ],
  exports: [
    SyncHandler,
    NudgeOnChangesHandler,
    SYNCABLE_ENTITIES,
    SYNCABLE_PATCHES,
  ],
})
export class SyncModule {}

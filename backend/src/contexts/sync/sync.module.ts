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
import {
  ConversationRepository,
  MessageRepository,
} from '../conversations/domain/conversations.repositories.js';
import { ConversationSyncAdapter } from '../conversations/infrastructure/conversations-sync.adapter.js';
import { MessageSyncAdapter } from '../conversations/infrastructure/messages-sync.adapter.js';
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
import {
  CalendarEventRepository,
  MeetingRepository,
} from '../meetings/domain/meetings.repositories.js';
import { CalendarEventSyncAdapter } from '../meetings/infrastructure/calendar-event-sync.adapter.js';
import { MeetingSyncAdapter } from '../meetings/infrastructure/meeting-sync.adapter.js';
import { MeetingsModule } from '../meetings/meetings.module.js';
import {
  AthleteProfileRepository,
  ProgramRepository,
  SessionRepository,
  WorkoutRepository,
} from '../training/domain/training.repositories.js';
import {
  AthleteProfilePatchAdapter,
  ProgramSyncAdapter,
  SessionSyncAdapter,
  WorkoutSyncAdapter,
} from '../training/infrastructure/training-sync.adapters.js';
import { TrainingModule } from '../training/training.module.js';
import { LinkRepository } from '../knowledge/domain/knowledge.repositories.js';
import { LinkSyncAdapter } from '../knowledge/infrastructure/knowledge-sync.adapter.js';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';
import { MealRepository } from '../nutrition/domain/nutrition.repositories.js';
import { MealSyncAdapter } from '../nutrition/infrastructure/nutrition-sync.adapter.js';
import { NutritionModule } from '../nutrition/nutrition.module.js';
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
    MeetingsModule,
    TrainingModule,
    KnowledgeModule,
    NutritionModule,
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
     * Meetings' two collections, both pull and push.
     *
     * 32 and 34 — `contracts/sync.md`'s `entities` order, after reminders at 30
     * and before the rhythm's three at 40. Not a dependency, unlike labels
     * before tasks: a meeting references nothing and nothing references a
     * meeting, and the adapters say so in their own comments rather than
     * leaving the number to look like one. The gaps leave room for an entity
     * that ever does.
     */
    {
      provide: MeetingSyncAdapter,
      inject: [UnitOfWork, MeetingRepository, MemberContextPort],
      useFactory: (
        uow: UnitOfWork,
        meetings: MeetingRepository,
        member: MemberContextPort,
      ) => new MeetingSyncAdapter(uow, meetings, member),
    },
    {
      provide: CalendarEventSyncAdapter,
      inject: [UnitOfWork, CalendarEventRepository, MemberContextPort],
      useFactory: (
        uow: UnitOfWork,
        events: CalendarEventRepository,
        member: MemberContextPort,
      ) => new CalendarEventSyncAdapter(uow, events, member),
    },
    /*
     * Training's three row collections. 35, 37, 39 — `contracts/sync.md`'s
     * order, after the calendar events at 34 and before the rhythm's three at
     * 40.
     *
     * Programs before sessions is the contract's own parents-before-children
     * clause and **not** a dependency here: no session apply reads a program,
     * and `programId`/`weekIndex` on a session are opaque values the
     * materialiser wrote. The adapters say so in their own comments rather than
     * leaving the numbers to look like a rule, and the gaps at 36 and 38 leave
     * room for the day P7's accepted suggestion makes it real.
     */
    {
      provide: ProgramSyncAdapter,
      inject: [UnitOfWork, ProgramRepository],
      useFactory: (uow: UnitOfWork, programs: ProgramRepository) =>
        new ProgramSyncAdapter(uow, programs),
    },
    {
      provide: SessionSyncAdapter,
      inject: [UnitOfWork, SessionRepository, AthleteProfileRepository],
      useFactory: (
        uow: UnitOfWork,
        sessions: SessionRepository,
        profiles: AthleteProfileRepository,
      ) => new SessionSyncAdapter(uow, sessions, profiles),
    },
    {
      provide: WorkoutSyncAdapter,
      inject: [UnitOfWork, WorkoutRepository],
      useFactory: (uow: UnitOfWork, workouts: WorkoutRepository) =>
        new WorkoutSyncAdapter(uow, workouts),
    },
    /*
     * P7's links. 45 — after Training's workouts at 39 and before the chat at
     * 50, which is where `contracts/sync.md`'s `entities` list puts them, with
     * 43 and 44 left for P8's meals. Not a dependency: a link references
     * nothing and nothing references a link.
     *
     * It takes the member's clock and the settings because the daily quota is
     * enforced on this path too — a create arriving in a batch is still a
     * member saving a link, and a path that skipped FR-015 would be the way
     * round it.
     */
    {
      provide: LinkSyncAdapter,
      inject: [UnitOfWork, LinkRepository, MemberContextPort, SettingsService],
      useFactory: (
        uow: UnitOfWork,
        links: LinkRepository,
        member: MemberContextPort,
        settings: SettingsService,
      ) => new LinkSyncAdapter(uow, links, member, settings),
    },
    /*
     * Meals, the plain shape: the whole row is the member's, so every operation
     * is accepted. Links are the exception on the other side of this line —
     * their interesting columns are the server's record of work it did, so an
     * `update` is refused.
     */
    {
      provide: MealSyncAdapter,
      inject: [UnitOfWork, MealRepository],
      useFactory: (uow: UnitOfWork, meals: MealRepository) =>
        new MealSyncAdapter(uow, meals),
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
     * The chat list, and from P4 a push as well.
     *
     * It arrived in P3 because FR-005 requires every member to *have* the coach
     * conversation from the moment they register, and without a read surface
     * that requirement is unverifiable from outside the process — while its
     * failure is silent, because a touch written into a missing conversation
     * logs and carries on looking successful. P4 adds the three pushed ops
     * (`upsert`, `delete`, `clear`) and with them the `UnitOfWork` this adapter
     * now needs: the pull never wrote anything, and the push saves an
     * aggregate whose events belong in the same transaction as the row.
     */
    {
      provide: ConversationSyncAdapter,
      inject: [UnitOfWork, ConversationRepository],
      useFactory: (uow: UnitOfWork, conversations: ConversationRepository) =>
        new ConversationSyncAdapter(uow, conversations),
    },
    /*
     * The transcript, pull-only and cursored by `seq`.
     *
     * Two repositories, both this context's own: the conversations to learn
     * each chat's clear watermark and the messages to read from it. That is
     * what makes `seq > max(lastSeq, clearedUpToSeq)` a property of the pull
     * rather than something every client has to reimplement — and FR-011's
     * second half, that nothing cleared reaches a device catching up later,
     * is exactly this line.
     *
     * `apply` refuses every push with `invalid`: a client that could insert a
     * message would choose its own `seq`, and the sequence is the one value in
     * this collection that nothing can repair afterwards. Offline messages go
     * through `POST /conversations/batch`.
     */
    {
      provide: MessageSyncAdapter,
      inject: [ConversationRepository, MessageRepository],
      useFactory: (
        conversations: ConversationRepository,
        messages: MessageRepository,
      ) => new MessageSyncAdapter(conversations, messages),
    },
    {
      /*
       * The order of this list is the *apply* order's tie-break and nothing
       * more: the facade sorts by `applyOrder` before applying and by the
       * reverse of it before pulling, so neither path depends on where an
       * adapter sits here. It is still written parents-then-children, because a
       * list that reads in a different order from the one it produces is a list
       * somebody will "fix".
       */
      provide: SYNCABLE_ENTITIES,
      inject: [
        LabelSyncAdapter,
        TaskSyncAdapter,
        ReminderSyncAdapter,
        MeetingSyncAdapter,
        CalendarEventSyncAdapter,
        ProgramSyncAdapter,
        SessionSyncAdapter,
        WorkoutSyncAdapter,
        LinkSyncAdapter,
        MealSyncAdapter,
        DailyPlanSyncAdapter,
        CheckinSyncAdapter,
        ConversationSyncAdapter,
        MessageSyncAdapter,
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
    /*
     * `athlete_profile` is the blueprint's own named exception to the row
     * protocol: one document per member, keyed by their id, no tombstone and
     * nothing to sweep — so it travels as a **patch** over an allowlist of
     * `sports` and `slots`, with no conflict check, because the fields a client
     * writes and the fields the server's jobs write are disjoint sets.
     *
     * It patches through the *aggregate* rather than the row, which is what
     * keeps `SportsChanged` and `SlotsChanged` reaching the materialiser — a
     * direct write would leave the member's week saved and their fortnight
     * unbuilt.
     */
    {
      provide: AthleteProfilePatchAdapter,
      inject: [UnitOfWork, AthleteProfileRepository],
      useFactory: (uow: UnitOfWork, profiles: AthleteProfileRepository) =>
        new AthleteProfilePatchAdapter(uow, profiles),
    },
    {
      provide: SYNCABLE_PATCHES,
      inject: [
        ProfilePatchAdapter,
        PreferencesPatchAdapter,
        AthleteProfilePatchAdapter,
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

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { OutboxModule } from '../../shared/outbox/outbox.module.js';
import type { OutboxInsert } from '../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../shared/persistence/mongo/mongo-unit-of-work.js';
import {
  ConversationSchema,
  CounterSchema,
  MODEL_NAMES,
  MessageSchema,
} from '../../shared/persistence/mongo/schemas.js';
import { UnitOfWork } from '../../shared/persistence/ports/unit-of-work.js';
import { NudgeService } from '../../ws/nudge.service.js';
import { WsModule } from '../../ws/ws.module.js';
import {
  ConversationRepository,
  MessageRepository,
  SeqPort,
} from './domain/conversations.repositories.js';
import {
  AppendMessageHandler,
  MESSAGE_ID,
  type MessageIdFactory,
} from './features/append-message/append-message.handler.js';
import { ConversationsBootstrapHandler } from './features/bootstrap-on-registered/bootstrap-on-registered.handler.js';
import { ConversationsPurgeOnDeletedHandler } from './features/purge-on-deleted/purge-on-deleted.handler.js';
import {
  MongoConversationRepository,
  MongoMessageRepository,
  newMessageId,
  type ConversationDoc,
  type MessageDoc,
} from './infrastructure/mongo-conversations.repositories.js';
import {
  MongoSeq,
  type CounterDoc,
} from './infrastructure/mongo-seq.adapter.js';
import {
  QuickQuestionSchema,
} from '../../shared/persistence/mongo/schemas.js';
import { LlmModule } from '../../shared/llm/llm.module.js';
import { MemberContextPort } from '../../shared/member/member-context.port.js';
import { OllamaClient } from '../../shared/llm/ollama.client.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { OperationsModule } from '../operations/operations.module.js';
import { PlanningModule } from '../planning/planning.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import { RemindersModule } from '../reminders/reminders.module.js';
import { RhythmModule } from '../rhythm/rhythm.module.js';
import { CancelTaskHandler } from '../planning/features/cancel-task/cancel-task.handler.js';
import { CreateTaskHandler } from '../planning/features/create-task/create-task.handler.js';
import { TasksQueryHandler } from '../planning/features/tasks-query/tasks.query.js';
import { ManageReminderHandler } from '../reminders/features/manage-reminder/manage-reminder.handler.js';
import { ReminderLifecycleHandler } from '../reminders/features/reminder-lifecycle/reminder-lifecycle.handler.js';
import { RemindersQueryHandler } from '../reminders/features/reminders-query/reminders.query.js';
import { CreateMeetingHandler } from '../meetings/features/create-meeting/create-meeting.handler.js';
import { MeetingQueryHandler } from '../meetings/features/meeting/meeting.query.js';
import { MeetingOccurrencesQueryHandler } from '../meetings/features/meeting-occurrences/meeting-occurrences.query.js';
import { MeetingsModule } from '../meetings/meetings.module.js';
import { AthleteProfileQueryHandler } from '../training/features/athlete-profile/athlete-profile.query.js';
import { CompleteSessionHandler } from '../training/features/complete-session/complete-session.handler.js';
import { LogSessionHandler } from '../training/features/log-session/log-session.handler.js';
import { SessionQueryHandler } from '../training/features/session/session.query.js';
import { SessionsQueryHandler } from '../training/features/sessions/sessions.query.js';
import { SetSlotsHandler } from '../training/features/set-slots/set-slots.handler.js';
import { NutritionModule } from '../nutrition/nutrition.module.js';
import { TrainingModule } from '../training/training.module.js';
import { ProfileQueryHandler } from '../profile/features/profile-query/profile.query.js';
import { UpdateProfileHandler } from '../profile/features/update-profile/update-profile.handler.js';
import { CaptureCheckinReplyHandler } from '../rhythm/features/capture-checkin-reply/capture-checkin-reply.handler.js';
import { CheckinsQueryHandler } from '../rhythm/features/checkins/checkins.query.js';
import { StreakQueryHandler } from '../rhythm/features/streak/streak.query.js';
import { TodayPlanQueryHandler } from '../rhythm/features/today-plan/today-plan.query.js';
import { UsageTodayQueryHandler } from '../operations/features/usage-today/usage-today.query.js';
import {
  AllergenGuardPort,
  CheckinPort,
  IntentExecutorPort,
  IntentExtractorPort,
  LatestCheckinPort,
  MemberDayPort,
  MeetingActionsPort,
  MemberFactsPort,
  NutritionActionsPort,
  TrainingActionsPort,
  TrainingSummaryPort,
  PlannerActionsPort,
  ProfileWritesPort,
  PromptAssemblerPort,
  UsagePort,
} from './domain/chat.ports.js';
import { QuickQuestionRepository } from './domain/quick-question.repository.js';
import { AllergenGuard } from './application/allergen-guard.js';
import { IntentExecutor } from './application/intent-executor.js';
import { IntentExtractor } from './application/intent-extractor.js';
import { PromptAssembler } from './application/prompt-assembler.js';
import { TurnRunner } from './application/turn-runner.js';
import { ArchiveConversationHandler } from './features/archive/archive-conversation.handler.js';
import { BatchHandler } from './features/batch/batch.handler.js';
import { ClearConversationHandler } from './features/clear/clear-conversation.handler.js';
import { CloseOnBannedHandler } from './features/close-on-banned/close-on-banned.handler.js';
import { ConversationsQueryHandler } from './features/conversations/conversations.query.js';
import { CreateConversationHandler } from './features/create-conversation/create-conversation.handler.js';
import { DeleteConversationHandler } from './features/delete/delete-conversation.handler.js';
import { MessagesQueryHandler } from './features/messages/messages.query.js';
import { PinConversationHandler } from './features/pin/pin-conversation.handler.js';
import { ManageQuickQuestionHandler } from './features/quick-questions/manage-quick-question.handler.js';
import { QuickQuestionsQueryHandler } from './features/quick-questions/quick-questions.query.js';
import { RenameConversationHandler } from './features/rename/rename-conversation.handler.js';
import { ChatGateway } from './features/send-message/chat.gateway.js';
import {
  MeetingsChatActions,
  OperationsUsage,
  NutritionChatActions,
  TrainingChatActions,
  TrainingWeekSummary,
  PlanningReminderActions,
  ProfileChatWrites,
  ProfileMemberFacts,
  RhythmCheckins,
  RhythmLatestCheckin,
  RhythmMemberDay,
} from './infrastructure/chat.adapters.js';
import {
  MongoQuickQuestionRepository,
  type QuickQuestionDoc,
} from './infrastructure/mongo-quick-question.repository.js';

/**
 * Conversations: where a message is written down.
 *
 * Providers only, like `RemindersModule` — no controller and no resolver. In
 * this phase nothing outside the platform talks to this context: the writes
 * come from the rhythm's tick, which runs in the worker, and the reads arrive
 * in P4 with the chat surface. A module that exported an HTTP surface now would
 * be exporting one the worker also has to carry.
 *
 * Which is why `WsModule` being here is worth a note. It is the backend role's
 * module — the worker has no socket server — and `NudgeService.emit` is a no-op
 * with none attached, by design: a heartbeat from inside the worker is not a
 * failed nudge, it is a nudge nobody was watching for. So a touch written by
 * the worker reaches the member's devices on their next pull rather than on the
 * socket, which is the same guarantee every other row in this product has.
 *
 * Three models rather than two, because the counter is a collection of this
 * context's own: `counters` holds `"<userId>:messages"` and nothing else reads
 * it.
 */
@Module({
  imports: [
    OutboxModule,
    WsModule,
    LlmModule,
    /*
     * Five contexts, and every one of them is here for a *port binding* in
     * `infrastructure/chat.adapters.ts` and for nothing else.
     *
     * The module is imported so Nest can find the provider; the dependency in
     * the code is on the abstract port. Nothing under `domain/`,
     * `application/` or `features/` imports any of these — `no-restricted-imports`
     * refuses it there — so this list is the whole of what the chat is coupled
     * to, and it is deliberately visible in one place.
     *
     * It is also the longest such list in the system, which is what the chat
     * *is*: the surface where a member's own words reach every other context.
     * A shorter list would mean the coach knew less about them.
     */
    ProfileModule,
    PlanningModule,
    RemindersModule,
    MeetingsModule,
    /*
     * Training, from P6, and one-directionally.
     *
     * Two things come from it: `set_slots` and `log_session` write through
     * `TrainingActionsPort`, and the coach prompt's `Training:` line comes
     * through `TrainingSummaryPort`. Nothing in Training reads Conversations —
     * its `ProgramApplied` reaches the chat through the outbox — so there is no
     * cycle and no `forwardRef`, unlike the Rhythm pair below.
     */
    TrainingModule,
    /*
     * Nutrition, from P8, and one-directionally — one binding.
     *
     * `add_meal` writes through `NutritionActionsPort`. The coach's *reading*
     * of the day's food does not come from here at all: it rides
     * `daily_plans.mealLine` and `mealReason`, which the rhythm already gives
     * the prompt, so an answer about meals matches what the member was shown
     * (FR-012) without a second read of a second collection.
     */
    NutritionModule,
    /*
     * `forwardRef`, because this edge is genuinely bidirectional.
     *
     * P3's rhythm writes its three daily touches into the coach chat through
     * `CoachTranscriptPort`, so `RhythmModule` imports this one. P4's chat
     * reads the plan, the streak and the check-in through three ports of its
     * own, so this one imports `RhythmModule`. Both directions are ports bound
     * in `infrastructure/` — the sanctioned seam — so the cycle is a DI
     * artifact rather than a domain one: no aggregate here knows a rhythm
     * aggregate exists.
     *
     * Worth resisting the instinct to "fix" it by making one side an event.
     * The rhythm composes the sentence and hands it over; an event carrying
     * that sentence would put chat copy in a rhythm event payload, and
     * `contracts/events.md` says plainly that the rhythm writes its own
     * touches. Two ports and one `forwardRef` is the smaller thing.
     */
    forwardRef(() => RhythmModule),
    OperationsModule,
    MongooseModule.forFeature([
      { name: MODEL_NAMES.conversation, schema: ConversationSchema },
      { name: MODEL_NAMES.message, schema: MessageSchema },
      { name: MODEL_NAMES.counter, schema: CounterSchema },
      { name: MODEL_NAMES.quickQuestion, schema: QuickQuestionSchema },
    ]),
  ],
  providers: [
    {
      provide: ConversationRepository,
      inject: [
        getModelToken(MODEL_NAMES.conversation),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (
        model: Model<ConversationDoc>,
        outbox: Model<OutboxInsert>,
      ) => new MongoConversationRepository(model, outbox),
    },
    {
      provide: MessageRepository,
      inject: [
        getModelToken(MODEL_NAMES.message),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (model: Model<MessageDoc>, outbox: Model<OutboxInsert>) =>
        new MongoMessageRepository(model, outbox),
    },
    {
      provide: SeqPort,
      inject: [getModelToken(MODEL_NAMES.counter)],
      useFactory: (model: Model<CounterDoc>) => new MongoSeq(model),
    },
    {
      // Server-minted ObjectIds, so a token rather than a call inside the
      // handler: the in-memory adapter mints its own sortable ids and a spec
      // has to be able to substitute them.
      provide: MESSAGE_ID,
      useValue: newMessageId satisfies MessageIdFactory,
    },
    {
      /*
       * Every dependency named explicitly, and none of them inferred.
       *
       * `MessageIdFactory` is a type alias for a function — it emits no runtime
       * token at all — so a constructor parameter typed with it resolves to
       * `undefined` and Nest fails at boot with `UnknownDependenciesException`
       * rather than at build. The abstract-class ports above would in fact
       * reflect, but the factory is written out in full for all six so that the
       * list of what this handler needs is readable in one place.
       */
      provide: AppendMessageHandler,
      inject: [
        UnitOfWork,
        ConversationRepository,
        MessageRepository,
        SeqPort,
        NudgeService,
        MESSAGE_ID,
      ],
      useFactory: (
        uow: UnitOfWork,
        conversations: ConversationRepository,
        messages: MessageRepository,
        seq: SeqPort,
        nudges: NudgeService,
        nextId: MessageIdFactory,
      ) =>
        new AppendMessageHandler(
          uow,
          conversations,
          messages,
          seq,
          nudges,
          nextId,
        ),
    },
    ConversationsBootstrapHandler,
    ConversationsPurgeOnDeletedHandler,
    {
      provide: QuickQuestionRepository,
      inject: [getModelToken(MODEL_NAMES.quickQuestion)],
      useFactory: (model: Model<QuickQuestionDoc>) =>
        new MongoQuickQuestionRepository(model),
    },

    // ---- the ports, bound to the contexts that own the answers ----------
    {
      provide: MemberFactsPort,
      inject: [ProfileQueryHandler],
      useFactory: (profiles: ProfileQueryHandler) =>
        new ProfileMemberFacts(profiles),
    },
    {
      /*
       * The day the coach is told about, and from P6 its `trainingLine` is
       * Training's live week rather than the plan snapshot's one session.
       *
       * Worth naming, because it is a *replacement* and not an addition: the
       * snapshot's `training` field was written the night before, so a session
       * completed this morning still read as planned in the prompt. The week is
       * a superset and it is current. The snapshot keeps its field — it is the
       * record of what the day was going to hold, which is a different question.
       */
      provide: MemberDayPort,
      inject: [
        TodayPlanQueryHandler,
        StreakQueryHandler,
        ProfileQueryHandler,
        TrainingSummaryPort,
      ],
      useFactory: (
        plans: TodayPlanQueryHandler,
        streaks: StreakQueryHandler,
        profiles: ProfileQueryHandler,
        training: TrainingSummaryPort,
      ) => new RhythmMemberDay(plans, streaks, profiles, training),
    },
    /*
     * The coach's `Training:` line (FR-017).
     *
     * Its own port rather than a field on `TrainingActionsPort` because it is a
     * *read* that shapes what the model is told, where that one is a set of
     * writes the member asked for — and a reviewer reading the DI wiring should
     * be able to see which of the two a chat turn is doing.
     */
    { provide: TrainingSummaryPort, useClass: TrainingWeekSummary },
    /*
     * `set_slots` and `log_session`, which until P6 did not exist.
     *
     * Seven handlers, and that is the honest cost of a chat that can set a
     * training week: it needs the profile to merge slots against, the slot
     * write, two reads to find today's session, and two ways to record one. The
     * alternative was a Training-side "do what this sentence says" service,
     * which is a second place that would have to know what a chat sentence may
     * mean.
     */
    { provide: NutritionActionsPort, useClass: NutritionChatActions },
    {
      provide: TrainingActionsPort,
      inject: [
        AthleteProfileQueryHandler,
        SetSlotsHandler,
        SessionsQueryHandler,
        SessionQueryHandler,
        LogSessionHandler,
        CompleteSessionHandler,
        MemberContextPort,
      ],
      useFactory: (
        profiles: AthleteProfileQueryHandler,
        slots: SetSlotsHandler,
        sessions: SessionsQueryHandler,
        session: SessionQueryHandler,
        logs: LogSessionHandler,
        completions: CompleteSessionHandler,
        member: MemberContextPort,
      ) =>
        new TrainingChatActions(
          profiles,
          slots,
          sessions,
          session,
          logs,
          completions,
          member,
        ),
    },
    /*
     * `set_meeting`, which until P5 answered "not yet".
     *
     * The write goes through a port bound here rather than through an event,
     * for the reason `chat.ports.ts` gives about the planner's writes: FR-004
     * needs a synchronous confirmation naming the values that were **actually
     * stored**, and an event cannot answer a question. What it binds to is
     * Meetings' own command handler, so the length, the offsets and the
     * authoring zone are all resolved by the context that owns them.
     */
    {
      provide: MeetingActionsPort,
      inject: [
        CreateMeetingHandler,
        MeetingQueryHandler,
        MeetingOccurrencesQueryHandler,
        MemberContextPort,
      ],
      useFactory: (
        meetings: CreateMeetingHandler,
        queries: MeetingQueryHandler,
        occurrences: MeetingOccurrencesQueryHandler,
        member: MemberContextPort,
      ) => new MeetingsChatActions(meetings, queries, occurrences, member),
    },
    {
      provide: PlannerActionsPort,
      inject: [
        CreateTaskHandler,
        TasksQueryHandler,
        CancelTaskHandler,
        ManageReminderHandler,
        RemindersQueryHandler,
        ReminderLifecycleHandler,
      ],
      useFactory: (
        tasks: CreateTaskHandler,
        taskQueries: TasksQueryHandler,
        cancelTask: CancelTaskHandler,
        reminders: ManageReminderHandler,
        reminderQueries: RemindersQueryHandler,
        lifecycle: ReminderLifecycleHandler,
      ) =>
        new PlanningReminderActions(
          tasks,
          taskQueries,
          cancelTask,
          reminders,
          reminderQueries,
          lifecycle,
        ),
    },
    {
      provide: ProfileWritesPort,
      inject: [UpdateProfileHandler],
      useFactory: (profiles: UpdateProfileHandler) =>
        new ProfileChatWrites(profiles),
    },
    {
      provide: UsagePort,
      inject: [UsageTodayQueryHandler],
      useFactory: (usage: UsageTodayQueryHandler) => new OperationsUsage(usage),
    },
    {
      provide: CheckinPort,
      inject: [CaptureCheckinReplyHandler],
      useFactory: (replies: CaptureCheckinReplyHandler) =>
        new RhythmCheckins(replies),
    },
    {
      provide: LatestCheckinPort,
      inject: [CheckinsQueryHandler, ProfileQueryHandler],
      useFactory: (
        checkins: CheckinsQueryHandler,
        profiles: ProfileQueryHandler,
      ) => new RhythmLatestCheckin(checkins, profiles),
    },

    // ---- the turn's four collaborators ----------------------------------
    {
      provide: IntentExtractorPort,
      inject: [OllamaClient, SettingsService],
      useFactory: (llm: OllamaClient, settings: SettingsService) =>
        new IntentExtractor(llm, settings),
    },
    {
      provide: IntentExecutorPort,
      inject: [
        PlannerActionsPort,
        ProfileWritesPort,
        MeetingActionsPort,
        TrainingActionsPort,
        NutritionActionsPort,
      ],
      useFactory: (
        planner: PlannerActionsPort,
        profile: ProfileWritesPort,
        meetings: MeetingActionsPort,
        training: TrainingActionsPort,
        nutrition: NutritionActionsPort,
      ) =>
        new IntentExecutor(planner, profile, meetings, training, nutrition),
    },
    {
      provide: PromptAssemblerPort,
      inject: [MemberDayPort, MessageRepository, SettingsService],
      useFactory: (
        day: MemberDayPort,
        messages: MessageRepository,
        settings: SettingsService,
      ) => new PromptAssembler(day, messages, settings),
    },
    { provide: AllergenGuardPort, useClass: AllergenGuard },

    // ---- the turn, and the two ways in ----------------------------------
    TurnRunner,
    ChatGateway,
    BatchHandler,

    // ---- the slices -----------------------------------------------------
    CreateConversationHandler,
    RenameConversationHandler,
    PinConversationHandler,
    ArchiveConversationHandler,
    ClearConversationHandler,
    DeleteConversationHandler,
    CloseOnBannedHandler,
    ManageQuickQuestionHandler,
    ConversationsQueryHandler,
    MessagesQueryHandler,
    QuickQuestionsQueryHandler,

    MongoUnitOfWork,
    { provide: UnitOfWork, useExisting: MongoUnitOfWork },
  ],
  exports: [
    ConversationsBootstrapHandler,
    AppendMessageHandler,
    TurnRunner,
    BatchHandler,
    CloseOnBannedHandler,
    CreateConversationHandler,
    RenameConversationHandler,
    PinConversationHandler,
    ArchiveConversationHandler,
    ClearConversationHandler,
    DeleteConversationHandler,
    ManageQuickQuestionHandler,
    ConversationsQueryHandler,
    MessagesQueryHandler,
    QuickQuestionsQueryHandler,
    QuickQuestionRepository,
    ConversationsPurgeOnDeletedHandler,
    AppendMessageHandler,
    ConversationRepository,
    MessageRepository,
    SeqPort,
  ],
})
export class ConversationsModule {}

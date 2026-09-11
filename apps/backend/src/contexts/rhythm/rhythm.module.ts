import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { OutboxModule } from '../../shared/outbox/outbox.module.js';
import type { OutboxInsert } from '../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../shared/persistence/mongo/mongo-unit-of-work.js';
import {
  CheckinSchema,
  DailyPlanSchema,
  MODEL_NAMES,
  RhythmStateSchema,
} from '../../shared/persistence/mongo/schemas.js';
import { UnitOfWork } from '../../shared/persistence/ports/unit-of-work.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { AppendMessageHandler } from '../conversations/features/append-message/append-message.handler.js';
import { OperationsModule } from '../operations/operations.module.js';
import { TasksDueQueryHandler } from '../planning/features/tasks-due-query/tasks-due.query.js';
import { PlanningModule } from '../planning/planning.module.js';
import { MeetingOccurrencesQueryHandler } from '../meetings/features/meeting-occurrences/meeting-occurrences.query.js';
import { MeetingsModule } from '../meetings/meetings.module.js';
import { SessionsInRangeQueryHandler } from '../training/features/sessions/sessions-in-range.query.js';
import { NutritionModule } from '../nutrition/nutrition.module.js';
import { TrainingModule } from '../training/training.module.js';
import { ProfileQueryHandler } from '../profile/features/profile-query/profile.query.js';
import { ProfileModule } from '../profile/profile.module.js';
import {
  CoachTranscriptPort,
  MemberSchedulePort,
  MeetingsOnPort,
  NextSessionPort,
  PlannedTasksPort,
  TodayMealsPort,
} from './domain/rhythm.ports.js';
import {
  CheckinRepository,
  DailyPlanRepository,
  RhythmStateRepository,
} from './domain/rhythm.repositories.js';
import { RhythmBootstrapHandler } from './features/bootstrap-on-registered/bootstrap-on-registered.handler.js';
import { CaptureCheckinReplyHandler } from './features/capture-checkin-reply/capture-checkin-reply.handler.js';
import { CheckinsQueryHandler } from './features/checkins/checkins.query.js';
import { ConfirmPlanHandler } from './features/confirm-plan/confirm-plan.handler.js';
import { MealLineChangedHandler } from './features/meal-line-changed/meal-line-changed.handler.js';
import { PlansQueryHandler } from './features/plans/plans.query.js';
import { RhythmPreferencesChangedHandler } from './features/preferences-changed/preferences-changed.handler.js';
import { PromptNowHandler } from './features/prompt-now/prompt-now.handler.js';
import { RhythmPurgeOnDeletedHandler } from './features/purge-on-deleted/purge-on-deleted.handler.js';
import { RecordCheckinHandler } from './features/record-checkin/record-checkin.handler.js';
import { SkipPlanHandler } from './features/skip-plan/skip-plan.handler.js';
import { StreakQueryHandler } from './features/streak/streak.query.js';
import { DraftBuilder } from './features/tick/draft.builder.js';
import { TickHandler } from './features/tick/tick.handler.js';
import { TodayPlanQueryHandler } from './features/today-plan/today-plan.query.js';
import { TomorrowDraftQueryHandler } from './features/tomorrow-draft/tomorrow-draft.query.js';
import {
  MongoCheckinRepository,
  MongoDailyPlanRepository,
  MongoRhythmStateRepository,
  type CheckinDoc,
  type DailyPlanDoc,
  type RhythmStateDoc,
} from './infrastructure/mongo-rhythm.repositories.js';
import { ProfileMemberSchedule } from './infrastructure/rhythm-member-schedule.adapter.js';
import { TrainingNextSession } from './infrastructure/rhythm-next-session.stub.js';
import { MeetingsOnDate } from './infrastructure/rhythm-meetings.adapter.js';
import { PlanningPlannedTasks } from './infrastructure/rhythm-planned-tasks.adapter.js';
import { NutritionTodayMeals } from './infrastructure/rhythm-today-meals.adapter.js';
import { ConversationsCoachTranscript } from './infrastructure/rhythm-coach-transcript.adapter.js';

/**
 * Daily Rhythm: the per-member clock, and the three things it says every day.
 *
 * Providers only. Both controllers are declared by the backend role in
 * `AppModule`, so the worker can import this module — the relay needs
 * `RhythmBootstrapHandler`, `MealLineChangedHandler` and
 * `RhythmPurgeOnDeletedHandler` — without gaining an HTTP surface of its own.
 *
 * ## The five ports, and the two that answer nothing yet
 *
 * `MemberSchedulePort`, `PlannedTasksPort` and `CoachTranscriptPort` are bound
 * to Profile's, Planning's and Conversations' published query and command
 * handlers. Those three modules are imported so Nest can find the providers,
 * but the dependency in the code is on the port: nothing under
 * `contexts/rhythm/domain/` or `features/` imports another context, and
 * `no-restricted-imports` refuses it if anyone tries. `infrastructure/` is the
 * one layer allowed to know another context exists, because binding a local
 * port to somebody else's query is its job.
 *
 * `NextSessionPort` and `TodayMealsPort` were bound to stubs that returned
 * null, until P6 and P8 respectively. Both are real now, and the bet paid:
 * neither phase changed anything in the rhythm but the one line that binds the
 * port. The alternative was a branch inside the tick asking whether Training or
 * Nutrition existed yet, and that branch would still be there in P9.
 *
 * A null meal half is still ordinary and always will be — it is the shape of
 * "the model was unavailable this evening" as much as it was the shape of "P8
 * has not landed". The plan renders correctly without one.
 *
 * ## `TickHandler` is exported, and two slices depend on it
 *
 * `PromptNowHandler` and `CaptureCheckinReplyHandler` both hold it. That is
 * deliberate rather than a layering slip: an operator's Run button and a chat
 * reply both need to *perform a touch*, and the touch's claim-then-send
 * ordering exists in exactly one place. Two more copies of it is how one of
 * them comes to send twice.
 */
@Module({
  imports: [
    OutboxModule,
    OperationsModule,
    ProfileModule,
    PlanningModule,
    /*
     * Meetings, and **not** through `forwardRef`.
     *
     * The Rhythm-Conversations edge below is a genuine cycle — the rhythm
     * writes into the coach chat and the chat reads the plan — so it needs one.
     * This edge is one-directional: the rhythm asks where the day's meetings
     * are, and nothing in Meetings knows the rhythm exists. A `forwardRef` here
     * would be cargo, and it would hide a real cycle if one were ever
     * introduced.
     */
    MeetingsModule,
    /*
     * Training, one-directionally: the rhythm asks where the next session is,
     * and nothing in Training knows the rhythm exists. No `forwardRef` — see
     * the note in `training.module.ts`.
     */
    TrainingModule,
    /*
     * Nutrition, one-directionally: the rhythm asks what the member is eating,
     * and nothing in Nutrition knows the rhythm exists — it announces
     * `MealPlanReady` and `MealPlanWithheld` into the outbox and the relay
     * brings them back here. No `forwardRef`, for the reason the meetings note
     * above gives: one would be cargo, and it would hide a real cycle if one
     * were ever introduced.
     */
    NutritionModule,
    // The other half of the cycle — see the note in `conversations.module.ts`.
    forwardRef(() => ConversationsModule),
    MongooseModule.forFeature([
      { name: MODEL_NAMES.dailyPlan, schema: DailyPlanSchema },
      { name: MODEL_NAMES.checkin, schema: CheckinSchema },
      { name: MODEL_NAMES.rhythmState, schema: RhythmStateSchema },
    ]),
  ],
  providers: [
    // ---- the three stores this context owns ------------------------------
    {
      provide: DailyPlanRepository,
      inject: [
        getModelToken(MODEL_NAMES.dailyPlan),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (model: Model<DailyPlanDoc>, outbox: Model<OutboxInsert>) =>
        new MongoDailyPlanRepository(model, outbox),
    },
    {
      provide: CheckinRepository,
      inject: [
        getModelToken(MODEL_NAMES.checkin),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (model: Model<CheckinDoc>, outbox: Model<OutboxInsert>) =>
        new MongoCheckinRepository(model, outbox),
    },
    {
      provide: RhythmStateRepository,
      inject: [
        getModelToken(MODEL_NAMES.rhythmState),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (model: Model<RhythmStateDoc>, outbox: Model<OutboxInsert>) =>
        new MongoRhythmStateRepository(model, outbox),
    },

    // ---- the five ports, bound in this context's own infrastructure ------
    {
      provide: MemberSchedulePort,
      inject: [ProfileQueryHandler],
      useFactory: (profiles: ProfileQueryHandler) =>
        new ProfileMemberSchedule(profiles),
    },
    {
      provide: PlannedTasksPort,
      inject: [TasksDueQueryHandler],
      useFactory: (tasks: TasksDueQueryHandler) =>
        new PlanningPlannedTasks(tasks),
    },
    {
      provide: CoachTranscriptPort,
      inject: [AppendMessageHandler],
      useFactory: (append: AppendMessageHandler) =>
        new ConversationsCoachTranscript(append),
    },
    /*
     * The day's meetings, from P5.
     *
     * The sixth port, and the second one bound to a real context rather than a
     * stub. FR-012: both the evening proposal and the morning briefing name the
     * day's meetings — the briefing is the half that gets forgotten, so both
     * touches read this and `rhythm-meetings.spec.ts` asserts both.
     */
    {
      provide: MeetingsOnPort,
      inject: [MeetingOccurrencesQueryHandler],
      useFactory: (occurrences: MeetingOccurrencesQueryHandler) =>
        new MeetingsOnDate(occurrences),
    },
    /*
     * **P6 rebound this**, and it is worth marking because the file promised it
     * would be one line and it was.
     *
     * `NextSessionPort` held a null-returning stub from P3 to P6. Nothing in
     * the rhythm changed to bind it: the tick, the draft builder and the three
     * touch sentences have been calling a port all along, and the specs that
     * asserted a plan renders without training still do — the stub they bind is
     * settable now and still answers null by default. `TodayMealsPort` is the
     * remaining one, and P8 replaces it the same way.
     */
    {
      provide: NextSessionPort,
      inject: [SessionsInRangeQueryHandler],
      useFactory: (sessions: SessionsInRangeQueryHandler) =>
        new TrainingNextSession(sessions),
    },
    /*
     * **P8 rebound this**, and it was the one line the stub promised.
     *
     * `TodayMealsPort` held a null-returning stub from P3 to P8. What changed
     * in the rhythm is the port's *shape* — a half plus a withholding code
     * rather than a bare string — because the member reads the reason on their
     * own screen in their own language, and P3 had been storing an English
     * sentence into `mealLine` for a phone that renders Arabic. The line and
     * the code are separate columns now, and each surface renders the three.
     */
    { provide: TodayMealsPort, useClass: NutritionTodayMeals },

    // ---- the slices ------------------------------------------------------
    DraftBuilder,
    TickHandler,
    PromptNowHandler,
    RhythmBootstrapHandler,
    RhythmPreferencesChangedHandler,
    ConfirmPlanHandler,
    SkipPlanHandler,
    RecordCheckinHandler,
    CaptureCheckinReplyHandler,
    MealLineChangedHandler,
    RhythmPurgeOnDeletedHandler,
    TodayPlanQueryHandler,
    TomorrowDraftQueryHandler,
    PlansQueryHandler,
    CheckinsQueryHandler,
    StreakQueryHandler,

    MongoUnitOfWork,
    { provide: UnitOfWork, useExisting: MongoUnitOfWork },
  ],
  exports: [
    DailyPlanRepository,
    CheckinRepository,
    RhythmStateRepository,
    TickHandler,
    PromptNowHandler,
    RhythmBootstrapHandler,
    RhythmPreferencesChangedHandler,
    ConfirmPlanHandler,
    SkipPlanHandler,
    RecordCheckinHandler,
    CaptureCheckinReplyHandler,
    MealLineChangedHandler,
    RhythmPurgeOnDeletedHandler,
    TodayPlanQueryHandler,
    TomorrowDraftQueryHandler,
    PlansQueryHandler,
    CheckinsQueryHandler,
    StreakQueryHandler,
  ],
})
export class RhythmModule {}

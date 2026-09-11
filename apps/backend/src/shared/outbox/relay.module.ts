import { Module } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { IdentityOutboxRepository } from '../../contexts/identity/domain/identity-outbox.repository.js';
import { IdentityModule } from '../../contexts/identity/identity.module.js';
import { AdminPasswordFlagHandler } from '../../contexts/operations/features/admin-password-flag/admin-password-flag.handler.js';
import { BootstrapOnRegisteredHandler } from '../../contexts/profile/features/bootstrap-on-registered/bootstrap-on-registered.handler.js';
import { PurgeOnDeletedHandler } from '../../contexts/profile/features/purge-on-deleted/purge-on-deleted.handler.js';
import { PlanAlertsSaga } from '../../contexts/notifications/features/plan-alerts-saga/plan-alerts.saga.js';
import { NotificationsPurgeOnDeletedHandler } from '../../contexts/notifications/features/purge-on-deleted/purge-on-deleted.handler.js';
import { PlanningPurgeOnDeletedHandler } from '../../contexts/planning/features/purge-on-deleted/purge-on-deleted.handler.js';
import { RemindersPurgeOnDeletedHandler } from '../../contexts/reminders/features/purge-on-deleted/purge-on-deleted.handler.js';
import { RemindersModule } from '../../contexts/reminders/reminders.module.js';
import { MeetingsPurgeOnDeletedHandler } from '../../contexts/meetings/features/purge-on-deleted/purge-on-deleted.handler.js';
import { MeetingsModule } from '../../contexts/meetings/meetings.module.js';
import { BootstrapAthleteProfileHandler } from '../../contexts/training/features/bootstrap-athlete-profile/bootstrap-athlete-profile.handler.js';
import { SessionMaterialiserSaga } from '../../contexts/training/features/materialise/materialise.saga.js';
import { TrainingPurgeOnDeletedHandler } from '../../contexts/training/features/purge-on-deleted/purge-on-deleted.handler.js';
import { TrainingModule } from '../../contexts/training/training.module.js';
import { ApplySuggestionHandler } from '../../contexts/training/features/apply-suggestion/apply-suggestion.handler.js';
import { IngestLinkSaga } from '../../contexts/knowledge/features/ingest-link/ingest-link.saga.js';
import { GenerateSuggestionSaga } from '../../contexts/knowledge/features/generate-suggestion/generate-suggestion.saga.js';
import { RecordSuggestionOutcomeHandler } from '../../contexts/knowledge/features/accept-suggestion/accept-suggestion.handler.js';
import { KnowledgePurgeOnDeletedHandler } from '../../contexts/knowledge/features/purge-on-deleted/purge-on-deleted.handler.js';
import { KnowledgeModule } from '../../contexts/knowledge/knowledge.module.js';
import { NutritionModule } from '../../contexts/nutrition/nutrition.module.js';
import { NudgeOnChangesHandler } from '../../contexts/sync/features/nudge-on-changes/nudge-on-changes.handler.js';
import { ConversationsBootstrapHandler } from '../../contexts/conversations/features/bootstrap-on-registered/bootstrap-on-registered.handler.js';
import { ConversationsPurgeOnDeletedHandler } from '../../contexts/conversations/features/purge-on-deleted/purge-on-deleted.handler.js';
import { ConversationsModule } from '../../contexts/conversations/conversations.module.js';
import { RhythmBootstrapHandler } from '../../contexts/rhythm/features/bootstrap-on-registered/bootstrap-on-registered.handler.js';
import { RhythmPreferencesChangedHandler } from '../../contexts/rhythm/features/preferences-changed/preferences-changed.handler.js';
import { NutritionPurgeOnDeletedHandler } from '../../contexts/nutrition/features/purge-on-deleted/purge-on-deleted.handler.js';
import { RegenerateOnProfileUpdatedHandler } from '../../contexts/nutrition/features/regenerate-on-profile-updated/regenerate-on-profile-updated.handler.js';
import { MealLineChangedHandler } from '../../contexts/rhythm/features/meal-line-changed/meal-line-changed.handler.js';
import { RhythmPurgeOnDeletedHandler } from '../../contexts/rhythm/features/purge-on-deleted/purge-on-deleted.handler.js';
import { RhythmModule } from '../../contexts/rhythm/rhythm.module.js';
import { RolloverOnEndOfDaySaga } from '../../contexts/planning/features/rollover/rollover-on-end-of-day.saga.js';
import { CloseOnBannedHandler } from '../../contexts/conversations/features/close-on-banned/close-on-banned.handler.js';
import { RecordUsageHandler } from '../../contexts/operations/features/record-usage/record-usage.handler.js';
import { OperationsPurgeOnDeletedHandler } from '../../contexts/operations/features/purge-on-deleted/purge-on-deleted.handler.js';
import { SyncModule } from '../../contexts/sync/sync.module.js';
import { NotificationsModule } from '../../contexts/notifications/notifications.module.js';
import { LabelSnapshotHandler } from '../../contexts/planning/features/label-snapshot/label-snapshot.handler.js';
import { PlanningModule } from '../../contexts/planning/planning.module.js';
import { OperationsModule } from '../../contexts/operations/operations.module.js';
import { ProfileModule } from '../../contexts/profile/profile.module.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import type { DomainEvent } from '../cqrs/domain-event.js';
import { HeartbeatService } from '../health/heartbeat.service.js';
import { RELAY_LIVENESS } from '../health/healthz.controller.js';
import { MODEL_NAMES } from '../persistence/mongo/schemas.js';
import { SettingsService } from '../settings/settings.service.js';
import { IdentityOutboxForwarder } from './identity-outbox-forwarder.js';
import {
  MongoOutboxStore,
  type OutboxDoc,
  type RelayStateDoc,
} from './mongo-outbox.store.js';
import { OutboxModule } from './outbox.module.js';
import { OutboxRelay } from './outbox-relay.js';
import { OutboxWriter } from './outbox-writer.js';
import { RelayRuntime } from './relay.runtime.js';
import { HTTP_POST, WebhookFanout, type HttpPost } from './webhook-fanout.js';

export const RELAY_JOB = 'outbox.relay';

/**
 * `profile.ProfileUpdated` has more than one reaction in this table, and this
 * is the seam where a second one would be added.
 *
 * Kept as a named function rather than inlined so that adding the next
 * subscriber is an edit to one place with an obvious ordering, instead of a
 * second `case` for a name that already has one — which the language would
 * accept as a duplicate-case error only if they were literally adjacent, and
 * otherwise silently prefer the first.
 */
async function profileTimezone(
  event: DomainEvent,
  alertPlanning: { onProfileUpdated(event: DomainEvent): Promise<void> },
): Promise<void> {
  await alertPlanning.onProfileUpdated(event);
}
const WEBHOOK_TIMEOUT_MS = 10_000;

/**
 * The worker's half of the outbox: the change-stream relay, the identity
 * forwarder and the webhook fan-out, plus the runtime that keeps them alive
 * and reports on them. Backend never imports this — it only writes.
 *
 * In-process delivery is a small table from event name to handler. There is
 * no EventBus in P0 because two handlers do not need a bus; the table grows a
 * row per handler until a phase shows it should become one.
 */
@Module({
  imports: [
    OutboxModule,
    IdentityModule,
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
  ],
  providers: [
    {
      provide: MongoOutboxStore,
      inject: [
        getModelToken(MODEL_NAMES.outbox),
        getModelToken(MODEL_NAMES.relayState),
      ],
      useFactory: (outbox: Model<OutboxDoc>, state: Model<RelayStateDoc>) =>
        new MongoOutboxStore(outbox, state),
    },
    {
      provide: HTTP_POST,
      useValue: (async (url, body, headers) => {
        const response = await fetch(url, {
          method: 'POST',
          body,
          headers,
          signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
        });
        return { ok: response.ok, status: response.status };
      }) satisfies HttpPost,
    },
    {
      provide: WebhookFanout,
      inject: [ENV, HTTP_POST],
      useFactory: (env: Env, post: HttpPost) =>
        new WebhookFanout(env.AUTOMATION_WEBHOOK_SECRET, post),
    },
    {
      provide: OutboxRelay,
      inject: [
        MongoOutboxStore,
        WebhookFanout,
        SettingsService,
        AdminPasswordFlagHandler,
        BootstrapOnRegisteredHandler,
        PurgeOnDeletedHandler,
        LabelSnapshotHandler,
        PlanAlertsSaga,
        NudgeOnChangesHandler,
        PlanningPurgeOnDeletedHandler,
        RemindersPurgeOnDeletedHandler,
        NotificationsPurgeOnDeletedHandler,
        ConversationsBootstrapHandler,
        ConversationsPurgeOnDeletedHandler,
        RhythmBootstrapHandler,
        RhythmPreferencesChangedHandler,
        MealLineChangedHandler,
        RhythmPurgeOnDeletedHandler,
        RolloverOnEndOfDaySaga,
        CloseOnBannedHandler,
        RecordUsageHandler,
        OperationsPurgeOnDeletedHandler,
        MeetingsPurgeOnDeletedHandler,
        SessionMaterialiserSaga,
        BootstrapAthleteProfileHandler,
        TrainingPurgeOnDeletedHandler,
        ApplySuggestionHandler,
        IngestLinkSaga,
        GenerateSuggestionSaga,
        RecordSuggestionOutcomeHandler,
        KnowledgePurgeOnDeletedHandler,
        RegenerateOnProfileUpdatedHandler,
        NutritionPurgeOnDeletedHandler,
        HeartbeatService,
      ],
      useFactory: (
        store: MongoOutboxStore,
        fanout: WebhookFanout,
        settings: SettingsService,
        passwordFlag: AdminPasswordFlagHandler,
        profileBootstrap: BootstrapOnRegisteredHandler,
        profilePurge: PurgeOnDeletedHandler,
        labelSnapshots: LabelSnapshotHandler,
        alertPlanning: PlanAlertsSaga,
        syncNudges: NudgeOnChangesHandler,
        planningPurge: PlanningPurgeOnDeletedHandler,
        remindersPurge: RemindersPurgeOnDeletedHandler,
        notificationsPurge: NotificationsPurgeOnDeletedHandler,
        conversationsBootstrap: ConversationsBootstrapHandler,
        conversationsPurge: ConversationsPurgeOnDeletedHandler,
        rhythmBootstrap: RhythmBootstrapHandler,
        rhythmPreferences: RhythmPreferencesChangedHandler,
        mealLine: MealLineChangedHandler,
        rhythmPurge: RhythmPurgeOnDeletedHandler,
        rollover: RolloverOnEndOfDaySaga,
        closeSockets: CloseOnBannedHandler,
        recordUsage: RecordUsageHandler,
        operationsPurge: OperationsPurgeOnDeletedHandler,
        meetingsPurge: MeetingsPurgeOnDeletedHandler,
        materialiser: SessionMaterialiserSaga,
        trainingBootstrap: BootstrapAthleteProfileHandler,
        trainingPurge: TrainingPurgeOnDeletedHandler,
        applySuggestion: ApplySuggestionHandler,
        ingest: IngestLinkSaga,
        suggesting: GenerateSuggestionSaga,
        suggestionOutcomes: RecordSuggestionOutcomeHandler,
        knowledgePurge: KnowledgePurgeOnDeletedHandler,
        nutritionRegenerate: RegenerateOnProfileUpdatedHandler,
        nutritionPurge: NutritionPurgeOnDeletedHandler,
        heartbeats: HeartbeatService,
      ) =>
        new OutboxRelay({
          store,
          fanout,
          subscriptions: async () =>
            (await settings.get('automation.subscriptions')).map((sub) => ({
              ...sub,
              enabled: sub.enabled ?? false,
            })),
          /**
           * Where a domain event reaches an in-process handler.
           *
           * An explicit table rather than `@EventsHandler` discovery, and the
           * price of that is this: a handler that is provided but not named
           * here is never called, and nothing fails — it simply does not
           * happen. `bootstrap-on-registered` and `purge-on-deleted` were both
           * in exactly that state, so every account created got no profile and
           * every deleted one left its photo on the volume.
           *
           * The `default` is deliberate: most events exist for n8n, which the
           * fanout above already handled. But adding a handler means adding a
           * case, and the spec below is what remembers that.
           */
          publish: async (event: DomainEvent) => {
            switch (event.name) {
              // Profile reacts to Identity. Two stores, so no transaction can
              // span them — the event is the only way across, and it is why
              // both handlers are idempotent on re-delivery.
              /*
               * Three contexts bootstrap from one registration, and the
               * order is the dependency: Profile writes the preferences the
               * rhythm reads, and Conversations writes the coach chat the
               * rhythm's first touch is written into. Sequential, so a
               * failure in one does not silently skip the rest and the
               * relay's own retry brings the whole event back rather than a
               * fragment of it. All three are idempotent, which is what
               * makes replaying all three after a partial failure the
               * correct recovery rather than a second problem.
               *
               * `RhythmBootstrapHandler` is last for a reason beyond
               * tidiness: it reads the member's zone and their three times
               * to decide which of today's touches to suppress, and a
               * member who registers at 23:00 gets the right answer only if
               * Profile has already written their preferences. It falls back
               * to the installation defaults if not, so the order is a
               * correctness preference and not a correctness requirement.
               */
              case 'identity.UserRegistered':
                await profileBootstrap.handle(event);
                await conversationsBootstrap.handle(event);
                await rhythmBootstrap.handle(event);
                /*
                 * The fourth, from P6: an empty athlete profile.
                 *
                 * It is what lets every read promise a document rather than a
                 * null — no sports and no slots is an answer the Athlete
                 * screen, the coach prompt and the materialiser can all
                 * render, where a nullable profile is the same "have they set
                 * this up" branch written four times. Idempotent, like the
                 * three above, which is what makes replaying all four after a
                 * partial failure the correct recovery.
                 */
                await trainingBootstrap.handle(event);
                return;
              /*
               * Four contexts hold something about a member, and all four are
               * called here — sequentially, so one failing does not silently
               * skip the rest, and the relay's own retry brings the whole
               * event back rather than a fragment of it. Every handler is
               * idempotent, which is what makes replaying all four after a
               * partial failure the correct recovery rather than a second
               * problem.
               *
               * The list growing is the point of the table. A context added in
               * P5 that forgets this line leaves a deleted member's meetings on
               * disk for ever, and nothing fails — which is E-005's whole
               * argument.
               */
              case 'identity.UserDeleted':
                await profilePurge.handle(event);
                await planningPurge.handle(event);
                await remindersPurge.handle(event);
                await notificationsPurge.handle(event);
                await rhythmPurge.handle(event);
                await conversationsPurge.handle(event);
                await operationsPurge.handle(event);
                await meetingsPurge.handle(event);
                await trainingPurge.handle(event);
                await knowledgePurge.handle(event);
                await nutritionPurge.handle(event);
                return;
              case 'operations.SettingChanged':
                settings.invalidate(
                  String((event.payload as { key?: string })?.key ?? ''),
                );
                return;
              // Identity raises it, Operations owns the key. The event is how
              // the two meet without either opening the other's store.
              case 'identity.PasswordChanged':
                await passwordFlag.onPasswordChanged(event);
                return;
              // Planning reacting to Planning. The boundary is not the reason
              // for the hop — the rename writes one row and returns, and the
              // several hundred tasks that show the label are caught up here in
              // one bulk write rather than inline while the member waits.
              case 'planning.LabelUpdated':
                await labelSnapshots.onUpdated(event);
                return;
              case 'planning.LabelDeleted':
                await labelSnapshots.onDeleted(event);
                return;

              // ---- the alert pipeline ------------------------------------
              //
              // Thirteen names, and every one of them is a case in this switch
              // rather than a decorator, which is the trade this table makes:
              // the whole subscription list is readable in one place, at the
              // cost of a handler being silently inert if somebody forgets a
              // row. E-005 in `enhancements/` proposes closing that half
              // without giving up the readability.
              case 'planning.TaskScheduled':
              case 'planning.TaskRescheduled':
                await alertPlanning.onTaskScheduled(event);
                return;
              case 'planning.TaskCompleted':
              case 'planning.TaskCancelled':
              case 'planning.TaskDeleted':
                await alertPlanning.onTaskClosed(event);
                return;
              case 'reminders.ReminderScheduled':
              case 'reminders.ReminderRescheduled':
              case 'reminders.ReminderSnoozed':
                await alertPlanning.onReminderScheduled(event);
                return;
              case 'reminders.ReminderCompleted':
              case 'reminders.ReminderCancelled':
              case 'reminders.ReminderDeleted':
              case 'reminders.ReminderPurged':
                await alertPlanning.onReminderClosed(event);
                return;

              // The events from outside Planning and Reminders. An alert's
              // correct instant depends on facts those contexts do not own:
              // the member's zone is Profile's, and whether they are banned or
              // have a phone at all is Identity's.
              /*
               * `profile.ProfileUpdated` now has two subscribers, which is
               * exactly what `profileTimezone` above was kept as a named
               * function for.
               *
               * The second is P6's materialiser, and it is here rather than on
               * `PreferencesChanged` because **`timezone` lives on the
               * profile, not in `PREFERENCE_FIELDS`.** P6's plan said
               * otherwise; written that way the zone recompute would never
               * once have run, and a member who flew would have kept a
               * fortnight of sessions on the clock of the city they left. The
               * saga takes both event names and branches on the field.
               */
              /*
               * P8 makes it three subscribers.
               *
               * Nutrition rebuilds *today's* meals when the changed list names
               * allergies or foods, and ignores the event otherwise (FR-013) —
               * a member who declares a nut allergy at noon must not spend the
               * afternoon looking at almonds. It is last because it is the one
               * that may talk to a language model, and the two above are
               * arithmetic on rows the member is waiting for.
               */
              case 'profile.ProfileUpdated':
                await profileTimezone(event, alertPlanning);
                await materialiser.onMemberContextChanged(event);
                await nutritionRegenerate.handle(event);
                return;
              case 'profile.PreferencesChanged':
                await alertPlanning.onPreferencesChanged(event);
                await rhythmPreferences.handle(event);
                // The cut-off half: a changed `nextPracticeCutoff` does not move
                // a session, but the pass is idempotent and cheap, and having
                // one entry point for "the member's context moved" is worth
                // more than the write it saves.
                await materialiser.onMemberContextChanged(event);
                return;
              /*
               * Two reactions, and the second is the one that would have
               * been easy to leave out.
               *
               * The alerts go, and the member's **live sockets close**.
               * The socket authenticates in the handshake — which is what
               * makes it cheap — so it outlives any decision made after it
               * opened, and a JWT cannot be revoked mid-flight either.
               * Without this a banned member keeps a working chat until
               * their access token expires: up to fifteen minutes of the
               * coach answering somebody who has been shut out (FR-022).
               */
              case 'identity.UserBanned':
                await alertPlanning.onUserBanned(event);
                await closeSockets.handle(event);
                return;
              case 'identity.UserUnbanned':
                await alertPlanning.onUserUnbanned(event);
                return;
              case 'identity.DeviceRegistered':
              case 'identity.DeviceRemoved':
                await alertPlanning.onDevicesChanged(event);
                return;

              /*
               * ---- the rhythm's three touches --------------------------
               *
               * Each becomes one member-chosen alert, at the moment of the
               * touch, with no lead times and untouched by quiet hours — a
               * member whose quiet window covers their own 08:00 briefing
               * asked for that briefing at 08:00 (spec FR-013).
               *
               * The end-of-day summary has a second subscriber, and it is
               * the one that would have been easy to leave out: Planning
               * carries the day's unfinished tasks into the plan that was
               * just set. Planning reacting to the rhythm's event rather
               * than the rhythm dispatching a Planning command is
               * constitution IX read carefully — a handler that dispatched
               * another context's command would be the same violation
               * wearing a bus.
               */
              case 'rhythm.PlanTomorrowPrompted':
              case 'rhythm.MorningBriefingSent':
                await alertPlanning.onRhythmTouch(event);
                return;
              case 'rhythm.EndOfDaySummarySent':
                await alertPlanning.onRhythmTouch(event);
                await rollover.handle(event);
                return;

              /*
               * ---- meetings, and the window that has to keep moving ----
               *
               * All four scheduling events reach one method, because
               * reconciling makes them the same operation: "here is what this
               * meeting's alerts should be now". `MeetingChanged` also covers a
               * *restore*, which the aggregate raises deliberately —
               * `MeetingDeleted` drops the alerts, so a restore that announced
               * nothing would put the meeting back on the calendar with no
               * reminders and nothing would ever say so.
               *
               * `profile.ProfileUpdated` needs no row of its own: it already
               * reaches `onProfileUpdated` above, and the meetings half of
               * FR-014 lives inside that method. An unpinned series' occurrences
               * *move* when the member does, so re-planning from the stored
               * `source.occurrenceAt` would rebuild from an instant that is no
               * longer where the meeting is — it goes back to Meetings and
               * re-expands instead.
               */
              case 'meetings.MeetingScheduled':
              case 'meetings.MeetingChanged':
              case 'meetings.OccurrenceSkipped':
              case 'meetings.OccurrenceMoved':
                await alertPlanning.onMeetingChanged(event);
                return;
              case 'meetings.MeetingCompleted':
              case 'meetings.MeetingCancelled':
              case 'meetings.MeetingDeleted':
                await alertPlanning.onMeetingClosed(event);
                return;

              /*
               * ---- training ---------------------------------------------
               *
               * Three names into one method, because they ask the saga the same
               * question — "here is what this member's fortnight should be now"
               * — and the pass is idempotent, so distinguishing them would buy
               * a narrower write at the cost of a second code path to keep in
               * step. `ProgramApplied` is here rather than doing its filling at
               * apply time, which is what lets a program outlive the
               * materialisation horizon: week four is filled on the day the
               * horizon reaches it (FR-008).
               */
              case 'training.SportsChanged':
              case 'training.SlotsChanged':
              case 'training.ProgramApplied':
                await materialiser.onTrainingChanged(event);
                return;
              /*
               * And the alerts. `SessionRescheduled` carries the same payload as
               * `SessionScheduled` and reaches the same method, because
               * reconciling makes them one operation.
               *
               * `SessionDeleted` in the closed branch is load-bearing rather
               * than tidy: the materialiser **tombstones** a future session
               * whose slot the member removed, and that raises this and nothing
               * else — so without the row, a slot deleted at noon would leave
               * its alarms to fire all week.
               */
              case 'training.SessionScheduled':
                await alertPlanning.onSessionScheduled(event);
                /*
                 * And P7's second subscriber: a session at least a day away may
                 * be worth a suggestion drawn from what the member has saved.
                 *
                 * Only `SessionScheduled`, never `SessionRescheduled`. A
                 * rescheduled session is one that already existed and has
                 * therefore already been through this — including the fill that
                 * an accepted suggestion performs, which raises `Rescheduled`
                 * itself and would otherwise ask the member about their own
                 * answer on every acceptance.
                 *
                 * The saga returns before it reads anything when the member has
                 * `aiSuggestions` off, which is what SC-003's second half is
                 * about: no background work runs for them at all.
                 */
                await suggesting.onSessionScheduled(event);
                return;
              case 'training.SessionRescheduled':
                await alertPlanning.onSessionScheduled(event);
                return;
              case 'training.SessionCompleted':
              case 'training.SessionCancelled':
              case 'training.SessionSkipped':
                await alertPlanning.onSessionClosed(event);
                // What became of a session an accepted suggestion produced. A
                // miss is the normal case — almost no session came from one —
                // so the handler is silent about it.
                await suggestionOutcomes.handle(event);
                return;
              case 'training.SessionDeleted':
                await alertPlanning.onSessionClosed(event);
                return;

              /*
               * ---- knowledge -------------------------------------------
               *
               * `LinkAdded` starts the reading immediately rather than waiting
               * for the drain tick, which is what makes SC-001's three minutes
               * achievable for a member who has just pasted something. The tick
               * exists for the other cases — a worker killed mid-pipeline, a
               * relay that was down when the event passed — and both converge
               * on the same drain.
               *
               * `LinkIngested` has **no in-process subscriber**, and that is
               * deliberate rather than an omission. The member's devices learn
               * that a link finished through `/sync`, whose nudge rides on
               * `sync.ChangesApplied`; the coach message the event catalogue
               * imagines for "I read …" would be Botvy speaking unprompted
               * about every link a member saves, which is chatter rather than
               * coaching. It is still published to n8n for an Owner who wants
               * it.
               */
              case 'knowledge.LinkAdded':
                await ingest.onLinkAdded(event);
                return;

              /*
               * And back to the queue, which is a different trigger with the
               * same body.
               *
               * P7's gate found the gap: a member pressed Retry, the row went
               * to `queued`, and nothing read it until the five-minute tick —
               * because `LinkAdded` is raised once, at creation. The Owner's
               * force-requeue and every row the stall sweep recovered had the
               * same wait. The saga acts only on a `queued` status, so the four
               * transitions the pipeline itself makes pass straight through
               * this row.
               */
              case 'knowledge.LinkStateChanged':
                await ingest.onLinkStateChanged(event);
                return;

              /*
               * The member accepted a draft, and **Training** fills the session.
               *
               * This is the one row in this table where the consumer is the
               * context that owns the collection rather than the one that
               * raised the event, which is constitution IX exactly: Knowledge
               * says what happened, Training decides what that means, and
               * neither imports the other. A Knowledge handler dispatching a
               * Training command would be the same violation wearing a bus.
               */
              case 'knowledge.SuggestionAccepted':
                await applySuggestion.handle(event);
                return;

              /*
               * Botvy has something to propose. Notifications turns it into the
               * `suggestion` alert kind that has been in `AlertSourceKind`
               * since P2 with nothing raising it.
               *
               * The event catalogue also lists Conversations posting a coach
               * message here, and this table deliberately does not. The rhythm
               * writes its touches into the chat because the *question* would
               * otherwise exist only inside a notification — a member who
               * opened the app was expected to answer something that was
               * nowhere on screen, which is v1's lesson. A suggestion has a
               * screen: the inbox, with Use this and No thanks on the card. A
               * coach line about every suggestion would be Botvy narrating its
               * own background work, which is chatter rather than coaching.
               *
               * The one case that *does* write into the chat is the opposite
               * one: a draft the model would not produce structurally, where
               * there is no card to show and its plain words are the only
               * honest thing to deliver. `generate-suggestion` does that
               * itself, through its own port.
               */
              case 'knowledge.SuggestionReady':
                await alertPlanning.onSuggestionReady(event);
                return;

              /*
               * Nutrition raises neither of these until P8. The handler
               * lands here with the rest of the context rather than in that
               * phase, because "a capability three phases each credit to
               * another phase is a capability nobody builds" — and because
               * a member who regenerates their meals at nine in the morning
               * has already had their briefing, so the plan the Home card
               * reads has to follow.
               */
              case 'nutrition.MealPlanReady':
              case 'nutrition.MealPlanWithheld':
                await mealLine.handle(event);
                return;

              /*
               * The usage loop's only crossing.
               *
               * Conversations raises this with the turn's token counts;
               * Operations writes one `usage_log` row from it, idempotent
               * on `eventId`. Neither context opens the other's
               * collection, and the daily allowance is summed back through
               * `UsageTodayQuery`. **Without this row the allowance sums an
               * empty collection and every member sits permanently at zero
               * used** — a limit that silently does not exist, which is
               * exactly the kind of thing this table's `default` hides.
               */
              case 'conversations.MessageSent':
                await recordUsage.handle(event);
                return;

              // One device pushed; the member's others are told. This is what
              // makes a task completed in the extension reach the phone in
              // seconds without either of them polling.
              case 'sync.ChangesApplied':
                await syncNudges.handle(event);
                return;
              default:
                return;
            }
          },
          heartbeat: (ok, error) => heartbeats.stamp(RELAY_JOB, ok, error),
        }),
    },
    {
      provide: IdentityOutboxForwarder,
      inject: [IdentityOutboxRepository, OutboxWriter],
      useFactory: (pending: IdentityOutboxRepository, writer: OutboxWriter) =>
        new IdentityOutboxForwarder(pending, writer),
    },
    {
      provide: RelayRuntime,
      inject: [
        OutboxRelay,
        IdentityOutboxForwarder,
        MongoOutboxStore,
        HeartbeatService,
      ],
      useFactory: (
        relay: OutboxRelay,
        forwarder: IdentityOutboxForwarder,
        store: MongoOutboxStore,
        heartbeats: HeartbeatService,
      ) =>
        new RelayRuntime({
          relay,
          forwarder,
          closeStore: () => store.close(),
          heartbeat: (ok, error) => heartbeats.stamp(RELAY_JOB, ok, error),
        }),
    },
    { provide: RELAY_LIVENESS, useExisting: RelayRuntime },
  ],
  exports: [RELAY_LIVENESS, RelayRuntime],
})
export class RelayModule {}

import { Schema } from 'mongoose';

/**
 * The shared infrastructure collections. Every context owns its own on top of
 * these; these four belong to nobody in particular and to the platform as a
 * whole.
 *
 * Indexes are declared here for documentation and created by migrate-mongo, not
 * by Mongoose's autoIndex. An index created on connect is an index created
 * differently on every deploy, and constitution IV wants the change written
 * down and applied forwards.
 */

export const OutboxSchema = new Schema(
  {
    eventId: { type: String, required: true },
    name: { type: String, required: true },
    context: { type: String, required: true },
    aggregate: {
      type: { type: String, required: true },
      id: { type: String, required: true },
    },
    userId: { type: String, default: null },
    payload: { type: Schema.Types.Mixed, required: true },
    schemaVersion: { type: Number, required: true, default: 1 },
    occurredAt: { type: Date, required: true },
    deliveredAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    nextAttemptAt: { type: Date, default: null },
  },
  { collection: 'outbox', versionKey: false },
);

/** Where the relay left off, so a restart resumes rather than replays. */
export const RelayStateSchema = new Schema(
  {
    _id: { type: String, required: true },
    resumeToken: { type: Schema.Types.Mixed, default: null },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { collection: 'relay_state', versionKey: false, _id: false },
);

export const SettingSchema = new Schema(
  {
    _id: { type: String, required: true },
    value: { type: Schema.Types.Mixed },
    updatedAt: { type: Date, default: () => new Date() },
    updatedBy: { type: String, default: null },
  },
  { collection: 'settings', versionKey: false, _id: false },
);

export const HeartbeatSchema = new Schema(
  {
    _id: { type: String, required: true },
    lastRunAt: { type: Date, required: true },
    lastOkAt: { type: Date, default: null },
    lastDurationMs: { type: Number, default: null },
    lastError: { type: String, default: null },
  },
  { collection: 'ops_heartbeats', versionKey: false, _id: false },
);

export const AuditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.Mixed, required: true },
    action: { type: String, required: true },
    target: {
      type: { type: String, required: true },
      id: { type: String, default: null },
    },
    at: { type: Date, required: true },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  { collection: 'audit_log', versionKey: false },
);

export const IdempotencyKeySchema = new Schema(
  {
    _id: { type: String, required: true },
    route: { type: String, required: true },
    status: { type: Number, required: true },
    response: { type: Schema.Types.Mixed },
    createdAt: { type: Date, required: true },
  },
  { collection: 'idempotency_keys', versionKey: false, _id: false },
);

/**
 * A member's own facts. Keyed by `userId` and nothing else: there is one profile
 * per account, so a separate `_id` would be a second key for one row.
 *
 * `metrics` is embedded rather than a collection of its own. The whole history
 * is read together on the profile screen and never queried across members, and
 * the aggregate caps it at 500 readings so the document cannot grow without
 * bound.
 */
export const ProfileSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    displayName: { type: String, default: null },
    photoPath: { type: String, default: null },
    timezone: { type: String, required: true },
    locale: { type: String, required: true },
    metrics: {
      type: [
        {
          _id: false,
          recordedAt: { type: Date, required: true },
          weightKg: { type: Number },
          heightCm: { type: Number },
          bodyFatPct: { type: Number },
          note: { type: String },
        },
      ],
      default: [],
    },
    foodLikes: { type: [String], default: [] },
    foodDislikes: { type: [String], default: [] },
    allergies: { type: [String], default: [] },
    symptoms: { type: [String], default: [] },
    onboardingCompletedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'profiles', versionKey: false, _id: false },
);

/** The knobs a member may turn, seeded from `settings.defaults.*`. */
export const PreferencesSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    planTomorrowTime: { type: String, required: true },
    endOfDayTime: { type: String, required: true },
    morningBriefingTime: { type: String, required: true },
    nextPracticeCutoff: { type: String, required: true },
    leadTimes: { type: [String], default: [] },
    quietHours: {
      type: {
        _id: false,
        from: { type: String, required: true },
        to: { type: String, required: true },
      },
      required: true,
    },
    weekStartsOn: { type: String, required: true },
    checkinEnabled: { type: Boolean, required: true },
    meetingDurationMin: { type: Number, required: true },
    mealMode: { type: String, required: true },
    aiSuggestions: { type: Boolean, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'user_preferences', versionKey: false, _id: false },
);

/**
 * A colour-coded name a member groups tasks under.
 *
 * `nameLower` exists only so the unique index can be case-insensitive: Mongo
 * has no expression indexes, so "no two labels called Work" is enforced over a
 * stored comparison form. The mapper writes it and *unsets* it on delete, which
 * is what frees the name for reuse — the index is partial on its existence.
 */
export const LabelSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    name: { type: String, required: true },
    /**
     * Declared as optional *and removed* on delete — see the mapper. Omitting
     * it from a `$set` is not enough: `$set` writes the fields it is given and
     * leaves the rest alone, so the old value survived and the unique index
     * kept holding the name. It takes `$unset`.
     */
    nameLower: { type: String },
    color: { type: String, required: true },
    sortOrder: { type: Number, required: true, default: 0 },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    deletedAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'labels', versionKey: false, _id: false },
);

/**
 * One row per task, and one row per *series* for a repeating one.
 *
 * `recurrence` is a rule plus its exceptions, never expanded rows: `dtstart`,
 * an RRULE string, the dates skipped, and the mode that decides what "next"
 * means. Completing an occurrence advances `dueAt` on this same document. The
 * alternative — materialising a row per occurrence — multiplies sync volume and
 * makes "skip one" ambiguous, and the phone can plan its next alarm from the
 * rule as easily as from a row.
 *
 * `label` is an Extended Reference: the name and colour are snapshotted here so
 * a task list renders without a second read, and a Planning-internal handler
 * refreshes them on `LabelUpdated`.
 */
export const TaskSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    title: { type: String, required: true },
    notes: { type: String, default: null },
    dueAt: { type: Date, default: null },
    allDay: { type: Boolean, required: true, default: true },
    priority: { type: Number, required: true, default: 4 },
    labelId: { type: String, default: null },
    label: {
      type: {
        _id: false,
        name: { type: String, required: true },
        color: { type: String, required: true },
      },
      default: null,
    },
    status: { type: String, required: true, default: 'open' },
    completedAt: { type: Date, default: null },
    recurrence: {
      type: {
        _id: false,
        dtstart: { type: Date, required: true },
        rrule: { type: String, required: true },
        mode: { type: String, required: true },
        exdates: { type: [Date], default: [] },
      },
      default: null,
    },
    estimatedMinutes: { type: Number, default: null },
    deferCount: { type: Number, required: true, default: 0 },
    deferredFrom: { type: Date, default: null },
    source: { type: String, required: true, default: 'app' },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    deletedAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'tasks', versionKey: false, _id: false },
);

/**
 * A moment the member asked to be told about, plus how far ahead to warn them.
 *
 * `leadTimes` stays here rather than in Notifications because it is the
 * member's own choice about this reminder; the *expansion* into one alert per
 * lead time belongs to the planning saga, which is the context that owns
 * alerts. The reminder announces `{ remindAt, leadTimes }` and lets the saga
 * work out what that means.
 */
export const ReminderSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    title: { type: String, required: true },
    remindAt: { type: Date, required: true },
    leadTimes: { type: [String], default: [] },
    status: { type: String, required: true, default: 'active' },
    snoozedUntil: { type: Date, default: null },
    source: { type: String, required: true, default: 'app' },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    deletedAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'reminders', versionKey: false, _id: false },
);

/**
 * One notification the server intends to send, or has.
 *
 * Server-only, so an ObjectId `_id` rather than a client-minted UUIDv7: no
 * client creates one offline, and the id never has to survive a retry from a
 * phone. Its lifecycle is `planned → claimed → sent | failed`, and the claim is
 * a `findOneAndUpdate` filtered on `claimedAt: null` so two concurrent sweeps
 * cannot both take the row.
 *
 * `plannedAt` is not decoration beside `notifyAt`: the sweep skips devices
 * whose `lastSeenAt >= plannedAt`, because such a device has already synced and
 * holds its own local alarm. Without that comparison the member is notified
 * twice for one thing.
 */
export const AlertSchema = new Schema(
  {
    userId: { type: String, required: true },
    source: {
      type: {
        _id: false,
        kind: { type: String, required: true },
        id: { type: String, required: true },
        occurrenceAt: { type: Date, default: null },
      },
      required: true,
    },
    label: { type: String, required: true },
    notifyAt: { type: Date, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    deepLink: { type: String, default: '' },
    plannedAt: { type: Date, required: true },
    claimedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    error: { type: String, default: null },
    /**
     * The optimistic-write column, and its absence was a live defect.
     *
     * `MongoRepositoryBase` filters every save on `updatedAt` and writes it
     * back, and Mongoose runs `strict: true` — so an upsert naming a path the
     * schema does not declare is *rejected outright*:
     * `Path "updatedAt" is not in schema, strict mode is 'true', and upsert is
     * 'true'`. Every alert this pipeline ever tried to plan failed on it.
     *
     * Thirty-eight unit tests passed throughout, because the in-memory adapter
     * has no schema to be strict about. It took running against a real Mongo,
     * and the evidence was four undelivered rows in the outbox carrying that
     * exact message — which is the outbox doing its job: nothing was lost, it
     * simply never arrived.
     */
    updatedAt: { type: Date, required: true },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'alerts', versionKey: false },
);

/**
 * The daily rhythm's three collections, and the conversation the touches are
 * written into.
 *
 * `_id` is composite for two of them — `"<userId>:<YYYY-MM-DD>"` — which is the
 * whole idempotency story for a job that runs every five minutes: there is one
 * plan per member per day by construction, so a tick that fires twice writes
 * the same document twice rather than creating two. The date in the key is the
 * member's *local* date, resolved through `shared/time`; a server-side date
 * here would give a member in Cairo the wrong day for three hours every
 * evening, which is precisely the failure principle XI exists for.
 */
export const DailyPlanSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    date: { type: String, required: true },
    status: { type: String, required: true, default: 'draft' },
    /** True when the end-of-day touch set the plan the member never answered. */
    autoConfirmed: { type: Boolean, required: true, default: false },
    /**
     * A snapshot, not a reference list.
     *
     * The plan records what the member was *shown* and agreed to, so a task
     * renamed or deleted afterwards does not rewrite last Tuesday's plan. The
     * live status comes from Planning when the plan is read; these fields are
     * what the evening prompt actually said.
     */
    tasks: {
      type: [
        {
          _id: false,
          id: { type: String, required: true },
          title: { type: String, required: true },
          priority: { type: Number, required: true },
          dueAt: { type: Date, default: null },
          deferCount: { type: Number, required: true, default: 0 },
        },
      ],
      default: [],
    },
    training: {
      type: {
        _id: false,
        sessionId: { type: String, required: true },
        title: { type: String, required: true },
        sport: { type: String, required: true },
        startAt: { type: Date, required: true },
      },
      default: null,
    },
    workoutLine: { type: String, default: null },
    mealLine: { type: String, default: null },
    promptedAt: { type: Date, default: null },
    confirmedAt: { type: Date, default: null },
    summarisedAt: { type: Date, default: null },
    briefedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'daily_plans', versionKey: false, _id: false },
);

/**
 * How the day went, by the member's own account.
 *
 * `mood` and `adhered` are both nullable because the two arrive separately: a
 * one-word reply in the coach chat sets `adhered` and knows nothing about a
 * mood, and the card on the phone can send a mood with no verdict. A zero mood
 * is a real answer, so absence has to be `null` rather than falsy.
 */
export const CheckinSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    date: { type: String, required: true },
    mood: { type: Number, default: null },
    adhered: { type: Boolean, default: null },
    note: { type: String, default: null },
    source: { type: String, required: true, default: 'app' },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'checkins', versionKey: false, _id: false },
);

/**
 * What has already been sent today, and whether an answer is awaited.
 *
 * Three claim dates rather than one "evening" date, and that is load-bearing:
 * the plan prompt and the end-of-day summary are separate touches an hour
 * apart, so a gateway that was down at 21:00 and up at 21:30 owes the member
 * the prompt but not yet the summary. One shared date would either send both or
 * neither.
 *
 * `_id` is the member's id: one row per member, written by
 * `bootstrap-on-registered` so the tick never reads a row nobody created.
 */
export const RhythmStateSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    lastPlanPromptDate: { type: String, default: null },
    lastEndOfDayDate: { type: String, default: null },
    lastMorningBriefingDate: { type: String, default: null },
    awaitingCheckin: { type: Boolean, required: true, default: false },
    awaitingSince: { type: Date, default: null },
    streak: {
      type: {
        _id: false,
        current: { type: Number, required: true, default: 0 },
        best: { type: Number, required: true, default: 0 },
        lastAdheredDate: { type: String, default: null },
      },
      required: true,
      default: () => ({ current: 0, best: 0, lastAdheredDate: null }),
    },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'rhythm_states', versionKey: false, _id: false },
);

/**
 * A chat. Two of them are pinned and created with the account.
 *
 * The uniqueness that makes a replayed `UserRegistered` a no-op is a **partial**
 * index on `{ userId, kind }` limited to `coach` and `planner` — a member may
 * have any number of `free` chats, and Mongo treats two documents with the same
 * pair as duplicates whether or not the value is one we care about. The
 * migration declares the filter; this schema only records that the fields
 * exist.
 */
export const ConversationSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    kind: { type: String, required: true },
    title: { type: String, required: true },
    pinned: { type: Boolean, required: true, default: false },
    archived: { type: Boolean, required: true, default: false },
    /** Everything at or below this seq is hidden from the member's transcript. */
    clearedUpToSeq: { type: Number, required: true, default: 0 },
    lastMessageAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    deletedAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'conversations', versionKey: false, _id: false },
);

/**
 * One message, immutable, and that immutability is the reason the cursor is
 * cheap.
 *
 * The phone pulls `seq > lastSeq` against a per-user counter. There is no
 * `updatedAt` and no tombstone, because there is nothing to update: a column
 * backfilled onto existing rows can never reach a device that already holds
 * them, so the answer to a schema change here is to mark the cache and re-pull,
 * never to edit rows in place.
 *
 * Server-minted `_id` (ObjectId): P3 only ever writes assistant turns from a
 * job, and the member's own turn arrives in P4 carrying a `clientId` for the
 * retry story rather than minting the `_id`.
 */
export const MessageSchema = new Schema(
  {
    userId: { type: String, required: true },
    conversationId: { type: String, required: true },
    seq: { type: Number, required: true },
    role: { type: String, required: true },
    content: { type: String, required: true },
    clientId: { type: String, default: null },
    composedAt: { type: Date, default: null },
    intent: { type: Schema.Types.Mixed, default: null },
    usage: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, required: true },
    /**
     * Declared, equal to `createdAt`, and read by nothing.
     *
     * A message is immutable, so a modification timestamp is meaningless here —
     * and the data model says so explicitly, because that absence is what makes
     * the sync cursor one number (`seq > lastSeq`) instead of a date. So this
     * field is not part of the design; it is a **requirement of the write
     * path**, and leaving it out was a live defect for the length of one
     * afternoon.
     *
     * `MongoRepositoryBase` filters every save on `updatedAt` for its
     * optimistic check and writes it back. Mongoose runs `strict: true`, and an
     * upsert naming a path the schema does not declare is *rejected outright*:
     * `Path "updatedAt" is not in schema, strict mode is 'true', and upsert is
     * 'true'`. Every rhythm touch therefore saved its plan, raised its event,
     * planned its alert — and failed to write the sentence into the member's
     * coach chat, which is the one thing FR-005 is about. All 740 unit tests
     * passed throughout, because the in-memory adapter has no schema to be
     * strict about, and the tick's per-member `catch` turned the failure into a
     * log line nobody was reading.
     *
     * This is the *second* time this exact defect has shipped — `AlertSchema`
     * had it in P2, and the whole notification pipeline was dead for a phase.
     * So the fix is not only this line: `schemas.spec.ts` now asserts that
     * every collection written through the repository base declares
     * `updatedAt`, which is the check that would have caught both.
     *
     * Nothing reads it. It must never become a sync cursor for this collection.
     */
    updatedAt: { type: Date, required: true },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'messages', versionKey: false },
);

/**
 * The per-user sequence, issued by `findOneAndUpdate` with `$inc`.
 *
 * A monotonic counter per member rather than one per conversation, because the
 * phone's cursor is one number for the whole transcript: pulling `seq > 41`
 * across every chat is one query, where a per-conversation seq would need one
 * cursor per chat and a client that had never opened a chat would not know
 * where to start.
 */
export const CounterSchema = new Schema(
  {
    _id: { type: String, required: true },
    value: { type: Number, required: true, default: 0 },
  },
  { collection: 'counters', versionKey: false, _id: false },
);

export const MODEL_NAMES = {
  outbox: 'Outbox',
  relayState: 'RelayState',
  setting: 'Setting',
  heartbeat: 'Heartbeat',
  auditLog: 'AuditLog',
  idempotencyKey: 'IdempotencyKey',
  profile: 'Profile',
  preferences: 'Preferences',
  label: 'Label',
  task: 'Task',
  reminder: 'Reminder',
  alert: 'Alert',
  dailyPlan: 'DailyPlan',
  checkin: 'Checkin',
  rhythmState: 'RhythmState',
  conversation: 'Conversation',
  message: 'Message',
  counter: 'Counter',
} as const;

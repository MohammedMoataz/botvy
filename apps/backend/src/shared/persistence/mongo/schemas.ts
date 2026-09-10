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
} as const;

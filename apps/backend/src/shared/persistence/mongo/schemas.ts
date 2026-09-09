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

/** The demonstration slice's collection, removed once P2 proves the same path. */
export const PingSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    clientId: { type: String, required: true },
    at: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'pings', versionKey: false, _id: false },
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
      type: { _id: false, from: { type: String, required: true }, to: { type: String, required: true } },
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

export const MODEL_NAMES = {
  outbox: 'Outbox',
  relayState: 'RelayState',
  setting: 'Setting',
  heartbeat: 'Heartbeat',
  auditLog: 'AuditLog',
  idempotencyKey: 'IdempotencyKey',
  ping: 'Ping',
  profile: 'Profile',
  preferences: 'Preferences',
} as const;

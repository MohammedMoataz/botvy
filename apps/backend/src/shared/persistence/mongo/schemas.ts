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
    /**
     * The day's meetings, snapshotted beside the tasks (FR-012).
     *
     * Declared here and not only in the mapper, because `MongoRepositoryBase`
     * saves through an upsert and Mongoose's `strict: true` **rejects an
     * upsert naming an undeclared path outright** — the whole write fails, not
     * just the field. That has shipped twice in this codebase (`AlertSchema`
     * in P2, `MessageSchema` in P3) and both times the unit suite was green,
     * because handler specs bind the in-memory adapter and it has no schema to
     * be strict about.
     *
     * `meetingId` rather than an occurrence id: occurrences are derived from
     * the rule and have no identity of their own, so a repeating meeting can
     * legitimately appear twice in one day's array.
     */
    meetings: {
      type: [
        {
          _id: false,
          meetingId: { type: String, required: true },
          title: { type: String, required: true },
          startAt: { type: Date, required: true },
          durationMin: { type: Number, required: true },
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

/**
 * What every model call cost, one row per call.
 *
 * Operations owns this collection and is the **only** writer, from
 * `conversations.MessageSent`. Conversations never opens it, and asks for
 * today's total through `UsageTodayQuery` instead. That loop is the whole of
 * the crossing between the two contexts, and it is load-bearing: without it the
 * daily allowance sums an empty collection and every member sits permanently at
 * zero used, which is a limit that silently does not exist.
 *
 * Server-only, so an ObjectId `_id` — no client creates one and the id never
 * has to survive a retry from a phone. `eventId` is what makes the write
 * idempotent: the relay delivers at least once, and a replayed `MessageSent`
 * must not double-count a member's allowance.
 *
 * The 90-day TTL is declared in the migration, not here. It is the one index in
 * the system that deletes data, so it belongs somewhere a reader will find it
 * while asking why a number changed.
 */
export const UsageLogSchema = new Schema(
  {
    userId: { type: String, required: true },
    /** `chat`, `intent`, `summarize`, `suggest`, `plan`. */
    kind: { type: String, required: true },
    model: { type: String, required: true },
    promptTokens: { type: Number, required: true, default: 0 },
    completionTokens: { type: Number, required: true, default: 0 },
    ms: { type: Number, required: true, default: 0 },
    /** The event this row came from. Unique, so a redelivery writes nothing. */
    eventId: { type: String, required: true },
    createdAt: { type: Date, required: true },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'usage_log', versionKey: false },
);

/**
 * The tappable questions each chat offers.
 *
 * `userId: null` means a global one the Owner seeded; anything else belongs to
 * the member who added it and is returned to nobody else. A partial index is
 * not needed here because nothing is unique — two members may add the same
 * question, and the Owner's seed and a member's own copy are two rows on
 * purpose.
 *
 * `text` carries both languages rather than one, because the seeded set is
 * shown to every member whatever their locale, and a chip that falls back to
 * English on an Arabic screen is the defect `enhancements/E-012` describes for
 * the coach's own sentences.
 */
export const QuickQuestionSchema = new Schema(
  {
    _id: { type: String, required: true },
    /** `coach`, `planner` or `free`. */
    scope: { type: String, required: true },
    text: {
      type: {
        _id: false,
        en: { type: String, required: true },
        ar: { type: String, required: true },
      },
      required: true,
    },
    /**
     * Which state this question suits: `any`, `low` or `ok`.
     *
     * Read against the member's latest check-in mood, so a member who reported
     * a bad day is offered a lighter option first. `any` is the default and is
     * what a question with no opinion about the member's mood carries.
     */
    mood: { type: String, required: true, default: 'any' },
    order: { type: Number, required: true, default: 100 },
    /** Null for a seeded global question; a member id for their own. */
    userId: { type: String, default: null },
    enabled: { type: Boolean, required: true, default: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'quick_questions', versionKey: false, _id: false },
);

/**
 * The repeat, shared by both of Meetings' collections.
 *
 * A rule, the dates the member removed and the occurrences they moved — never
 * expanded rows (FR-006), so a weekly series with no end is one document and a
 * series of any length costs the same to keep.
 *
 * `overrides` is keyed by `originalStart`, the moment the *rule* produced, and
 * that key never moves. It is what lets a series edit still find a moved
 * occurrence, and what makes moving the same occurrence twice update one
 * override rather than accumulating two.
 *
 * Declared once and used by both schemas below rather than written twice,
 * because FR-011 requires a repeating personal event to skip, move and end
 * exactly as a repeating meeting does — two copies of this shape is how the two
 * would come to disagree about what an override is.
 */
const recurrenceShape = {
  _id: false,
  dtstart: { type: Date, required: true },
  rrule: { type: String, required: true },
  exdates: { type: [Date], default: [] },
  overrides: {
    type: [
      {
        _id: false,
        originalStart: { type: Date, required: true },
        startAt: { type: Date, default: null },
        durationMin: { type: Number, default: null },
        title: { type: String, default: null },
        location: {
          type: {
            _id: false,
            onlineLink: { type: String, default: null },
            address: { type: String, default: null },
          },
          default: null,
        },
      },
    ],
    default: [],
  },
} as const;

/**
 * One meeting, and for a repeating one, one series (data-model §2.10).
 *
 * `reminderOffsets` holds minutes before the occurrence and is resolved from
 * the member's `defaults.leadTimes` **at creation**, so a later preference
 * change never silently moves the reminders of a meeting that already exists.
 *
 * `lockTimezone` is the named zone a series is pinned to, or null to follow the
 * member (FR-007): "keep this on Cairo's clock" for somebody who has flown to
 * Berlin. Expansion reads it on every read rather than storing a resolved
 * instant, which is what makes a member's move a re-read instead of a rewrite.
 *
 * `allDay` is present because the blueprint's document carries it and is unset
 * and unread in this phase — a whole-day entry is a `calendar_events` row
 * (FR-001), and a second way to say the same thing would be one more branch in
 * the expander for nothing.
 */
export const MeetingSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: null },
    startAt: { type: Date, required: true },
    durationMin: { type: Number, required: true, default: 30 },
    allDay: { type: Boolean, required: true, default: false },
    lockTimezone: { type: String, default: null },
    /**
     * The zone the member's clock was in when they wrote this, kept for ever.
     *
     * Without it a stored instant cannot say what the member typed: 18:00 in
     * Cairo read in Berlin is 17:00, so a member who flies would find their
     * series at neither the time they chose nor the time they left behind.
     * `recurrence-expander.ts` takes the wall-clock digits from here (or from
     * `lockTimezone`) and reads them on the member's current clock, which is
     * both halves of FR-007 in one line.
     */
    authoredTimezone: { type: String, required: true },
    location: {
      type: {
        _id: false,
        onlineLink: { type: String, default: null },
        address: { type: String, default: null },
      },
      required: true,
    },
    prepNotes: { type: String, default: null },
    prepMinutes: { type: Number, required: true, default: 0 },
    reminderOffsets: { type: [Number], default: [] },
    recurrence: { type: recurrenceShape, default: null },
    /** `scheduled` | `completed` | `cancelled`. A delete never touches it. */
    status: { type: String, required: true, default: 'scheduled' },
    completedAt: { type: Date, default: null },
    source: { type: String, required: true, default: 'app' },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    deletedAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'meetings', versionKey: false, _id: false },
);

/**
 * A birthday, a holiday, a block of focus time (FR-011).
 *
 * Its own collection rather than a flag on `meetings`, because the two
 * disagree about almost everything a meeting is — a location that is required,
 * a duration bounded by the working day, preparation, reminders and an outcome.
 * What they share is the repeat, which is why `recurrence` above is one shape.
 */
export const CalendarEventSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    title: { type: String, required: true },
    notes: { type: String, default: null },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    allDay: { type: Boolean, required: true, default: false },
    color: { type: String, default: null },
    recurrence: { type: recurrenceShape, default: null },
    /** As on `meetings`; see the note there. */
    authoredTimezone: { type: String, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    deletedAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'calendar_events', versionKey: false, _id: false },
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
  usageLog: 'UsageLog',
  quickQuestion: 'QuickQuestion',
  meeting: 'Meeting',
  calendarEvent: 'CalendarEvent',
} as const;

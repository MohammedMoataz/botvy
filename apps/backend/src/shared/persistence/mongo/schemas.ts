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

/**
 * The four shapes Training stores, and the four it shares between them.
 *
 * One `SetEntry` type across every sport (data-model §2.6), which is the
 * decision `set-entry.ts` argues at length: a schema per sport multiplies the
 * model, the editor, every query and every migration by the number of sports,
 * and gives a member who lifts *and* swims two histories that cannot be read
 * together. The *sport* decides which pair of fields the editor draws; the
 * stored row is the same either way.
 *
 * Targets and actuals are both declared and neither overwrites the other, so a
 * logged session shows what was done beside what was planned (FR-004).
 */
const targetSetShape = {
  _id: false,
  /** Repetitions — gym, calisthenics, crossfit. */
  targetReps: { type: Number, default: null },
  targetWeightKg: { type: Number, default: null },
  /** Seconds — a plank, an interval, a game. */
  targetDurationSec: { type: Number, default: null },
  /** Metres — swimming, running, cycling. */
  targetDistanceM: { type: Number, default: null },
};

/**
 * A set on a session or a library entry: the targets above plus what happened.
 *
 * `done` is declared separately from the `actual*` fields rather than inferred
 * from them, because a member can tick three sets off without typing numbers
 * and a set with a weight typed but not ticked is one they are part way
 * through. Inferring it would collapse those two into one.
 */
const setShape = {
  ...targetSetShape,
  actualReps: { type: Number, default: null },
  actualWeightKg: { type: Number, default: null },
  actualDurationSec: { type: Number, default: null },
  actualDistanceM: { type: Number, default: null },
  done: { type: Boolean, required: true, default: false },
};

/**
 * A picture or a clip an exercise refers to. Nothing fetches it in this phase.
 *
 * `type` is a path *named* `type`, which is the one name Mongoose reads as a
 * declaration rather than as a field — hence the `{ type: { type: String } }`
 * spelling, the same escape `AuditLogSchema.target` uses above.
 */
const mediaRefShape = {
  _id: false,
  type: { type: String, required: true },
  url: { type: String, required: true },
  caption: { type: String, default: null },
};

/**
 * One exercise on a session or a workout, with its sets in order.
 *
 * `id` is declared because the editor reorders exercises and a member logging a
 * set has to say *which* one — an array index is not a name, and reordering
 * while a set is being typed would move the numbers under their fingers.
 */
const exerciseShape = {
  _id: false,
  id: { type: String, required: true },
  name: { type: String, required: true },
  notes: { type: String, default: null },
  mediaRefs: { type: [mediaRefShape], default: [] },
  sets: { type: [setShape], default: [] },
};

/**
 * An exercise inside a *program* week: targets only, and no `id`.
 *
 * Not `exerciseShape`, and the difference is deliberate rather than an
 * oversight. A template has nothing to record — `actual*` on a template is a
 * field that can only ever be null, and a field that can only be null is a
 * field somebody will one day fill — and it has no identity to carry, because
 * the materialiser mints fresh exercise ids when it copies a template onto a
 * session, so editing that session cannot rewrite the program it came from.
 */
const templateExerciseShape = {
  _id: false,
  name: { type: String, required: true },
  notes: { type: String, default: null },
  mediaRefs: { type: [mediaRefShape], default: [] },
  sets: { type: [targetSetShape], default: [] },
};

/**
 * What the member practises and when — **keyed by the member** (data-model
 * §2.6): `_id` is the `userId`, one document each.
 *
 * So it is the one member-owned collection here with **no `userId` field of its
 * own**, and that has two visible consequences. It needs an exemption in
 * `schemas.spec.ts`'s `platform` set, where its reason is written down; and its
 * adapter cannot go through `MongoRepositoryBase`, whose filter is
 * `{ _id, userId }` — see the comment on `MongoAthleteProfileRepository`.
 *
 * `updatedAt` is still here and still required: the adapter keeps the same
 * optimistic filter the base uses, because two devices editing the weekly
 * timetable is ordinary and a lost update there silently drops a training day.
 *
 * No tombstone, and no `createdAt`. There is nothing to create twice and
 * nothing to delete short of the member themselves, which `purge-on-deleted`
 * handles; the row is written on `identity.UserRegistered`, so its creation is
 * the member's own and Identity already records it.
 *
 * `slots[].start` is `HH:mm` in the member's own zone and **never an instant**
 * (principle XI): "gym at 18:00 on Mondays" is a statement about the member's
 * clock, so a member who flies to Berlin still trains at 18:00. A stored
 * instant would have made a zone change a data migration.
 */
export const AthleteProfileSchema = new Schema(
  {
    /** The member's id. See the note above. */
    _id: { type: String, required: true },
    sports: { type: [String], default: [] },
    slots: {
      type: [
        {
          _id: false,
          /** The client's id. A slot that keeps it keeps its sessions. */
          id: { type: String, required: true },
          /** 1 (Monday) to 7 (Sunday) — ISO 8601, not JavaScript's 0-is-Sunday. */
          weekday: { type: Number, required: true },
          start: { type: String, required: true },
          durationMin: { type: Number, required: true },
          sport: { type: String, required: true },
          location: { type: String, default: null },
        },
      ],
      default: [],
    },
    updatedAt: { type: Date, required: true },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'athlete_profiles', versionKey: false, _id: false },
);

/**
 * One scheduled or logged practice (data-model §2.6) — the source of truth for
 * "next practice".
 *
 * A syncable row like every other: the client mints `_id`, `deletedAt` is the
 * tombstone a delta carries to the phone, and `updatedAt` is the cursor.
 *
 * `slotId` is null for a session the member made by hand, and that null is
 * load-bearing: it is what keeps the materialiser's reconcile away from it.
 * `suggestionId` is written by nothing in this phase — P7 fills it, and
 * carrying the field now is what means P7 needs no migration.
 *
 * `status` is `planned | completed | cancelled | skipped`. There is no
 * `missed`: a planned session whose moment has passed is a reading of the
 * clock, not an outcome anybody recorded. And a delete never touches the
 * status, because the status is the only record of what became of the session.
 */
export const SessionSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    plannedAt: { type: Date, required: true },
    durationMin: { type: Number, required: true },
    sport: { type: String, required: true },
    title: { type: String, required: true },
    focus: { type: String, default: null },
    /** Which program filled this, and which of its weeks. Null for a bare slot. */
    programId: { type: String, default: null },
    weekIndex: { type: Number, default: null },
    /** Which slot produced it. Null for a session the member made by hand. */
    slotId: { type: String, default: null },
    /** Carried for P7; written by nothing here. */
    suggestionId: { type: String, default: null },
    exercises: { type: [exerciseShape], default: [] },
    status: { type: String, required: true, default: 'planned' },
    completedAt: { type: Date, default: null },
    notes: { type: String, default: null },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    deletedAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'sessions', versionKey: false, _id: false },
);

/**
 * A structured plan: weeks of session templates, applied onto the member's own
 * slots (data-model §2.6).
 *
 * `appliedStartDate` is a **local date string** (`YYYY-MM-DD`) and not a Date,
 * which is principle XI once more: the week arithmetic counts from the day the
 * member said "start now" on their own clock, and an instant would put a member
 * who applies a program at 23:30 into week two a day early. It sorts
 * chronologically as a string, which is what `activeFor` reads it as.
 *
 * **Archiving does not clear it.** Archiving stops the materialiser consulting
 * the program; clearing the date would additionally make re-activating it fill
 * from the wrong week, and the member never said to forget when they started.
 *
 * `weekday` on a template is 1..7 or **null**, and the null is what makes a
 * program portable: a template with no weekday fills whichever slot comes next
 * in order, so one four-week plan works for a member who trains
 * Monday/Wednesday/Friday and one who trains Tuesday/Thursday/Saturday.
 *
 * `source` and `sourceLinkIds` are the other half of the P7 seam.
 */
export const ProgramSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    title: { type: String, required: true },
    sport: { type: String, required: true },
    /** `user` | `suggestion` | `link`. The last two arrive with P7. */
    source: { type: String, required: true, default: 'user' },
    sourceLinkIds: { type: [String], default: [] },
    weeks: {
      type: [
        {
          _id: false,
          index: { type: Number, required: true },
          sessions: {
            type: [
              {
                _id: false,
                templateId: { type: String, required: true },
                weekday: { type: Number, default: null },
                title: { type: String, required: true },
                focus: { type: String, default: null },
                exercises: { type: [templateExerciseShape], default: [] },
              },
            ],
            default: [],
          },
        },
      ],
      default: [],
    },
    /** `active` | `archived`. */
    status: { type: String, required: true, default: 'active' },
    appliedStartDate: { type: String, default: null },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    deletedAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'programs', versionKey: false, _id: false },
);

/**
 * The member's own library of workouts (data-model §2.6, FR-009).
 *
 * It holds `exerciseShape` — targets *and* actuals — rather than the program's
 * template shape, because a library entry is most often saved from a session
 * the member has just done: the numbers they actually lifted are there to
 * become next time's targets. `actual*` on a library entry is meaningful, which
 * is exactly what it is not on a program template.
 */
export const WorkoutSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    name: { type: String, required: true },
    sport: { type: String, required: true },
    exercises: { type: [exerciseShape], default: [] },
    tags: { type: [String], default: [] },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    deletedAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'workouts', versionKey: false, _id: false },
);

/**
 * Something the member saved to be read (data-model §2.7, P7).
 *
 * A syncable row, and the one in this system whose *status* is the interesting
 * column: `queued → fetching → extracting → summarising → done`, any step to
 * `failed`, and `failed → queued` on a retry. The phone holds a copy so the
 * list renders offline, and pushes only add and remove — a client that could
 * push a status would be telling the server it had read an article itself.
 *
 * `normalizedUrl` is stored beside `url` rather than derived on read, because
 * it is what the unique index is built on: the same article arriving from a
 * newsletter and from a friend is two URLs and one reading (FR-005), and
 * deriving the comparison at query time would mean a collection scan per save.
 *
 * `docId` points into `knowledge_docs` and is null until the summary exists —
 * and also null for an expanded playlist's *parent*, which finishes with
 * children rather than with a document.
 */
export const LinkSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    url: { type: String, required: true },
    normalizedUrl: { type: String, required: true },
    /** `article` | `website` | `video` | `playlist`. */
    kind: { type: String, required: true },
    /** The YouTube video or list id, for a source that has one. */
    externalId: { type: String, default: null },
    /** Set on a playlist's children; null for anything the member saved directly. */
    parentLinkId: { type: String, default: null },
    title: { type: String, default: null },
    /** Sports and topics, lower-cased. What the suggestion saga matches on. */
    tags: { type: [String], default: [] },
    status: { type: String, required: true, default: 'queued' },
    failReason: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    docId: { type: String, default: null },
    /** Videos of a playlist left behind by `knowledge.playlistMaxItems`. */
    skippedCount: { type: Number, default: null },
    addedAt: { type: Date, required: true },
    processedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    deletedAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'links', versionKey: false, _id: false },
);

/**
 * What Botvy read, dated (data-model §2.7).
 *
 * Server-only: the phone never holds one. It is the single largest document in
 * the system — `text` runs to `knowledge.maxChars`, which defaults to sixty
 * thousand characters — and the member only ever wants the *summary* of it,
 * which the detail view fetches over GraphQL on demand. Syncing the extracted
 * text of every article a member has ever saved onto their handset would be a
 * cost with no reader.
 *
 * Written once and never edited. A source that changes after being read does
 * not change this; re-reading a link writes a new document, so a suggestion's
 * evidence cannot be rewritten under it after the member accepted it.
 * `updatedAt` is here because `MongoRepositoryBase` writes it on every save,
 * and it will equal `createdAt` for the life of every row.
 */
export const KnowledgeDocSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    linkId: { type: String, required: true },
    sourceUrl: { type: String, required: true },
    title: { type: String, default: null },
    author: { type: String, default: null },
    publishedAt: { type: Date, default: null },
    text: { type: String, required: true, default: '' },
    /**
     * The video's captions, or null.
     *
     * Null on an article means "not a video"; null on a *video* is the spec's
     * own edge case — the entry finishes on title, description and duration
     * alone and says the summary was built without one. Nothing records that as
     * a separate flag, because the link's kind and this field already say it
     * and a third column could disagree with them.
     */
    transcript: { type: String, default: null },
    summary: { type: String, required: true },
    keyPoints: { type: [String], default: [] },
    media: {
      type: [
        {
          _id: false,
          type: { type: String, required: true },
          /** The source's own URL. Clients are handed the proxied form (FR-008). */
          url: { type: String, required: true },
          caption: { type: String, default: null },
        },
      ],
      default: [],
    },
    durationSec: { type: Number, default: null },
    model: { type: String, required: true },
    tokens: { type: Number, default: 0 },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'knowledge_docs', versionKey: false, _id: false },
);

/**
 * A proposal for one session, drawn from the member's own readings
 * (data-model §2.7, FR-009).
 *
 * Server-only and read over GraphQL rather than synced, because it is not a
 * thing the member edits offline: it is generated by the worker, and the two
 * actions on it — accept and dismiss — are commands that have to reach the
 * server to mean anything.
 *
 * `forDate` is a **local date string** and not a Date, which is principle XI
 * again: the suggestion is about the member's Tuesday, and an instant would put
 * a member who trains at 06:00 into the wrong day the moment they flew.
 *
 * `sessionId` is the session it was generated *for*; `acceptedSessionId` is the
 * one it ended up in, which may be a different session the member chose or one
 * Training created afterwards. Two fields rather than one because the first is
 * how FR-010's "not proposed again" is answered and the second is how T734's
 * outcome is found, and collapsing them would lose whichever question was asked
 * second.
 */
export const SuggestionSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    /** Only `session` exists; a meal or a reading order would be the next. */
    kind: { type: String, required: true, default: 'session' },
    forDate: { type: String, required: true },
    sport: { type: String, required: true },
    sessionId: { type: String, default: null },
    draft: {
      type: {
        _id: false,
        title: { type: String, required: true },
        focus: { type: String, default: null },
        exercises: {
          type: [
            {
              _id: false,
              name: { type: String, required: true },
              notes: { type: String, default: null },
              sets: {
                type: [
                  {
                    _id: false,
                    targetReps: { type: Number, default: null },
                    targetWeightKg: { type: Number, default: null },
                    targetDurationSec: { type: Number, default: null },
                    targetDistanceM: { type: Number, default: null },
                  },
                ],
                default: [],
              },
            },
          ],
          default: [],
        },
      },
      required: true,
    },
    sourceLinkIds: { type: [String], default: [] },
    rationale: { type: String, required: true, default: '' },
    /** `pending` | `accepted` | `dismissed`. */
    status: { type: String, required: true, default: 'pending' },
    acceptedSessionId: { type: String, default: null },
    /** `completed` | `cancelled` | `skipped`, once the session was dealt with. */
    outcome: { type: String, default: null },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'suggestions', versionKey: false, _id: false },
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
  athleteProfile: 'AthleteProfile',
  session: 'Session',
  program: 'Program',
  workout: 'Workout',
  link: 'Link',
  knowledgeDoc: 'KnowledgeDoc',
  suggestion: 'Suggestion',
} as const;

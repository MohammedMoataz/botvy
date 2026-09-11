import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';

/**
 * Writes the contract artefacts every client is generated from.
 *
 * The domain was written three times in v1 — once in the gateway, once in the
 * admin app, once on the phone — and the three drifted, because nothing made
 * them agree. Generating from one source is the fix, and this is the source.
 *
 * Run as a mode of the backend rather than a separate tool, because the OpenAPI
 * document and the GraphQL schema are produced by the running application's own
 * metadata. A second tool that reconstructed them would be a fourth place for
 * the domain to live.
 */
export const CONTRACTS_DIR = join(
  process.cwd(),
  '..',
  '..',
  'packages',
  'contracts',
);

/**
 * Every event a subscriber can subscribe to, as JSON Schema.
 *
 * This is the published contract for automation: n8n and anything else on the
 * far side of a webhook validate against these rather than against whatever
 * shape the payload happened to have last week. So an event added to
 * `contracts/events.md` and raised by a context is not actually *published*
 * until it is here — which is why the list grows with each phase rather than
 * being derived.
 *
 * Not derived, deliberately. A schema generated from the payload type would
 * document whatever the code currently does, including a field somebody
 * renamed by accident; written down, it is a claim the code has to keep
 * meeting. The events catalogue and this table are the two halves of that
 * claim, and both change in the same review.
 *
 * `operations.Pinged` was here and is gone with the demonstration slice it
 * belonged to: P2's `planning.TaskScheduled` makes the same journey for a
 * member who wants the outcome.
 */
export const eventSchemas = {
  'operations.SettingChanged': z.object({
    key: z.string(),
  }),

  // ---- Planning ---------------------------------------------------------
  /*
   * `title` and `allDay` are on both of these because the alert saga *reads*
   * them, and until P3 neither event carried the title — so `title ?? 'Task
   * due'` fired every time and every task notification in the product was
   * titled "Task due". `TaskRescheduled` also carried no `allDay`, so
   * `allDay === false` came out false on every edit and the reconcile dropped
   * the member's lead times. A schema that describes what a consumer needs is
   * the only place either omission was ever going to be visible.
   */
  'planning.TaskScheduled': z.object({
    taskId: z.string().uuid(),
    dueAt: z.string().datetime().nullable(),
    allDay: z.boolean(),
    title: z.string(),
    priority: z.number().int(),
  }),
  'planning.TaskRescheduled': z.object({
    taskId: z.string().uuid(),
    dueAt: z.string().datetime().nullable(),
    allDay: z.boolean(),
    title: z.string(),
  }),
  'planning.TaskCompleted': z.object({
    taskId: z.string().uuid(),
    at: z.string().datetime(),
    // Present only when a repeating task re-armed rather than finished. Its
    // absence is how a subscriber tells "done for ever" from "done for now".
    recurrenceAdvancedTo: z.string().datetime().optional(),
  }),
  'planning.TaskCancelled': z.object({
    taskId: z.string().uuid(),
    at: z.string().datetime(),
  }),
  'planning.TaskDeleted': z.object({
    taskId: z.string().uuid(),
    at: z.string().datetime(),
  }),
  'planning.TaskDeferred': z.object({
    taskId: z.string().uuid(),
    fromDate: z.string().datetime().nullable(),
    toDate: z.string().datetime(),
    deferCount: z.number().int(),
  }),
  'planning.LabelUpdated': z.object({
    labelId: z.string().uuid(),
    name: z.string(),
    color: z.string(),
  }),
  'planning.LabelDeleted': z.object({
    labelId: z.string().uuid(),
    name: z.string(),
    color: z.string(),
  }),

  // ---- Reminders --------------------------------------------------------
  //
  // The three that carry a moment share one shape, because the alert saga
  // reconciles from it and does not care which of the three brought it.
  'reminders.ReminderScheduled': z.object({
    reminderId: z.string().uuid(),
    remindAt: z.string().datetime(),
    leadTimes: z.array(z.string()),
  }),
  'reminders.ReminderRescheduled': z.object({
    reminderId: z.string().uuid(),
    remindAt: z.string().datetime(),
    leadTimes: z.array(z.string()),
  }),
  'reminders.ReminderSnoozed': z.object({
    reminderId: z.string().uuid(),
    // The *effective* moment, so a subscriber never has to know what a snooze
    // is to work out when the member will be told.
    remindAt: z.string().datetime(),
    leadTimes: z.array(z.string()),
  }),
  'reminders.ReminderCompleted': z.object({ reminderId: z.string().uuid() }),
  'reminders.ReminderCancelled': z.object({ reminderId: z.string().uuid() }),
  'reminders.ReminderDeleted': z.object({ reminderId: z.string().uuid() }),

  // ---- Notifications ----------------------------------------------------
  'notifications.AlertSent': z.object({
    alertId: z.string(),
    source: z.object({
      kind: z.string(),
      id: z.string(),
      occurrenceAt: z.string().datetime().nullable(),
    }),
    deviceIds: z.array(z.string()),
  }),
  'notifications.AlertFailed': z.object({
    alertId: z.string(),
    source: z.object({
      kind: z.string(),
      id: z.string(),
      occurrenceAt: z.string().datetime().nullable(),
    }),
    deviceIds: z.array(z.string()),
    error: z.string(),
  }),

  // ---- Daily Rhythm -----------------------------------------------------
  //
  // `date` is the member's *local* calendar date, not an instant, and it is a
  // string for that reason: an ISO timestamp here would carry an offset and
  // every consumer would have to decide whose midnight it meant. The rollover
  // resolves the boundary against the member's zone from this string, which is
  // the one place that decision belongs.
  'rhythm.PlanTomorrowPrompted': z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    taskIds: z.array(z.string().uuid()),
    trainingSessionId: z.string().nullable(),
    mealLine: z.string().nullable(),
  }),
  'rhythm.EndOfDaySummarySent': z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    taskIds: z.array(z.string().uuid()),
    trainingSessionId: z.string().nullable(),
    autoConfirmed: z.boolean(),
    checkinAsked: z.boolean(),
  }),
  'rhythm.MorningBriefingSent': z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    taskIds: z.array(z.string().uuid()),
  }),
  'rhythm.PlanConfirmed': z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    taskIds: z.array(z.string().uuid()),
    autoConfirmed: z.boolean(),
  }),
  'rhythm.PlanSkipped': z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    taskIds: z.array(z.string().uuid()),
    autoConfirmed: z.boolean(),
  }),
  // Both nullable, and that is the shape rather than an oversight: the two
  // halves of a check-in arrive by different routes, so a mood with no verdict
  // and a verdict with no mood are both complete answers.
  'rhythm.CheckinRecorded': z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mood: z.number().int().min(0).max(100).nullable(),
    adhered: z.boolean().nullable(),
  }),

  // ---- Conversations ----------------------------------------------------
  'conversations.ConversationCreated': z.object({
    conversationId: z.string().uuid(),
    kind: z.enum(['coach', 'planner', 'free']),
    pinned: z.boolean(),
  }),
  'conversations.MessageSent': z.object({
    conversationId: z.string().uuid(),
    seq: z.number().int().positive(),
    role: z.enum(['user', 'assistant', 'system']),
  }),

  /*
   * ---- Meetings & Calendar ---------------------------------------------
   *
   * The four scheduling events share one payload, built by one method on the
   * aggregate (`Meeting.alertFacts`) and called from all six of its raise
   * sites. That is not tidiness: P2's task events omitted `title` and `allDay`,
   * so **every task notification in the product said "Task due"** and every
   * edit silently dropped the member's lead times. A payload crosses the
   * boundary as `unknown`, so the type system cannot say a field is missing and
   * the consumer's fallback quietly wins instead.
   *
   * The two occurrence events add the date they are about — which occurrence,
   * and for a move, where it went. Both are needed and they are different
   * facts: the first is how the saga finds the alerts it must remove, the
   * second is where it puts them.
   *
   * `calendar_events` publishes nothing, and that is a decision rather than an
   * omission: a personal event produces no notifications (FR-011 gives it a
   * title, a time, a colour and a repeat, and no reminders), so an event raised
   * for one would have no consumer. Its rows reach the member's other devices
   * through `sync.ChangesApplied` like everything else.
   */
  'meetings.MeetingScheduled': z.object({
    meetingId: z.string().uuid(),
    title: z.string(),
    startAt: z.coerce.date(),
    durationMin: z.number().int(),
    /** Null for a one-off. RFC 5545, without the `DTSTART` line. */
    rrule: z.string().nullable(),
    /** A named zone pins the series to that place's clock (FR-007). */
    lockTimezone: z.string().nullable(),
    /** Minutes before the occurrence, resolved at creation and stored. */
    reminderOffsets: z.array(z.number().int()),
    prepMinutes: z.number().int(),
    status: z.enum(['scheduled', 'completed', 'cancelled']),
  }),
  'meetings.MeetingChanged': z.object({
    meetingId: z.string().uuid(),
    title: z.string(),
    startAt: z.coerce.date(),
    durationMin: z.number().int(),
    rrule: z.string().nullable(),
    lockTimezone: z.string().nullable(),
    reminderOffsets: z.array(z.number().int()),
    prepMinutes: z.number().int(),
    status: z.enum(['scheduled', 'completed', 'cancelled']),
  }),
  'meetings.OccurrenceSkipped': z.object({
    meetingId: z.string().uuid(),
    title: z.string(),
    startAt: z.coerce.date(),
    durationMin: z.number().int(),
    rrule: z.string().nullable(),
    lockTimezone: z.string().nullable(),
    reminderOffsets: z.array(z.number().int()),
    prepMinutes: z.number().int(),
    status: z.enum(['scheduled', 'completed', 'cancelled']),
    /** The moment the *rule* produced. The override key, and it never moves. */
    originalStart: z.coerce.date(),
  }),
  'meetings.OccurrenceMoved': z.object({
    meetingId: z.string().uuid(),
    title: z.string(),
    startAt: z.coerce.date(),
    durationMin: z.number().int(),
    rrule: z.string().nullable(),
    lockTimezone: z.string().nullable(),
    reminderOffsets: z.array(z.number().int()),
    prepMinutes: z.number().int(),
    status: z.enum(['scheduled', 'completed', 'cancelled']),
    originalStart: z.coerce.date(),
    movedTo: z.coerce.date(),
  }),
  'meetings.MeetingCompleted': z.object({
    meetingId: z.string().uuid(),
    at: z.coerce.date(),
  }),
  'meetings.MeetingCancelled': z.object({
    meetingId: z.string().uuid(),
    at: z.coerce.date(),
  }),
  'meetings.MeetingDeleted': z.object({
    meetingId: z.string().uuid(),
    at: z.coerce.date(),
  }),

  /*
   * ---- Training ---------------------------------------------------------
   *
   * `SessionScheduled` is the only announcement a new session gets, and three
   * things hang off it: the alert pipeline, the rhythm's tomorrow draft, and
   * P7's suggestion saga. A session that appears without one is a session
   * nobody is reminded about — which is the shape of a defect this codebase
   * shipped in P2, where a whole notification pipeline was dead for a phase.
   *
   * `SessionRescheduled` carries the same payload deliberately: the alert saga
   * reconciles on either, and one builder on the aggregate feeds both raise
   * sites so neither can omit a field the consumer reads.
   *
   * `SessionDeleted` is load-bearing rather than tidy. The materialiser
   * *tombstones* a future session whose slot the member removed, and that
   * raises this and nothing else — so without a subscriber, a slot deleted at
   * noon would leave its alarms to fire all week.
   */
  'training.SportsChanged': z.object({
    sports: z.array(z.string()),
  }),
  'training.SlotsChanged': z.object({
    slots: z.array(
      z.object({
        id: z.string(),
        /** 1 (Monday) to 7 (Sunday), ISO 8601 rather than JavaScript's. */
        weekday: z.number().int().min(1).max(7),
        /** `HH:mm` **in the member's own zone**, never an instant. */
        start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        durationMin: z.number().int(),
        sport: z.string(),
        location: z.string().nullable(),
      }),
    ),
  }),
  'training.SessionScheduled': z.object({
    sessionId: z.string().uuid(),
    plannedAt: z.coerce.date(),
    durationMin: z.number().int(),
    sport: z.string(),
    title: z.string(),
    focus: z.string().nullable(),
    status: z.enum(['planned', 'completed', 'cancelled', 'skipped']),
  }),
  'training.SessionRescheduled': z.object({
    sessionId: z.string().uuid(),
    plannedAt: z.coerce.date(),
    durationMin: z.number().int(),
    sport: z.string(),
    title: z.string(),
    focus: z.string().nullable(),
    status: z.enum(['planned', 'completed', 'cancelled', 'skipped']),
  }),
  'training.SessionCompleted': z.object({
    sessionId: z.string().uuid(),
    at: z.coerce.date(),
    sport: z.string(),
  }),
  'training.SessionCancelled': z.object({
    sessionId: z.string().uuid(),
    at: z.coerce.date(),
  }),
  'training.SessionSkipped': z.object({
    sessionId: z.string().uuid(),
    at: z.coerce.date(),
  }),
  'training.SessionDeleted': z.object({
    sessionId: z.string().uuid(),
    at: z.coerce.date(),
  }),
  /** Informational; nothing subscribes. Logging is not completing. */
  'training.SessionLogged': z.object({
    sessionId: z.string().uuid(),
    exerciseId: z.string(),
    sets: z.number().int(),
  }),
  'training.ProgramCreated': z.object({
    programId: z.string().uuid(),
    title: z.string(),
    weeks: z.number().int(),
  }),
  /**
   * The materialiser consumes this and Conversations turns it into a coach
   * message. It does **not** carry the sessions it filled, because it fills
   * none: the weeks are applied as the horizon reaches them, which is what lets
   * a program outlive `training.materialiseDays` (FR-008).
   */
  'training.ProgramApplied': z.object({
    programId: z.string().uuid(),
    title: z.string(),
    /** The member's local `YYYY-MM-DD`, which week arithmetic counts from. */
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    weeks: z.number().int(),
  }),
  'training.ProgramArchived': z.object({
    programId: z.string().uuid(),
  }),
  'training.ProgramDeleted': z.object({
    programId: z.string().uuid(),
  }),

  // ---- Sync -------------------------------------------------------------
  'sync.ChangesApplied': z.object({
    installId: z.string(),
    entities: z.array(z.string()),
  }),
} as const;

/** The envelope every event travels in, which subscribers match on first. */
export const envelopeSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string(),
  context: z.string(),
  aggregate: z.object({ type: z.string(), id: z.string() }),
  userId: z.string().nullable(),
  occurredAt: z.string().datetime(),
  payload: z.unknown(),
  schemaVersion: z.number().int(),
});

/**
 * A small zod-to-JSON-Schema conversion, rather than a dependency.
 *
 * P0 emits two event payloads and one envelope. A library to convert three
 * schemas is a dependency to keep current, review and eventually upgrade, for
 * work that is thirty lines — and constitution VIII asks for the present need,
 * not the general case. When a phase needs unions or refinements this becomes
 * a dependency; today it would be one bought on speculation.
 */
export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def as { typeName: string; [key: string]: unknown };

  switch (def.typeName) {
    case 'ZodString': {
      const checks = (def.checks ?? []) as Array<{ kind: string }>;
      if (checks.some((check) => check.kind === 'uuid'))
        return { type: 'string', format: 'uuid' };
      if (checks.some((check) => check.kind === 'datetime')) {
        return { type: 'string', format: 'date-time' };
      }
      return { type: 'string' };
    }
    case 'ZodNumber':
      return { type: 'integer' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodUnknown':
      return {};
    case 'ZodNullable':
      return {
        anyOf: [toJsonSchema(def.innerType as z.ZodTypeAny), { type: 'null' }],
      };
    case 'ZodOptional':
    case 'ZodDefault':
      // Optionality is expressed by absence from `required`, not by the field's
      // own type, so the wrapper is transparent here.
      return toJsonSchema(def.innerType as z.ZodTypeAny);
    case 'ZodArray':
      return { type: 'array', items: toJsonSchema(def.type as z.ZodTypeAny) };
    case 'ZodObject': {
      const shape = (def.shape as () => Record<string, z.ZodTypeAny>)();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = toJsonSchema(value);
        if (!value.isOptional()) required.push(key);
      }
      return {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      };
    }
    default:
      // Better an honest gap than a schema that claims to describe something
      // it does not.
      return {};
  }
}

export async function writeContracts(
  openapi: unknown,
  graphqlSdl: string | null,
  dir: string = CONTRACTS_DIR,
): Promise<string[]> {
  const written: string[] = [];

  const write = async (relative: string, contents: string) => {
    const target = join(dir, relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, 'utf8');
    written.push(relative);
  };

  if (openapi)
    await write('openapi.json', `${JSON.stringify(openapi, null, 2)}\n`);
  if (graphqlSdl) await write('schema.graphql', graphqlSdl);

  for (const [name, schema] of Object.entries(eventSchemas)) {
    await write(
      join('events', `${name}.schema.json`),
      `${JSON.stringify(
        {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          title: name,
          description: `Payload of ${name}. It travels inside the envelope in envelope.schema.json.`,
          ...toJsonSchema(schema),
        },
        null,
        2,
      )}\n`,
    );
  }

  await write(
    join('events', 'envelope.schema.json'),
    `${JSON.stringify(
      {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: 'DomainEvent',
        description:
          'Every event travels in this envelope. Delivery is at-least-once, so a subscriber discards an eventId it has already seen.',
        ...toJsonSchema(envelopeSchema),
      },
      null,
      2,
    )}\n`,
  );

  return written;
}

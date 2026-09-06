import { z } from 'zod';

/**
 * Every operator knob in the platform, registered here in P0 — not only the
 * handful P0 reads.
 *
 * A key registered in the phase that first reads it is a key that spent every
 * phase before it as a hard-coded default, and a hard-coded default is a bug.
 * Registering the whole set now costs one file and means a later phase reads a
 * value the Owner could always have changed.
 *
 * `readOnly` marks the entries the system writes for itself. The settings PATCH
 * refuses those by flag, never by key prefix: refusing everything under `ops.*`
 * also froze `ops.staleAfterMinutes`, which is exactly the number an operator
 * retunes when a job legitimately takes longer than a quarter of an hour.
 */
export interface SettingDefinition<T = unknown> {
  schema: z.ZodType<T>;
  default: T;
  description: string;
  readOnly?: boolean;
}

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'a wall-clock time as HH:mm');

const leadTime = z.string().regex(/^\d+[mhd]$/, 'a lead time like "30m", "1h" or "1d"');

const hexColour = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a colour as #rrggbb');

function define<T>(definition: SettingDefinition<T>): SettingDefinition<T> {
  return definition;
}

/** Intl is the only authority on what is a zone; it throws on anything else. */
function isIanaZone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const SETTINGS_REGISTRY = {
  // ---- Seeds for a new member's preferences -------------------------------
  // Each of these is copied into `user_preferences` when a member registers, so
  // changing one moves the starting point for everyone who joins next, and
  // never overwrites a member who has already chosen.
  'defaults.timezone': define({
    schema: z.string().refine(isIanaZone, 'an IANA zone such as Africa/Cairo'),
    default: 'Africa/Cairo',
    description: 'Time zone a new member starts with, until they set their own.',
  }),
  'defaults.planTomorrowTime': define({
    schema: hhmm,
    default: '21:00',
    description: 'When the evening plan prompt asks a member what tomorrow looks like.',
  }),
  'defaults.endOfDayTime': define({
    schema: hhmm,
    default: '22:00',
    description:
      "End-of-day touch: names tomorrow's priorities and whether there is training, and sets the plan by auto-confirming a draft the member never answered.",
  }),
  'defaults.morningBriefingTime': define({
    schema: hhmm,
    default: '08:00',
    description: "When the morning briefing hands back the day's plan.",
  }),
  'defaults.nextPracticeCutoff': define({
    schema: hhmm,
    default: '21:00',
    description:
      'After this hour, "next practice" means tomorrow\'s session rather than one still nominally left today.',
  }),
  'defaults.leadTimes': define({
    schema: z.array(leadTime).max(6),
    default: ['1h', '0m'],
    description: 'How far ahead a new member is warned about a timed thing.',
  }),
  'defaults.quietHours': define({
    schema: z.object({ from: hhmm, to: hhmm }),
    default: { from: '22:00', to: '07:00' },
    description:
      'Hours in which a system-generated alert waits. A moment the member chose themselves is never moved.',
  }),
  'defaults.weekStartsOn': define({
    schema: z.enum(['monday', 'sunday', 'saturday']),
    default: 'monday',
    description: 'First day of the week in calendar and week views.',
  }),
  'defaults.checkinEnabled': define({
    schema: z.boolean(),
    default: true,
    description: 'Whether the end-of-day touch also asks the member how the day went.',
  }),
  'defaults.locale': define({
    schema: z.enum(['en', 'ar']),
    default: 'en',
    description: 'Language a new member starts in when registration does not say.',
  }),
  'defaults.meetingDurationMin': define({
    schema: z.number().int().min(5).max(480),
    default: 30,
    description: 'Length the meeting editor offers before the member changes it.',
  }),
  'defaults.mealMode': define({
    schema: z.enum(['llm', 'library']),
    default: 'llm',
    description:
      "Whether a new member's meal line is drafted by the model or taken from their own saved meals.",
  }),
  'defaults.aiSuggestions': define({
    schema: z.boolean(),
    default: true,
    description: 'Whether saved links may produce training suggestions for a new member.',
  }),

  // ---- Reminders, notifications, rhythm -----------------------------------
  'reminders.tombstoneDays': define({
    schema: z.number().int().min(1).max(365),
    default: 30,
    description:
      'How long a deleted row stays as a tombstone. The sweep and the sync full-snapshot rule read the same key on purpose: a phone offline longer than this must re-sync from a full snapshot rather than a delta.',
  }),
  'notifications.sweepBatch': define({
    schema: z.number().int().min(1).max(5000),
    default: 200,
    description: 'How many due alerts one sweep claims and sends.',
  }),
  'notifications.expiryHours': define({
    schema: z.number().int().min(1).max(168),
    default: 24,
    description: 'After this long an unsent alert is expired rather than delivered late.',
  }),
  'rhythm.checkinWindowHours': define({
    schema: z.number().int().min(1).max(48),
    default: 12,
    description: 'How long after the question a check-in answer still counts.',
  }),
  'rhythm.draftTopN': define({
    schema: z.number().int().min(1).max(20),
    default: 5,
    description: "How many priorities tomorrow's draft and the touches name.",
  }),

  // ---- Chat ---------------------------------------------------------------
  'chat.historyLimit': define({
    schema: z.number().int().min(2).max(200),
    default: 20,
    description: 'Turns of history carried into a prompt.',
  }),
  'chat.ratePerMin': define({
    schema: z.number().int().min(1).max(120),
    default: 12,
    description: 'Messages a member may send per minute.',
  }),
  'chat.dailyQuotaTokens': define({
    schema: z.number().int().min(1000),
    default: 120_000,
    description: "A member's daily model allowance, counted over their own local day.",
  }),

  // ---- The local model ----------------------------------------------------
  'llm.chatModel': define({
    schema: z.string().min(1),
    default: 'qwen2.5:3b-instruct',
    description: 'Model that answers in chat.',
  }),
  'llm.extractModel': define({
    schema: z.string().min(1),
    default: 'qwen2.5:3b-instruct',
    description: 'Model used for schema-constrained extraction.',
  }),
  'llm.summarizeModel': define({
    schema: z.string().min(1),
    default: 'qwen2.5:3b-instruct',
    description: 'Model used to summarise a saved link.',
  }),
  'llm.numCtx': define({
    schema: z.number().int().min(512).max(131_072),
    default: 8192,
    description:
      'One context size for every call. Two sizes make the model reload between them, which measured 39 seconds to first token.',
  }),

  // ---- Saved links --------------------------------------------------------
  'knowledge.maxAttempts': define({
    schema: z.number().int().min(1).max(10),
    default: 3,
    description: 'Attempts before a link is left failed for the member to retry.',
  }),
  'knowledge.maxChars': define({
    schema: z.number().int().min(1000).max(1_000_000),
    default: 60_000,
    description: 'Longest extracted text kept for one document.',
  }),
  'knowledge.playlistMaxItems': define({
    schema: z.number().int().min(1).max(500),
    default: 50,
    description: 'How many videos of a playlist are taken.',
  }),
  'knowledge.maxLinksPerDay': define({
    schema: z.number().int().min(1).max(500),
    default: 20,
    description: 'How many links one member may add in their own day.',
  }),
  'knowledge.concurrency': define({
    schema: z.number().int().min(1).max(8),
    default: 1,
    description: 'Links ingested at once. The local model is the bottleneck, not the fetch.',
  }),
  'knowledge.stuckAfterMinutes': define({
    schema: z.number().int().min(5).max(1440),
    default: 30,
    description:
      'After this long mid-pipeline a link is re-queued: a worker that died holding it would otherwise leave it waiting for ever.',
  }),

  // ---- Meals --------------------------------------------------------------
  'nutrition.mealsPerDay': define({
    schema: z.number().int().min(1).max(8),
    default: 3,
    description: 'How many meals a day the meal line names.',
  }),

  // ---- Access -------------------------------------------------------------
  'auth.registrationOpen': define({
    schema: z.boolean(),
    default: true,
    description:
      'Whether new accounts may be created. A key rather than an environment variable so the Owner can close it from the portal without a redeploy.',
  }),

  // ---- Operations ---------------------------------------------------------
  'backup.retentionDays': define({
    schema: z.number().int().min(1).max(365),
    default: 14,
    description: 'How long nightly dumps are kept before pruning.',
  }),
  'backup.staleHours': define({
    schema: z.number().int().min(1).max(720),
    default: 48,
    description: 'After this long without a successful backup, health says so.',
  }),
  'ops.staleAfterMinutes': define({
    schema: z.number().int().min(1).max(1440),
    default: 15,
    description:
      'How long a scheduled job may go without a heartbeat before health calls it stale. Editable: a job that legitimately takes longer should not need a deploy to stop crying wolf.',
  }),
  'push.copy': define({
    schema: z.record(z.string(), z.record(z.string(), z.string())),
    default: {
      plan: { en: 'What does tomorrow look like?', ar: 'كيف يبدو يوم غد؟' },
      end_of_day: { en: "Tomorrow's plan is set.", ar: 'تم ضبط خطة الغد.' },
      morning: { en: 'Here is your day.', ar: 'إليك يومك.' },
    },
    description: 'Notification wording, per kind and per language.',
  }),
  'automation.subscriptions': define({
    schema: z.array(
      z.object({
        event: z.string().min(1),
        url: z.string().url(),
        enabled: z.boolean().default(false),
      }),
    ),
    default: [
      { event: 'operations.Pinged', url: 'http://n8n:5678/webhook/botvy/pinged', enabled: true },
    ],
    description:
      'Which domain events the relay forwards to automation, and where. Deliveries are signed and carry an event id, because delivery is at-least-once and a subscriber must discard a repeat.',
  }),
  'labels.palette': define({
    schema: z.array(hexColour).min(1).max(24),
    default: [
      '#ef4444',
      '#f97316',
      '#f59e0b',
      '#eab308',
      '#84cc16',
      '#22c55e',
      '#14b8a6',
      '#06b6d4',
      '#3b82f6',
      '#6366f1',
      '#a855f7',
      '#ec4899',
    ],
    description: 'Colours the label picker offers before a member chooses their own.',
  }),

  // ---- Written by the system, shown but never edited ----------------------
  'ops.lastBackupAt': define({
    schema: z.string().nullable(),
    default: null,
    description: 'When the last backup was verified. Written by the backup job.',
    readOnly: true,
  }),
  'ops.adminPasswordIsDefault': define({
    schema: z.boolean(),
    default: true,
    description:
      'Whether the seeded administrator still has its seeded password. Written at boot; the portal warns while it is true.',
    readOnly: true,
  }),
};

export type SettingKey = keyof typeof SETTINGS_REGISTRY;

export type SettingValue<K extends SettingKey> = (typeof SETTINGS_REGISTRY)[K] extends SettingDefinition<
  infer T
>
  ? T
  : never;

export const SETTING_KEYS = Object.keys(SETTINGS_REGISTRY) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTINGS_REGISTRY, key);
}

export function definitionOf(key: SettingKey): SettingDefinition {
  return SETTINGS_REGISTRY[key] as SettingDefinition;
}

/** The read side of the PATCH: what the admin settings screen renders from. */
export function describeRegistry(): Array<{
  key: string;
  default: unknown;
  description: string;
  readOnly: boolean;
}> {
  return SETTING_KEYS.map((key) => {
    const definition = definitionOf(key);
    return {
      key,
      default: definition.default,
      description: definition.description,
      readOnly: definition.readOnly === true,
    };
  });
}

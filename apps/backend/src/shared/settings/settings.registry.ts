import { z } from 'zod';
import { controlFor, type SettingControl } from './setting-control.js';
import { isValidTimezone } from '../time/time.js';

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

/**
 * Registers one key, taking its type from its schema.
 *
 * The generic is over the *schema*, not over the value. Inferring from
 * `SettingDefinition<T>` let TypeScript take `T` from the `default` instead,
 * which widens every literal: `z.enum(['monday', 'sunday', 'saturday'])` with a
 * default of `'monday'` inferred as plain `string`, so `SettingValue` handed
 * every consumer a `string` and anything expecting the union had to cast. The
 * schema already knows the answer — this asks it.
 */
function define<S extends z.ZodTypeAny>(definition: {
  schema: S;
  default: z.infer<S>;
  description: string;
  readOnly?: boolean;
}): SettingDefinition<z.infer<S>> {
  return definition as SettingDefinition<z.infer<S>>;
}

export const SETTINGS_REGISTRY = {
  // ---- Seeds for a new member's preferences -------------------------------
  // Each of these is copied into `user_preferences` when a member registers, so
  // changing one moves the starting point for everyone who joins next, and
  // never overwrites a member who has already chosen.
  'defaults.timezone': define({
    schema: z.string().refine(isValidTimezone, 'an IANA zone such as Africa/Cairo'),
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
  'meetings.alertWindowDays': define({
    schema: z.number().int().min(1).max(90),
    default: 14,
    description:
      "How far ahead meeting reminders are planned. A meeting's occurrences are computed from its repeat rule rather than stored, so a series with no end date has infinitely many of them and its reminders have to be planned for a window that a nightly pass advances. Raise it and members' phones hold alarms further ahead, so a device that has been offline for longer still fires them; lower it and there are fewer alerts to keep in step. It does not change when anybody is warned about a given meeting.",
  }),
  /*
   * Registered here in P6, not P0, and the difference is worth a line.
   *
   * The blueprint and this phase's own plan both say "a registry key P0
   * registers"; it was not there — 42 keys and no `training.*`. That is the
   * failure mode CLAUDE.md names outright: a capability three phases each
   * credit to another phase is a capability nobody builds. The materialiser
   * reads this by name and holds no literal, so the key has to exist wherever
   * it is declared, and the phase that first reads it is the honest place.
   */
  'training.materialiseDays': define({
    schema: z.number().int().min(1).max(120),
    default: 14,
    description:
      "How far ahead training sessions are created from the member's weekly slots. A slot is a weekly rule rather than a row, so the sessions it produces have to be materialised for a window that a nightly pass advances — and a program longer than this window has its later weeks filled as the window reaches them, not at apply time. Raise it and members see further into their week and their phones hold alarms earlier; lower it and there are fewer planned sessions to keep in step. It never changes when a given session happens.",
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
  // `0` turns the allowance off, which `TurnRunner.checkAllowance` has
  // always honoured and the schema refused: the floor was 1000, so the
  // branch was unreachable and its comment described a capability no
  // operator had. A single-member installation running its own GPU has no
  // reason to meter itself, and the rate limit still stands.
  'chat.dailyQuotaTokens': define({
    schema: z.number().int().min(0),
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
  /*
   * What each allergy word covers, beyond itself.
   *
   * A key rather than a constant because the words are a *product* decision an
   * Owner may reasonably disagree with — a household that reads "dairy" as
   * excluding butter, or one that wants "sesame" as a family of its own — and
   * because principle XII calls a hard-coded default a bug. Registered in P0
   * with everything else; P8 is the phase that first reads it.
   *
   * The gate expands **both ways**, which is the decision worth stating here
   * rather than only in the code. A member who declares "nuts" is protected
   * from "almond", and a member who declares "almond" is *also* held away from
   * the rest of the family. The second half is over-broad on purpose: the two
   * errors are not symmetric. Withholding too much costs a member one line of
   * food suggestions; withholding too little costs them a reaction.
   */
  'nutrition.allergenFamilies': define({
    schema: z.record(z.string(), z.array(z.string())),
    default: {
      nuts: [
        'nut',
        'nuts',
        'almond',
        'walnut',
        'peanut',
        'cashew',
        'pistachio',
        'hazelnut',
        'pecan',
        'macadamia',
        'praline',
        'nutella',
        'marzipan',
      ],
      dairy: [
        'dairy',
        'milk',
        'cheese',
        'yoghurt',
        'yogurt',
        'butter',
        'cream',
        'ghee',
        'lactose',
        'whey',
        'labneh',
        'feta',
        'halloumi',
      ],
      gluten: [
        'gluten',
        'wheat',
        'barley',
        'rye',
        'bread',
        'pasta',
        'couscous',
        'bulgur',
        'semolina',
        'flour',
        'noodle',
        'noodles',
        'cracker',
        'crackers',
      ],
      shellfish: [
        'shellfish',
        'shrimp',
        'prawn',
        'prawns',
        'crab',
        'lobster',
        'crayfish',
        'mussel',
        'mussels',
        'oyster',
        'oysters',
        'clam',
        'clams',
        'scallop',
        'scallops',
      ],
      egg: ['egg', 'eggs', 'omelette', 'omelet', 'mayonnaise', 'meringue'],
      soy: ['soy', 'soya', 'soybean', 'tofu', 'edamame', 'miso', 'tempeh'],
    },
    description:
      'What each allergy word covers. A member who declares a family is held away from every food in it, and a member who declares one food in a family is held away from the family — deliberately over-broad, because withholding too much costs a suggestion and withholding too little costs a reaction. A member’s own words are matched as well, whether or not they appear here.',
  }),
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
  // ---- Rate limits, one per entry point (P11, T1114) ----------------------
  //
  // Calls a minute, per caller. A member is counted by their id, a machine by
  // its client id, and a caller with no principal yet — which is the sign-in
  // form — by their address, because that is the only thing there is to count.
  //
  // **Zero means unlimited**, which is how an operator chasing a problem takes
  // the limiter out of the picture from the portal rather than by redeploying.
  // Every one of these is deliberately generous: a limit that a legitimate
  // member can reach is a limit that gets turned off, and a limit that is off
  // protects nothing.
  'limits.restPerMinute': define({
    schema: z.number().int().min(0).max(100_000),
    default: 300,
    description:
      'Commands a signed-in caller may send a minute over REST. Zero means unlimited.',
  }),
  'limits.graphqlPerMinute': define({
    schema: z.number().int().min(0).max(100_000),
    default: 600,
    description:
      'Reads a signed-in caller may make a minute over GraphQL. Higher than the REST limit because a screen is several reads and one act. Zero means unlimited.',
  }),
  'limits.anonymousPerMinute': define({
    schema: z.number().int().min(0).max(100_000),
    // The one that matters. Sign-in, registration and the refresh exchange are
    // the routes with no principal behind them, and they are the routes a
    // credential-stuffing attempt uses. Twenty a minute from one address is
    // far more than a person typing a password and far less than a machine
    // working through a word list.
    default: 20,
    description:
      'Calls a minute from one address before anybody has signed in — sign-in, registration and the refresh exchange. This is the credential-stuffing limit; keep it low. Zero means unlimited.',
  }),
  'limits.socketPerMinute': define({
    schema: z.number().int().min(0).max(100_000),
    default: 600,
    description:
      'Messages a minute one socket may send. The extension pings to keep its worker alive and the phone subscribes on every reconnect, so this is counted per socket rather than per member. Zero means unlimited.',
  }),
  'limits.internalPerMinute': define({
    schema: z.number().int().min(0).max(100_000),
    // Generous, because these are our own scheduled jobs and a limit that
    // stopped the nightly sweep would be worse than the runaway it prevented.
    // Present at all because a machine credential that leaks is a machine
    // credential somebody else can use.
    default: 1_200,
    description:
      'Calls a minute one machine principal may make to /internal/*. Generous: these are the scheduled jobs, and a limit that stops the nightly sweep is worse than what it prevents. Zero means unlimited.',
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
    // Empty by default, and that is the change P2 made.
    //
    // P0 shipped one subscription — `operations.Pinged` to a webhook whose only
    // job was to echo it — because the spine needed proving before there was a
    // real domain to prove it with. `planning.TaskScheduled` now makes that
    // whole journey for a member who wants the outcome, so the demonstration
    // has been retired and its subscription with it.
    //
    // It is not replaced by a default pointing at `TaskScheduled`, deliberately:
    // a subscription is a delivery to somewhere, and shipping one that names a
    // webhook path no committed workflow serves would have every task the
    // member creates log a failed delivery for ever. An operator adds the
    // events they have somewhere to send.
    default: [],
    description:
      'Which domain events the relay forwards to automation, and where. Deliveries are signed and carry an event id, because delivery is at-least-once and a subscriber must discard a repeat. Empty by default: a subscription names a webhook, and one that nothing serves is a failed delivery on every event.',
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
    description:
      'When the last backup was verified. The nightly run reports to ' +
      '/internal/backups/report, which stamps the `backup` heartbeat and writes this ' +
      'key — but only on a run that succeeded. The heartbeat answers "did it run"; ' +
      'this answers "when was the last one that worked", which is the question asked ' +
      'before deciding whether a restore is affordable.',
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
  control: SettingControl;
}> {
  return SETTING_KEYS.map((key) => {
    const definition = definitionOf(key);
    return {
      key,
      default: definition.default,
      description: definition.description,
      readOnly: definition.readOnly === true,
      /*
       * Derived from the key's own zod schema rather than annotated per key
       * (P10, FR-006).
       *
       * The portal renders a control per setting and must not hold its own map
       * of which is a switch and which is a dropdown: that map would be a
       * second copy of this registry, in another repository, and it would go
       * wrong the first time somebody added a key without remembering it. The
       * schema is the description that cannot go stale, because it is what the
       * server validates against.
       */
      control: controlFor(definition.schema),
    };
  });
}

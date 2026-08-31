import { z } from 'zod';
import { DEFAULT_TIMEZONE } from '../common/time.js';
import { DEFAULT_LEAD_TIMES } from '../reminders/lead-times.js';

/**
 * Every value an operator may change at runtime, with the schema that keeps a
 * bad one out of the database and the value used until someone changes it.
 *
 * Deliberately excluded: secrets and anything read once at construction time
 * (model name, JWT, quotas, throttler). Those stay environment variables — a
 * setting that silently needs a restart is worse than an env var that says so.
 */

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:mm');
const leadTimes = z.array(z.string().regex(/^\d+(m|h|d)$/, 'expected e.g. "1h", "30m", "0m"'));

/** Push copy, per notification kind, per language. English is the fallback. */
const pushCopy = z.record(z.string(), z.record(z.string(), z.string()));

export const SETTINGS = {
  'defaults.timezone': {
    schema: z.string().refine((tz) => {
      try {
        new Intl.DateTimeFormat('en-CA', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'expected an IANA timezone, e.g. Africa/Cairo'),
    default: DEFAULT_TIMEZONE,
    description: 'Timezone for users who have not set their own.',
  },
  'reminders.defaultLeadTimes': {
    schema: leadTimes,
    default: DEFAULT_LEAD_TIMES,
    description: 'Lead times a reminder gets when the client asks for none.',
  },
  'reminders.sweepBatch': {
    schema: z.number().int().positive().max(5000),
    default: 200,
    description: 'Most notifications one sweep will deliver.',
  },
  'reminders.expiryHours': {
    schema: z.number().int().positive().max(720),
    default: 24,
    description: 'How long an undelivered notification keeps being retried.',
  },
  'coaching.checkinTime': {
    schema: timeOfDay,
    default: '21:00',
    description: "Local time the evening check-in is asked, for users who have not set their own.",
  },
  'coaching.programTime': {
    schema: timeOfDay,
    default: '22:00',
    description: "Local time the next day's program is pushed, for users who have not set their own.",
  },
  'coaching.checkinWindowHours': {
    schema: z.number().int().positive().max(48),
    default: 12,
    description: 'How long after the question a reply still counts as the answer.',
  },
  'chat.historyLimit': {
    schema: z.number().int().positive().max(200),
    default: 20,
    description: 'Conversation turns included in the prompt.',
  },
  'push.copy': {
    schema: pushCopy,
    default: {
      reminder: { en: 'Reminder', ar: 'تذكير' },
      checkinTitle: { en: 'Evening check-in', ar: 'تسجيل المساء' },
      checkinBody: {
        en: 'Did you train and eat as planned today?',
        ar: 'هل تدربت وأكلت كما هو مخطط اليوم؟',
      },
      restTitle: { en: 'Rest day', ar: 'يوم راحة' },
      programTitle: { en: "Today's program", ar: 'برنامج اليوم' },
    },
    description: 'Notification wording, per language. Falls back to en.',
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]['schema']>;

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTINGS, key);
}

/** Written by the gateway itself (last sweep, last tick). Readable, never writable. */
export function isOpsKey(key: string): boolean {
  return key.startsWith('ops.');
}

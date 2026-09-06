import { localDate, wallClockToUtc } from '../common/time.js';

/**
 * Deterministic handling of the two time expressions a small model gets wrong
 * often enough to matter.
 *
 * Measured on qwen2.5:3b: "in 2 hours" produced no time at all, and "at 9pm"
 * said tomorrow while 9pm today was still three hours away. Both are ordinary
 * arithmetic, so they are done here instead of asked for.
 */

const UNIT_MINUTES: Record<string, number> = {
  minute: 1,
  minutes: 1,
  min: 1,
  mins: 1,
  hour: 60,
  hours: 60,
  hr: 60,
  hrs: 60,
  day: 1440,
  days: 1440,
  week: 10080,
  weeks: 10080,
  // Arabic, singular and plural. The dual forms ("ساعتين", "يومين") mean two
  // and carry no digit, so they are matched separately below.
  دقيقة: 1,
  دقائق: 1,
  ساعة: 60,
  ساعات: 60,
  يوم: 1440,
  أيام: 1440,
  ايام: 1440,
  أسبوع: 10080,
  اسبوع: 10080,
};

/** "in 20 minutes", "in 2 hours", "بعد ساعتين", "بعد ٣٠ دقيقة". */
const RELATIVE = new RegExp(
  String.raw`(?:\bin\b|بعد)\s*` +
    String.raw`(?:(\d+|[٠-٩]+)\s*)?` +
    String.raw`(${Object.keys(UNIT_MINUTES).join('|')}|ساعتين|دقيقتين|يومين|أسبوعين|اسبوعين)`,
  'iu',
);

/** Arabic-Indic digits, so "٣٠ دقيقة" counts as thirty. */
function toNumber(raw: string): number {
  const western = raw.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  return Number(western);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** A wall-clock string, in the given zone, for an absolute instant. */
function toWallClock(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${pad(Number(get('hour')) % 24)}:${get('minute')}`;
}

/**
 * The wall-clock time a "in N units" phrase names, or null when the message
 * contains no such phrase.
 */
export function resolveRelativePhrase(
  message: string,
  now: Date,
  timeZone: string,
): string | null {
  const match = RELATIVE.exec(message);
  if (!match) return null;

  const [, digits, unitRaw] = match;
  const unit = unitRaw.toLowerCase();

  // The dual forms mean exactly two and never carry a digit.
  const dual: Record<string, number> = {
    ساعتين: 120,
    دقيقتين: 2,
    يومين: 2880,
    أسبوعين: 20160,
    اسبوعين: 20160,
  };
  const minutes =
    dual[unit] ?? (digits ? toNumber(digits) * (UNIT_MINUTES[unit] ?? 0) : UNIT_MINUTES[unit] ?? 0);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;

  return toWallClock(new Date(now.getTime() + minutes * 60_000), timeZone);
}

/** Words that pin a reminder to a day other than today. */
const DATE_WORDS =
  /\b(tomorrow|tonight|today|next|on\s+\w+day|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|بكرة|بكره|غدا|غدًا|النهاردة|اليوم|الأحد|الاحد|الاثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة|السبت|\d{1,2}\s*[/-]\s*\d{1,2}/iu;

/**
 * Pulls a bare time back to today when the model pushed it to tomorrow for no
 * reason. "Remind me at 9pm", said at six, means tonight — every reminder app
 * behaves this way, and the model does not.
 *
 * Only applies when the user named no day at all, so an explicit "tomorrow at
 * 9pm" is left alone.
 */
export function preferSoonestDay(
  wallClock: string,
  message: string,
  now: Date,
  timeZone: string,
): string {
  if (DATE_WORDS.test(message)) return wallClock;

  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(wallClock);
  if (!match) return wallClock;
  const [, date, time] = match;

  const today = localDate(now, timeZone);
  // Only the next day, which is the mistake actually observed. A date further
  // out came from something in the message worth trusting, even if this
  // function cannot see what.
  const tomorrow = localDate(new Date(now.getTime() + 86_400_000), timeZone);
  if (date !== tomorrow) return wallClock;

  // Same clock time today: only worth using if it has not already passed.
  const candidate = `${today}T${time}`;
  const instant = wallClockToUtc(candidate, timeZone);
  if (!instant || instant.getTime() <= now.getTime()) return wallClock;

  return candidate;
}

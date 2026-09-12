import { localDate, wallClockToUtc } from '../../../shared/time/time.js';
/**
 * Deterministic handling of the two time expressions a small model gets wrong
 * often enough to matter.
 *
 * Ported from v1 unchanged, because it was measured rather than guessed: on
 * `qwen2.5:3b`, "in 2 hours" produced no time at all, and "at 9pm" said
 * tomorrow while 9pm today was still three hours away. Both are ordinary
 * arithmetic, so principle III does them here — the model names *what* the
 * member wants and the code works out *when*.
 *
 * The Arabic half is the part that would not survive a rewrite. The dual forms
 * — `ساعتين`, `يومين` — mean exactly two and carry no digit, so they
 * cannot be matched by the number-plus-unit pattern and are a separate table.
 * Arabic-Indic digits are folded before parsing. Both were found by using it.
 *
 * `preferSoonestDay` only ever pulls a time back by one day, and only when the
 * member named no day at all. A date further out came from something in the
 * sentence worth trusting even if this function cannot see what.
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

/**
 * Number words, because people write them.
 *
 * v1's pattern matched a digit and a unit, plus the Arabic duals separately —
 * so `2 hours` and `ساعتين` both worked and **`two hours` resolved to
 * nothing**, falling through to whatever the model guessed. Which is the one
 * thing this module exists to stop: the measured failure was that a small
 * model produces no time at all for "in two hours".
 *
 * Stops at twelve. Past that people use digits, and a table that ran to a
 * hundred would be a hundred lines to cover phrasings nobody writes.
 */
const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  half: 0.5,
};

/** "in 20 minutes", "in 2 hours", "in two hours", "بعد ساعتين", "بعد ٣٠ دقيقة". */
const RELATIVE = new RegExp(
  String.raw`(?:\bin\b|بعد)\s*` +
    String.raw`(?:(\d+|[٠-٩]+|` +
    Object.keys(NUMBER_WORDS).join('|') +
    String.raw`)\s*)?` +
    /*
     * An article may sit between the number and the unit: "half an hour",
     * "in a couple of days" — and the first of those is common enough to be
     * worth a group of its own. Without it `half` matched the number and then
     * `an` blocked the unit, so the whole phrase resolved to null and fell
     * through to the model.
     *
     * Optional and non-capturing, so it changes no group index: `a` and `an`
     * are themselves in the number table (both meaning one), which is what
     * makes "in an hour" work by the number path instead.
     */
    String.raw`(?:(?:a|an|the|of)\s+)*` +
    String.raw`(${Object.keys(UNIT_MINUTES).join('|')}|ساعتين|دقيقتين|يومين|أسبوعين|اسبوعين)`,
  'iu',
);

/** Arabic-Indic digits, so "٣٠ دقيقة" counts as thirty — and number words. */
function toNumber(raw: string): number {
  const word = NUMBER_WORDS[raw.toLowerCase()];
  if (word !== undefined) return word;
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
  /*
   * Checked, where v1 did not.
   *
   * The group is non-optional in the pattern, so it cannot be absent for a
   * match — but this repo compiles with `noUncheckedIndexedAccess`, and v1 did
   * not. The guard is free and the alternative is a non-null assertion, which
   * is a claim a reader has to verify against a regex.
   */
  if (!unitRaw) return null;
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
/*
 * The month abbreviations require a number beside them, and that is a fix
 * rather than a nicety.
 *
 * v1 listed them as bare words, so **any message containing "may" disabled
 * `preferSoonestDay`** — "remind me at 9pm, if I may" went to tomorrow, and so
 * did anything containing "march" or "mar". `may` is one of the commonest words
 * in English and the only one on this list that is also a modal verb.
 *
 * A month is only a date when it carries a day, so `(?:\d{1,2}\s*)?<month>`
 * with a following day covers "3 Jan", "Jan 3" and "January 3rd" and leaves the
 * verb alone. The weekday names stay bare: "monday" is never anything else.
 */
const DATE_WORDS = new RegExp(
  String.raw`\b(?:tomorrow|tonight|today|next|on\s+\w+day|` +
    String.raw`monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b` +
    String.raw`|\b\d{1,2}\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)` +
    String.raw`|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{1,2}\b` +
    String.raw`|بكرة|بكره|غدا|غدًا|النهاردة|اليوم|الأحد|الاحد|الاثنين|الثلاثاء` +
    String.raw`|الأربعاء|الاربعاء|الخميس|الجمعة|السبت` +
    String.raw`|\d{1,2}\s*[/-]\s*\d{1,2}`,
  'iu',
);

/**
 * Does the member's own sentence name a moment at all?
 *
 * ## Why this is needed, and what it costs when it is missing
 *
 * `resolveWhen` trusts the sentence first and the model second: a phrase the
 * code can resolve wins, and only when there is no such phrase does the model's
 * wall clock get used. That ordering is right, and it has a hole — **when the
 * sentence names no time whatsoever, the model sometimes supplies one anyway.**
 *
 * P5's corpus caught it. For "عندي معاد مع الدكتور في العيادة، اعمله في
 * التقويم" — "I have an appointment with the doctor at the clinic, put it in my
 * calendar" — `qwen2.5:3b-instruct` answered `set_meeting` correctly and then
 * invented `08:00`. A meeting is then created for a time the member never said,
 * which is precisely what FR-006 exists to prevent: a missing field is the thing
 * to ask about rather than to invent. The corpus case for it asserts
 * `whenAbsent`, so the hallucination is a visible failure rather than a
 * surprise, and this function is what makes the pipeline behave as the corpus
 * says it should.
 *
 * ## Why a vocabulary check rather than trusting the resolver's null
 *
 * Because `resolveRelativePhrase` returning null does not mean "no time was
 * named" — it means "no *relative* phrase was recognised". "at 7:30" and "on
 * the 14th" are real times it does not handle, and refusing the model's clock
 * for those would lose a time the member genuinely gave.
 *
 * So this asks a weaker and safer question: is there anything in the sentence a
 * time could have come from — a digit in either script, a weekday, a month, a
 * relative word, a clock word? If there is, the model's answer is plausible and
 * is kept. If there is not, it had nothing to read and the field is dropped, and
 * the executor asks.
 *
 * The errors are deliberately asymmetric. A false negative costs one question —
 * FR-006's own preferred failure. A false positive is a calendar entry at an
 * hour nobody chose, discovered when the member misses something.
 */
export function mentionsAMoment(text: string): boolean {
  return mentionsAClock(text) || RELATIVE.test(text) || DATE_WORDS.test(text);
}

/**
 * Does the sentence name a *time of day*, as opposed to a day?
 *
 * The narrower half of `mentionsAMoment`, and it exists because the wider one is
 * **defeated by a weekday**. "I do football on Fridays" names a moment — Friday
 * is a date word — so a clock the model invented alongside it survives the
 * extractor's guard. For a reminder that is one wrong alarm; for a *training
 * slot* it is a fortnight of them, materialised ahead, at an hour nobody chose.
 *
 * So an intent whose sentence must contain a weekday — `set_slots` — asks this
 * instead. The same asymmetry of errors decides it as decides the wider guard:
 * a false negative costs one question, a false positive costs a week of alarms.
 *
 * Exported rather than the regex, and not duplicated into the executor, because
 * two copies of this vocabulary one typo apart is precisely the failure this
 * codebase has already recorded about its "latest n" reads.
 */
export function mentionsAClock(text: string): boolean {
  return CLOCK_WORDS.test(text);
}

/**
 * Anything a clock time could be written as, beyond the two tables above.
 *
 * Digits in both scripts carry most of it — a member who names an hour almost
 * always writes a number. The words are the ones that name an hour without one,
 * in both languages.
 *
 * ## The spelled-out hour, which the first version of this missed
 *
 * "gym Monday and Wednesday **at six**" is P6's own headline example for
 * setting a training week, and it names an hour with no digit in it. So
 * `at <number word>` is here, sharing `NUMBER_WORDS` with the relative parser
 * rather than listing the numbers twice — the guard was too tight without it
 * and refused the feature's flagship sentence, which is exactly the false
 * negative this vocabulary exists to avoid. The Arabic half needs no such
 * pattern: `الساعة` is itself a clock marker ("the hour"), so
 * "الساعة ستة" matches on the marker.
 *
 * Every other entry stays deliberately few, because each one is a chance to
 * accept a time the model invented — and the cost of a *missing* entry is one
 * question, where the cost of a wrong entry is an alarm nobody set.
 */
const CLOCK_WORDS = new RegExp(
  // A digit in either script carries most of the recall on its own.
  String.raw`\d|[٠-٩]` +
    // "at six", "at half past" — an hour spelled out, which a member setting a
    // weekly slot very often does. The numbers come from the same table the
    // relative parser reads, so the two cannot drift apart.
    String.raw`|(?<![a-z])at\s+(?:${Object.keys(NUMBER_WORDS).join('|')})(?![a-z])` +
    // `الساعة` is a clock marker in its own right, so the Arabic side needs no
    // number pattern: "الساعة ستة" matches here.
    String.raw`|الساعة` +
    // Word boundaries written as lookarounds rather than `\b`, because `am`
    // and `pm` need them — without one, "ram" and "spam" name an hour.
    String.raw`|(?<![a-z])(?:noon|midday|midnight|morning|afternoon|evening|night|` +
    String.raw`o'?clock|am|pm|half\s+past|quarter\s+(?:past|to))(?![a-z])` +
    String.raw`|الظهر|الضهر|منتصف\s*الليل|الصبح|الصباح|العصر|المغرب|المسا|المساء|بالليل`,
  'iu',
);

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

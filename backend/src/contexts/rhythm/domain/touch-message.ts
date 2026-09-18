import { arabicCounted, isArabic } from '../../../shared/i18n/counted.js';
import { localHhMm } from '../../../shared/time/time.js';
import type {
  DailyPlan,
  PlanMeeting,
  PlanTask,
} from './daily-plan.aggregate.js';

/**
 * The words the three touches actually say.
 *
 * Pure functions over a plan, in one file, for two reasons. The first is
 * testability: the sentence a member reads at 22:00 is the product, and a spec
 * that can only assert "a message was appended" is a spec that would have
 * passed while the summary said "you have 0 tasks tomorrow" to somebody with
 * four.
 *
 * The second is that these sentences are the **member's language**, and keeping
 * that in one place is what made it fixable. Until E-012 they were English
 * whatever the member read: a message composed by a job on the server and
 * stored as a row is stored in whatever language composed it, so an
 * Arabic-reading member got three English sentences a day in the middle of an
 * Arabic interface.
 *
 * ## The locale, and what it costs
 *
 * It arrives on `MemberSchedule` — the same slice that already carries the
 * zone, from Profile, batched for the whole roster — because the two facts are
 * needed at exactly the same moment by exactly the same caller, and a second
 * port for one string would be a second round trip per member on a job whose
 * budget is a pass in under ten seconds. `profiles.locale` is the source of
 * truth; a member with no locale, or one there is no table for, reads English.
 *
 * A message is composed once and stored, and messages are immutable — which is
 * load-bearing for the sync cursor — so **a member who changes language keeps
 * their old transcript in the old one.** That is the known cost of composing
 * here rather than at render time, and it is the cost
 * `docs/decisions/001-the-options-i-chose-on-the-enhancements.md` accepted.
 *
 * ## Arabic is not the English sentence with Arabic words
 *
 * Every counted noun goes through `arabicCounted`: a duration of two minutes is
 * دقيقتين and not "٢ دقائق", and a task carried over three times takes the
 * plural where one carried over twelve takes the singular back. The rules are
 * the phone's — `mobile/lib/core/i18n/counted.dart` — because the member reads
 * both surfaces and the two must not disagree about their own language.
 *
 * ## Every sentence is built from what is present
 *
 * Not from a template with holes in it. The training slot arrives in P6 and the
 * meal line in P8, and until then they are absent rather than empty — so the
 * lines are assembled from the parts that exist. A fixed template would read
 * "Training: none | Meals: none" for every member for five phases, which is
 * three phases of telling people something untrue.
 */

/**
 * Which language this member's touches are written in.
 *
 * The same shape Conversations uses for its templated confirmations — a
 * function taking both halves — and a deliberate second copy rather than a
 * shared import: that one picks its language from the **script the member just
 * typed in**, which is evidence this job does not have and must not pretend to.
 * Two callers, two rules, one shape.
 */
type Phrasebook = (english: string, arabic: string) => string;

function phrasebook(locale: string): Phrasebook {
  const arabic = isArabic(locale);
  return (english, arabicText) => (arabic ? arabicText : english);
}

/**
 * How a task is named in a list the member reads.
 *
 * `P{n}` stays Latin in both languages. It is a marker rather than a word — the
 * same decision the ISO date takes — and an Arabic rendering of it would be an
 * invention this file is not entitled to make; see the report accompanying
 * E-012.
 */
function taskLine(task: PlanTask, timezone: string, say: Phrasebook): string {
  const carried =
    task.deferCount > 0
      ? say(
          ` (carried over ×${task.deferCount})`,
          ` (مؤجّلة ${arabicCounted(task.deferCount, {
            one: 'مرة واحدة',
            two: 'مرتين',
            few: 'مرات',
            many: 'مرةً',
          })})`,
        )
      : '';
  const at =
    task.dueAt && !isMidnight(task.dueAt, timezone)
      ? say(
          ` at ${localHhMm(task.dueAt, timezone)}`,
          ` الساعة ${localHhMm(task.dueAt, timezone)}`,
        )
      : '';
  return `• P${task.priority} ${task.title}${at}${carried}`;
}

/**
 * An all-day task has a `dueAt` at the member's own midnight, and printing
 * "at 00:00" beside it is how a task with no time acquires one on screen.
 * Checked against the member's zone rather than the server's, or every task in
 * Cairo reads as due at 02:00.
 *
 * `localHhMm` and not `formatInTz`: the latter renders "Tue 2 Sep, 20:00",
 * whose width moves with the day and the month, so slicing a time out of it
 * yields ", 20:0" on the 2nd and "20:00" on the 20th. `localHhMm` returns
 * exactly `HH:mm` and is the only function in `shared/time` that promises to.
 */
function isMidnight(at: Date, timezone: string): boolean {
  return localHhMm(at, timezone) === '00:00';
}

/**
 * The day's meetings, or nothing at all (FR-012).
 *
 * `null` and not an empty heading: a member with no meetings must read exactly
 * the sentence they read before this phase, and "Meetings:" over a blank space
 * is the "Training: none | Meals: none" failure this file's header argues
 * against. The lines are only added when there is something to add.
 *
 * Times through `localHhMm`, which is the only function in `shared/time` that
 * promises exactly `HH:mm` — see `isMidnight` above for what slicing
 * `formatInTz` did on single-digit days. Midnight is *not* suppressed the way
 * it is for a task: a meeting always occupies a stretch of the day (FR-001), so
 * a 00:00 start is a real time somebody chose rather than a date with no hour.
 */
function meetingLines(
  meetings: PlanMeeting[],
  timezone: string,
  say: Phrasebook,
): string[] | null {
  if (meetings.length === 0) return null;
  return [
    say('Meetings:', 'المواعيد:'),
    ...meetings.map(
      (meeting) =>
        `• ${localHhMm(meeting.startAt, timezone)} ${meeting.title}` +
        // The one counted noun in this line, and the reason it goes through
        // `arabicCounted` rather than a suffix: two minutes is دقيقتين, and
        // eleven takes the singular back.
        say(
          ` (${meeting.durationMin}m)`,
          ` (${arabicCounted(meeting.durationMin, {
            one: 'دقيقة',
            two: 'دقيقتين',
            few: 'دقائق',
            many: 'دقيقةً',
          })})`,
        ),
    ),
  ];
}

/**
 * The meal half, as a line in a message (FR-008, FR-014).
 *
 * The three withholding codes are turned into words here — the one place in
 * this file's remit that renders a code — in the member's own language, like
 * everything else this file composes. A client renders the same three codes
 * from `daily_plans.mealReason` itself, which is why the *code* and not this
 * sentence is what is stored on the row.
 *
 * A day nobody has chosen meals for yet gets **no line at all** rather than
 * "none planned": the member has not been refused anything, and a plan that
 * announced an absence every evening would be five words of noise.
 */
export function mealLine(plan: DailyPlan, say: Phrasebook): string | null {
  if (plan.mealLine)
    return say(`Meals: ${plan.mealLine}`, `الوجبات: ${plan.mealLine}`);
  if (!plan.mealReason) return null;
  return say(
    `Meals: none planned — ${withheldSentence(plan.mealReason, say)}`,
    `الوجبات: لا شيء — ${withheldSentence(plan.mealReason, say)}`,
  );
}

/** Nutrition's three codes, in words. An unknown code says only what it knows. */
function withheldSentence(reason: string, say: Phrasebook): string {
  switch (reason) {
    case 'allergen':
      return say(
        'nothing I could suggest avoided something you are allergic to.',
        'لم أجد اقتراحًا يخلو مما لديك حساسية منه.',
      );
    case 'empty_library':
      return say(
        'your meal list is empty. Add a few and I will use them.',
        'قائمة وجباتك فارغة. أضِف بعضها وسأستخدمها.',
      );
    case 'model_unavailable':
      return say(
        'I could not reach the model.',
        'لم أستطع الوصول إلى النموذج.',
      );
    default:
      return say('I could not put a list together.', 'لم أستطع تجهيز قائمة.');
  }
}

function trainingLine(
  plan: DailyPlan,
  timezone: string,
  say: Phrasebook,
): string | null {
  if (!plan.training) return null;
  const start = localHhMm(plan.training.startAt, timezone);
  return say(
    `Training: ${plan.training.title} (${plan.training.sport}) at ${start}`,
    `التدريب: ${plan.training.title} (${plan.training.sport}) الساعة ${start}`,
  );
}

/** The evening question, with the draft under it. */
export function planPromptMessage(
  plan: DailyPlan,
  timezone: string,
  locale = 'en',
): string {
  const say = phrasebook(locale);
  const parts: string[] = [
    say('What should tomorrow look like?', 'كيف تريد أن يكون غدك؟'),
  ];

  if (plan.isEmpty) {
    // Said plainly, because an empty list looks like a bug and reads like an
    // accusation. The member has nothing scheduled; that is a fine way to
    // spend a Tuesday.
    parts.push(
      '',
      say(
        'Nothing is scheduled yet — nothing due and no training.',
        'لا شيء مجدول بعد — لا مهام ولا تدريب.',
      ),
    );
    // The meal half still goes out. A day with no tasks and no session is
    // exactly the day whose one piece of news is what the member is eating, and
    // hiding it here would make FR-009's "the line appears in the evening
    // proposal" true for busy members only.
    const quietMeals = mealLine(plan, say);
    if (quietMeals) parts.push('', quietMeals);
  } else {
    if (plan.tasks.length > 0) {
      parts.push('', say("Here's what I have:", 'هذا ما لديّ:'));
      parts.push(...plan.tasks.map((task) => taskLine(task, timezone, say)));
    }
    const meetings = meetingLines(plan.meetings, timezone, say);
    if (meetings) parts.push('', ...meetings);
    const training = trainingLine(plan, timezone, say);
    if (training) parts.push('', training);
    const meals = mealLine(plan, say);
    if (meals) parts.push(meals);
  }

  parts.push(
    '',
    say(
      'Confirm, edit it, or ignore this and I will set it at the end of the day.',
      'أكِّد، أو عدِّل، أو تجاهل وسأثبّته في آخر اليوم.',
    ),
  );
  return parts.join('\n');
}

/** The end-of-day summary: what tomorrow now holds, and how it got set. */
export function endOfDayMessage(
  plan: DailyPlan,
  timezone: string,
  checkinAsked: boolean,
  locale = 'en',
): string {
  const say = phrasebook(locale);
  const parts: string[] = [say("Tomorrow's set.", 'غدًا جاهز.')];

  if (plan.status === 'skipped') {
    // A member who skipped planning still gets told about their training —
    // that is the part they cannot reconstruct from a task list, and skipping
    // the plan is not a request to be kept in the dark.
    parts.push('', say('You skipped planning tomorrow.', 'تخطّيت تخطيط الغد.'));
  } else if (plan.isEmpty) {
    parts.push('', say('Nothing due and no training.', 'لا مهام ولا تدريب.'));
    const quietMeals = mealLine(plan, say);
    if (quietMeals) parts.push('', quietMeals);
  } else {
    if (plan.tasks.length > 0) {
      parts.push('', say('Top priorities:', 'أهم الأولويات:'));
      parts.push(...plan.tasks.map((task) => taskLine(task, timezone, say)));
    }
    /*
     * The summary names tomorrow's meetings for the same reason it names
     * tomorrow's training: it is the part of the day the member cannot
     * reconstruct from a task list. It is here rather than only in the two
     * touches FR-012 names because `isEmpty` now counts meetings, so a day
     * holding nothing but a meeting reaches this branch — and without these
     * two lines it would read "Tomorrow's set. No training tomorrow." with the
     * meeting nowhere in it.
     */
    const meetings = meetingLines(plan.meetings, timezone, say);
    if (meetings) parts.push('', ...meetings);
    parts.push(
      '',
      trainingLine(plan, timezone, say) ??
        say('No training tomorrow.', 'لا تدريب غدًا.'),
    );
    const meals = mealLine(plan, say);
    if (meals) parts.push(meals);
  }

  if (plan.autoConfirmed) {
    parts.push(
      '',
      say(
        'You did not answer, so I set it from the draft.',
        'لم تردّ، فثبّتُّه من المسودة.',
      ),
    );
  }

  if (checkinAsked) {
    parts.push(
      '',
      say(
        'How did today go? Did you follow the plan, and how are you feeling out of 100?',
        'كيف كان يومك؟ هل التزمت بالخطة، وكيف تشعر من 100؟',
      ),
    );
  }

  return parts.join('\n');
}

/** The morning briefing: today, as it stands. */
export function morningBriefingMessage(
  plan: DailyPlan,
  timezone: string,
  locale = 'en',
): string {
  const say = phrasebook(locale);
  const parts: string[] = [say('Good morning. Today:', 'صباح الخير. اليوم:')];

  if (plan.isEmpty) {
    parts.push(
      '',
      say(
        'Nothing due and no training. A clear day.',
        'لا مهام ولا تدريب. يوم خالٍ.',
      ),
    );
    const quietMeals = mealLine(plan, say);
    if (quietMeals) parts.push('', quietMeals);
    return parts.join('\n');
  }

  if (plan.tasks.length > 0) {
    parts.push(...plan.tasks.map((task) => taskLine(task, timezone, say)));
  }
  // The half of FR-012 that gets forgotten: the briefing names *today's*
  // meetings, and it is the touch a member reads before they leave the house.
  const meetings = meetingLines(plan.meetings, timezone, say);
  if (meetings) parts.push('', ...meetings);
  const training = trainingLine(plan, timezone, say);
  if (training) parts.push('', training);
  const meals = mealLine(plan, say);
  if (meals) parts.push(meals);

  return parts.join('\n');
}

/** What the notification says. One line, because that is all a banner shows. */
export function touchNotificationTitle(
  kind: 'plan' | 'end_of_day' | 'morning',
  locale = 'en',
): string {
  const say = phrasebook(locale);
  switch (kind) {
    case 'plan':
      return say('Plan tomorrow', 'خطّط للغد');
    case 'end_of_day':
      return say("Tomorrow's plan is set", 'خطة الغد جاهزة');
    case 'morning':
      return say('Your day', 'يومك');
  }
}

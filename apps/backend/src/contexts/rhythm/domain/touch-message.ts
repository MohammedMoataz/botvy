import { localHhMm } from '../../../shared/time/time.js';
import type { DailyPlan, PlanTask } from './daily-plan.aggregate.js';

/**
 * The words the three touches actually say.
 *
 * Pure functions over a plan, in one file, for two reasons. The first is
 * testability: the sentence a member reads at 22:00 is the product, and a spec
 * that can only assert "a message was appended" is a spec that would have
 * passed while the summary said "you have 0 tasks tomorrow" to somebody with
 * four.
 *
 * The second is that these sentences are **English only**, and keeping that in
 * one place is what makes it fixable. The profile carries a `locale` and the
 * phone renders its own UI in Arabic, but a message composed by a job on the
 * server and stored as a row is stored in whatever language composed it — so an
 * Arabic-reading member gets an English coach message. P3's spec does not ask
 * for anything else and no requirement covers it, so it is not a defect of this
 * phase; it is recorded as `enhancements/E-012` with what fixing it would take.
 *
 * ## Every sentence is built from what is present
 *
 * Not from a template with holes in it. The training slot arrives in P6 and the
 * meal line in P8, and until then they are absent rather than empty — so the
 * lines are assembled from the parts that exist. A fixed template would read
 * "Training: none | Meals: none" for every member for five phases, which is
 * three phases of telling people something untrue.
 */

/** How a task is named in a list the member reads. */
function taskLine(task: PlanTask, timezone: string): string {
  const carried =
    task.deferCount > 0 ? ` (carried over ×${task.deferCount})` : '';
  const at =
    task.dueAt && !isMidnight(task.dueAt, timezone)
      ? ` at ${localHhMm(task.dueAt, timezone)}`
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

function trainingLine(plan: DailyPlan, timezone: string): string | null {
  if (!plan.training) return null;
  const start = localHhMm(plan.training.startAt, timezone);
  return `Training: ${plan.training.title} (${plan.training.sport}) at ${start}`;
}

/** The evening question, with the draft under it. */
export function planPromptMessage(plan: DailyPlan, timezone: string): string {
  const parts: string[] = ['What should tomorrow look like?'];

  if (plan.isEmpty) {
    // Said plainly, because an empty list looks like a bug and reads like an
    // accusation. The member has nothing scheduled; that is a fine way to
    // spend a Tuesday.
    parts.push('', 'Nothing is scheduled yet — nothing due and no training.');
  } else {
    if (plan.tasks.length > 0) {
      parts.push('', "Here's what I have:");
      parts.push(...plan.tasks.map((task) => taskLine(task, timezone)));
    }
    const training = trainingLine(plan, timezone);
    if (training) parts.push('', training);
    if (plan.mealLine) parts.push(plan.mealLine);
  }

  parts.push('', 'Confirm, edit it, or ignore this and I will set it at the end of the day.');
  return parts.join('\n');
}

/** The end-of-day summary: what tomorrow now holds, and how it got set. */
export function endOfDayMessage(
  plan: DailyPlan,
  timezone: string,
  checkinAsked: boolean,
): string {
  const parts: string[] = ["Tomorrow's set."];

  if (plan.status === 'skipped') {
    // A member who skipped planning still gets told about their training —
    // that is the part they cannot reconstruct from a task list, and skipping
    // the plan is not a request to be kept in the dark.
    parts.push('', 'You skipped planning tomorrow.');
  } else if (plan.isEmpty) {
    parts.push('', 'Nothing due and no training.');
  } else {
    if (plan.tasks.length > 0) {
      parts.push('', 'Top priorities:');
      parts.push(...plan.tasks.map((task) => taskLine(task, timezone)));
    }
    parts.push('', trainingLine(plan, timezone) ?? 'No training tomorrow.');
    if (plan.mealLine) parts.push(plan.mealLine);
  }

  if (plan.autoConfirmed) {
    parts.push('', 'You did not answer, so I set it from the draft.');
  }

  if (checkinAsked) {
    parts.push(
      '',
      'How did today go? Did you follow the plan, and how are you feeling out of 100?',
    );
  }

  return parts.join('\n');
}

/** The morning briefing: today, as it stands. */
export function morningBriefingMessage(
  plan: DailyPlan,
  timezone: string,
): string {
  const parts: string[] = ['Good morning. Today:'];

  if (plan.isEmpty) {
    parts.push('', 'Nothing due and no training. A clear day.');
    return parts.join('\n');
  }

  if (plan.tasks.length > 0) {
    parts.push(...plan.tasks.map((task) => taskLine(task, timezone)));
  }
  const training = trainingLine(plan, timezone);
  if (training) parts.push('', training);
  if (plan.mealLine) parts.push(plan.mealLine);

  return parts.join('\n');
}

/** What the notification says. One line, because that is all a banner shows. */
export function touchNotificationTitle(
  kind: 'plan' | 'end_of_day' | 'morning',
): string {
  switch (kind) {
    case 'plan':
      return 'Plan tomorrow';
    case 'end_of_day':
      return "Tomorrow's plan is set";
    case 'morning':
      return 'Your day';
  }
}

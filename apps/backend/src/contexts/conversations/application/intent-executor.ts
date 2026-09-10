import { Injectable, Logger } from '@nestjs/common';
import { formatInTz, localDate, wallClockToUtc } from '../../../shared/time/time.js';
import {
  IntentExecutorPort,
  PlannerActionsPort,
  ProfileWritesPort,
  type CancellableItem,
  type CreatedItem,
  type ExecutionResult,
  type MemberFacts,
} from '../domain/chat.ports.js';
import type { Intent, ListKind } from '../domain/intent.js';
import { fold } from './allergen-guard.js';

/**
 * Carries out what the member asked for, in the context that owns it, and says
 * what was stored.
 *
 * ## The model named the intent; everything here is code
 *
 * No branch below asks a model anything. That is the safety story of the phase
 * made concrete: an id is looked up by searching the member's own rows, a time
 * is arithmetic against their zone, a missing field is a question, and a
 * capability that does not exist yet is a refusal. A model that hallucinates
 * cannot reach any of it, and neither can a pasted document — acting requires a
 * typed `Intent`, and extraction reads only the member's own sentence.
 *
 * ## Why the confirmation is templated here and not written by the model
 *
 * FR-004: it has to name the values that were **actually stored**. Every method
 * on `PlannerActionsPort` returns a `CreatedItem` for exactly this reason, and
 * the reply is rendered from that rather than from the intent — a title Planning
 * trimmed or a time it clamped is confirmed as it now is. A model asked to
 * confirm what was just done confirms something plausible, and the member finds
 * out at the wrong hour.
 *
 * ## One switch, every name a case
 *
 * `IntentName` has eight members and there are eight cases, with no `default`.
 * That is deliberate and it is checkable: a ninth name added to the union makes
 * the exhaustiveness check at the bottom of `execute` a compile error, in this
 * file, in the same change. A `default` that returned a polite fallback would
 * make it a silent no-op that ships.
 *
 * ## Both languages, everywhere
 *
 * Every reply below exists twice. The member's own script decides which,
 * because the script is the stronger signal: a member whose account locale is
 * `en` and who typed Arabic wants Arabic back, and `coach.md` and `planner.md`
 * both instruct the *model* to answer in the language they wrote in — a
 * templated confirmation that came back in English regardless would be the one
 * part of the product that ignores them.
 */
@Injectable()
export class IntentExecutor extends IntentExecutorPort {
  private readonly logger = new Logger(IntentExecutor.name);

  constructor(
    private readonly planner: PlannerActionsPort,
    private readonly profile: ProfileWritesPort,
  ) {
    super();
  }

  override async execute(input: {
    userId: string;
    intent: Intent;
    text: string;
    now: Date;
    facts: MemberFacts;
  }): Promise<ExecutionResult> {
    const { userId, intent, text, now, facts } = input;
    const say = phrasebook(text, facts.locale);
    const zone = facts.timezone;

    switch (intent.name) {
      case 'chat':
        /*
         * Unreachable through `TurnRunner`, which routes on `isAction` and
         * sends a `chat` intent to the model instead. It is a case rather than
         * an omission because the switch's completeness is the property worth
         * having, and because a second caller — the offline batch path — would
         * otherwise get `undefined` from a method typed to return a result.
         */
        return { reply: say('', ''), actions: [], asking: false };

      case 'set_task': {
        const title = intent.args.title;
        if (!title) {
          return ask(
            say(
              'What should I add to your list?',
              'أضيف إيه لقائمتك؟',
            ),
          );
        }

        const when = intent.args.when;
        /*
         * All-day means "that day, no hour", so the past check is a date
         * comparison and not an instant one.
         *
         * A task the member asked for today with no time resolves to midnight,
         * which has been in the past since midnight — refusing it would refuse
         * every "buy milk today" said after 00:01, which is all of them.
         */
        const allDay = intent.args.allDay === true && Boolean(when);
        let dueAt: Date | null = null;
        if (when) {
          dueAt = wallClockToUtc(when, zone);
          if (!dueAt) {
            return ask(
              say(
                'When would you like that for?',
                'عايزها امتى؟',
              ),
            );
          }
          if (!allDay && dueAt.getTime() <= now.getTime()) {
            return ask(this.pastQuestion(say, dueAt, zone));
          }
        }

        const stored = await this.planner.createTask({
          userId,
          title,
          dueAt,
          allDay,
          priority: intent.args.priority,
          labelName: intent.args.label,
          notes: intent.args.notes,
        });

        return {
          reply: this.taskConfirmation(say, stored, zone),
          actions: [{ kind: 'task.created', id: stored.id }],
          asking: false,
        };
      }

      case 'set_reminder': {
        const title = intent.args.title;
        if (!title) {
          return ask(
            say(
              'What should I remind you about?',
              'أفكّرك بإيه؟',
            ),
          );
        }

        const when = intent.args.when;
        if (!when) {
          /*
           * FR-006 at its sharpest. A reminder is a time — there is no sensible
           * default and "in an hour" would be an invention the member does not
           * discover until the wrong hour, or never, because a reminder that
           * fires at a time they did not choose reads as a bug in the app
           * rather than a misunderstanding. One short question costs a second.
           */
          return ask(
            say(
              'When should I remind you?',
              'أفكّرك امتى؟',
            ),
          );
        }

        const remindAt = wallClockToUtc(when, zone);
        if (!remindAt) {
          return ask(
            say('When should I remind you?', 'أفكّرك امتى؟'),
          );
        }
        if (remindAt.getTime() <= now.getTime()) {
          /*
           * A moment already gone is refused with a question, never quietly
           * moved forward.
           *
           * This is the offline case `TurnRunner` explains: a message composed
           * at 14:10 and delivered at 20:00 asking for "in two hours" resolves
           * to 16:10, because the turn is understood as of when it was *typed*
           * (FR-007). 16:10 is the correct reading of what they asked for, and
           * it has passed. Rolling it to 22:10 would create a reminder they
           * never asked for at an hour they did not choose; rolling it to
           * tomorrow would be worse. Asking is the only honest branch, and it
           * names the time so they can see what was understood.
           */
          return ask(this.pastQuestion(say, remindAt, zone));
        }

        const stored = await this.planner.createReminder({
          userId,
          title,
          remindAt,
          leadTimes: intent.args.leadTimes,
        });

        // `stored.at` and not `remindAt`: if Reminders rounded or clamped it,
        // the member is told the time that will actually fire.
        const at = stored.at ?? remindAt;
        return {
          reply: say(
            `I'll remind you about "${stored.title}" on ${formatInTz(at, zone)}.`,
            `هفكّرك بـ "${stored.title}" يوم ${formatInTz(at, zone)}.`,
          ),
          actions: [{ kind: 'reminder.created', id: stored.id }],
          asking: false,
        };
      }

      case 'set_meeting':
        /*
         * FR-006's rule applied to a capability rather than a field.
         *
         * The extractor will produce `set_meeting` from "schedule a call with
         * Sara at four" because `intent.md` teaches it to, and that is on
         * purpose: the alternative is the model filing it as a task, and the
         * member discovering months later that Botvy has been quietly turning
         * their meetings into to-do items. Meetings are P5. Nothing is
         * dispatched, nothing is stored, and the member is told plainly.
         */
        return {
          reply: say(
            "I can't create meetings yet — that's coming in a later version, so " +
              "I haven't saved anything. You could put it on your list as a task " +
              'for now.',
            'لسه مش بقدر أعمل مواعيد اجتماعات — الميزة دي جاية في نسخة قادمة، ' +
              'فمحفظتش حاجة. لو تحب أضيفها كمهمة في قائمتك مؤقتًا.',
          ),
          actions: [],
          asking: false,
        };

      case 'cancel': {
        const match = intent.args.match ?? intent.args.title;
        if (!match) {
          return ask(
            say(
              'What would you like me to cancel?',
              'تحب ألغي إيه بالظبط؟',
            ),
          );
        }

        const open = await this.planner.findCancellable(userId, now);
        const hits = matching(open, match);

        if (hits.length === 0) {
          return {
            reply: say(
              `I couldn't find anything open that matches "${match}".`,
              `مالقيتش حاجة مفتوحة بتطابق "${match}".`,
            ),
            actions: [],
            asking: false,
          };
        }

        if (hits.length > 1) {
          /*
           * Two matches is a question, never a guess, and the model is never
           * asked to pick.
           *
           * The wrong choice here deletes something the member wanted and
           * leaves the thing they meant to cancel in place — two failures from
           * one turn, and the second one is invisible until it fires. The
           * candidates are listed in their own words with their own times so
           * the answer is one word long.
           */
          const listed = hits
            .map((item) => `- ${item.title}${describeAt(item, zone)}`)
            .join('\n');
          return ask(
            say(
              `I found ${hits.length} that could be it — which one?\n${listed}`,
              `لقيت ${hits.length} حاجة ممكن تكون هي — أنهي واحدة؟\n${listed}`,
            ),
          );
        }

        const item = hits[0]!;
        const cancelled = await this.planner.cancel(userId, item);
        if (!cancelled) {
          // The row went while this turn was running — another device, or the
          // reminder fired. Reported rather than dressed up as success: the
          // member would go looking for a cancellation that never happened.
          this.logger.debug(`cancel of ${item.kind} ${item.id} was refused`);
          return {
            reply: say(
              `I couldn't cancel "${item.title}" — it may already be gone.`,
              `مقدرتش ألغي "${item.title}" — يمكن تكون اتلغت خلاص.`,
            ),
            actions: [],
            asking: false,
          };
        }

        return {
          reply: say(
            `Cancelled "${item.title}"${describeAt(item, zone)}.`,
            `تم إلغاء "${item.title}"${describeAt(item, zone)}.`,
          ),
          actions: [{ kind: `${item.kind}.cancelled`, id: item.id }],
          asking: false,
        };
      }

      case 'list': {
        /*
         * A missing `listKind` becomes the plan rather than a question, and
         * that is not FR-006 being bent.
         *
         * FR-006 is about anything *required* that would otherwise be guessed —
         * a value that gets stored, a choice that deletes something. A list is
         * a read: it stores nothing, and the widest honest answer to "what have
         * I got?" is their day. Asking "tasks or reminders?" before showing a
         * member their own day is a form standing between them and information
         * they can already see.
         */
        const kind: ListKind = intent.args.listKind ?? 'plan';
        if (kind === 'meetings' || kind === 'sessions') {
          return {
            reply: say(
              `I can't list ${kind} yet — that's coming in a later version.`,
              'لسه مش بقدر أعرض ده — الميزة دي جاية في نسخة قادمة.',
            ),
            actions: [],
            asking: false,
          };
        }

        const items = await this.planner.list(userId, kind, now);
        if (items.length === 0) {
          return {
            reply: say(
              'Nothing there at the moment.',
              'مفيش حاجة هنا في الوقت الحالي.',
            ),
            // The empty card still goes out. A client that renders one path for
            // a list must be told the list is empty, or it shows the previous
            // answer's card beside the words "nothing there".
            card: { kind, items },
            actions: [],
            asking: false,
          };
        }

        const shown = items.slice(0, 10);
        const lines = shown
          .map((item) => `- ${item.title}${item.at ? ` (${item.at})` : ''}`)
          .join('\n');
        const more = items.length - shown.length;

        return {
          // Words *and* a card — FR-016. The card is what a phone renders as a
          // tappable row; the words are what a client without cards, a screen
          // reader and the stored transcript all have.
          reply: say(
            `You have ${items.length}:\n${lines}` +
              (more > 0 ? `\n…and ${more} more.` : ''),
            `عندك ${items.length}:\n${lines}` +
              (more > 0 ? `\n…و${more} كمان.` : ''),
          ),
          card: { kind, items },
          actions: [],
          asking: false,
        };
      }

      case 'record_metric': {
        const metric = normaliseMetric(intent.args.metric);
        if (!metric) {
          return ask(
            say(
              'Is that your weight or your height?',
              'ده وزنك ولا طولك؟',
            ),
          );
        }
        if (intent.args.value === undefined) {
          return ask(
            say(
              metric === 'weightKg'
                ? 'What weight should I record?'
                : 'What height should I record?',
              metric === 'weightKg' ? 'أسجّل كام كيلو؟' : 'أسجّل كام سنتيمتر؟',
            ),
          );
        }

        const stored = await this.profile.recordMetric({
          userId,
          metric,
          value: intent.args.value,
          at: now,
        });

        // One line, and it names the stored number rather than the one that was
        // said — FR-015 and FR-004 are the same rule about two different
        // stores.
        const unit = metric === 'weightKg' ? 'kg' : 'cm';
        return {
          reply: say(
            `Recorded: ${stored.value} ${unit}.`,
            `تم التسجيل: ${stored.value} ${unit === 'kg' ? 'كجم' : 'سم'}.`,
          ),
          actions: [{ kind: 'metric.recorded' }],
          asking: false,
        };
      }

      case 'update_profile': {
        const { goal, foodLikes, foodDislikes, allergies, symptoms } = intent.args;
        if (!goal && !foodLikes && !foodDislikes && !allergies && !symptoms) {
          return ask(
            say(
              'What would you like me to remember about you?',
              'تحب أفتكر إيه عنك؟',
            ),
          );
        }

        const written = await this.profile.updateFacts({
          userId,
          goal,
          foodLikes,
          foodDislikes,
          allergies,
          symptoms,
        });

        if (written.length === 0) {
          return {
            reply: say(
              "I already had that, so there's nothing new to save.",
              'ده كان عندي بالفعل، فمفيش جديد أحفظه.',
            ),
            actions: [],
            asking: false,
          };
        }

        return {
          reply: say(
            `Noted — I've updated your ${listWords(written.map((field) => fieldName(field, false)), 'and')}.`,
            `تمام — حدّثت ${listWords(written.map((field) => fieldName(field, true)), 'و')}.`,
          ),
          actions: [{ kind: 'profile.updated' }],
          asking: false,
        };
      }
    }

    /*
     * Exhaustiveness, checked by the compiler rather than asserted in prose.
     *
     * `intent.name` is `never` here only while every member of `IntentName` has
     * a case above. Add a ninth name and this line stops compiling, in this
     * file, in the change that adds it — which is the whole reason there is no
     * `default` clause to fall into.
     */
    return unreachable(intent.name);
  }

  /** The question a moment that has already passed gets. */
  private pastQuestion(
    say: Phrasebook,
    at: Date,
    zone: string,
  ): string {
    return say(
      `That works out to ${formatInTz(at, zone)}, which has already passed — ` +
        'when did you mean?',
      `ده معناه ${formatInTz(at, zone)}، والوقت ده فات — قصدك امتى؟`,
    );
  }

  /** What a stored task's confirmation says, by what it actually has. */
  private taskConfirmation(
    say: Phrasebook,
    stored: CreatedItem,
    zone: string,
  ): string {
    if (!stored.at) {
      return say(
        `Added "${stored.title}" to your list.`,
        `أضفت "${stored.title}" لقائمتك.`,
      );
    }
    // An all-day item gets a date and no clock, because "00:00" is not a time
    // the member chose and reading it back to them invents a precision the row
    // does not have.
    const when = stored.allDay
      ? localDate(stored.at, zone)
      : formatInTz(stored.at, zone);
    return say(
      `Added "${stored.title}" for ${when}.`,
      `أضفت "${stored.title}" يوم ${when}.`,
    );
  }
}

// ------------------------------------------------------------------- helpers

type Phrasebook = (english: string, arabic: string) => string;

/**
 * Which language this turn is answered in.
 *
 * The member's own script first, their locale second. Script wins because it is
 * evidence from this turn rather than a setting from months ago: an account
 * created in English by somebody who then types Arabic is common, and the
 * reverse — an `ar` locale writing English — happens on a borrowed keyboard.
 * Both prompts tell the *model* to reply in the language it was written in, so
 * a templated confirmation that ignored the script would make the code path the
 * only rude one.
 */
function phrasebook(text: string, locale: string): Phrasebook {
  const arabic = /[؀-ۿ]/.test(text) || locale.toLowerCase().startsWith('ar');
  return (english, arabicText) => (arabic ? arabicText : english);
}

function ask(reply: string): ExecutionResult {
  // `asking` is the flag the turn branches on: a question means nothing was
  // stored and the member's next message is the answer to it.
  return { reply, actions: [], asking: true };
}

/** ", at Tue 2 Sep, 17:00" — or nothing, for an item with no time. */
function describeAt(item: CancellableItem, zone: string): string {
  return item.at ? ` (${formatInTz(item.at, zone)})` : '';
}

/**
 * The words in a `cancel` that are worth searching with, once the framing is
 * gone.
 *
 * Held in folded form because that is what they will be compared against, and
 * folding singularises — `reminders` is `reminder` by the time it gets here.
 */
const STOPWORDS = new Set(
  [
    'my',
    'the',
    'a',
    'an',
    'that',
    'this',
    'one',
    'for',
    'at',
    'on',
    'of',
    'reminder',
    'reminders',
    'task',
    'tasks',
    'todo',
    'alarm',
    'cancel',
    'delete',
    'remove',
    'تذكير',
    'التذكير',
    'مهمة',
    'المهمة',
    'بتاعي',
    'بتاعتي',
    'اللي',
    'ده',
    'دي',
    'الغي',
    'إلغاء',
    'امسح',
  ].map((word) => fold(word)),
);

/**
 * Which of the member's own open items their words could mean.
 *
 * A search over rows the member owns, case-folded and Arabic-folded through the
 * same `fold` the allergen guard uses — "الجيم" has to find a title stored as
 * "الجيم" however either was typed. **The model is never asked for an id**: it
 * would produce one that looks right and does not exist, and the failure would
 * be a cancellation of somebody's other row or a silent no-op.
 *
 * ponytail: token containment, no scoring and no fuzziness. "my 5pm reminder"
 * finds nothing unless the title carries the hour, because the times are not
 * compared — and the branch for that is already correct: nothing matched, so
 * the member is told so rather than something being deleted on a guess. Compare
 * `item.at` against a time in the match when members report the miss.
 */
function matching(items: CancellableItem[], match: string): CancellableItem[] {
  const tokens = fold(match)
    .split(' ')
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
  if (tokens.length === 0) return [];

  return items.filter((item) => {
    const title = ` ${fold(item.title)} `;
    return tokens.some((token) => title.includes(` ${token} `));
  });
}

/**
 * The two measurements `ProfileWritesPort` accepts, from whatever the model
 * called them.
 *
 * The narrowing lives here rather than in the extractor because the union is
 * this port's, and a third metric arriving in a later phase is a change to the
 * port and to this function together. Anything unrecognised returns null and
 * becomes a question — a member who said "my body fat is 18%" gets asked rather
 * than having it filed as a weight.
 */
function normaliseMetric(metric: string | undefined): 'weightKg' | 'heightCm' | null {
  if (!metric) return null;
  const folded = fold(metric);
  if (/(^|\s)(weightkg|weight|kg|kilo|kilogram|mass|وزن|الوزن)(\s|$)/.test(folded)) {
    return 'weightKg';
  }
  if (/(^|\s)(heightcm|height|cm|centimetre|centimeter|tall|طول|الطول)(\s|$)/.test(folded)) {
    return 'heightCm';
  }
  return null;
}

/** A profile field, as the member would name it. */
function fieldName(field: string, arabic: boolean): string {
  const names: Record<string, [string, string]> = {
    goal: ['goal', 'هدفك'],
    foodLikes: ['foods you like', 'الأكل اللي بتحبه'],
    foodDislikes: ["foods you'd rather avoid", 'الأكل اللي مش بتحبه'],
    allergies: ['allergies', 'الحساسية'],
    symptoms: ['symptoms', 'الأعراض'],
  };
  const pair = names[field];
  // An unmapped field is named as the port returned it rather than dropped: a
  // field added to `ProfileWritesPort` without a translation should read a
  // little raw for one release, not vanish from the confirmation the member
  // reads to check what was saved.
  if (!pair) return field;
  return arabic ? pair[1] : pair[0];
}

/** "a, b and c" — in either language's connector. */
function listWords(words: string[], connector: string): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} ${connector} ${words[words.length - 1]}`;
}

/** The compile-time exhaustiveness guard. Never runs. */
function unreachable(name: never): never {
  throw new Error(`unhandled intent name: ${String(name)}`);
}

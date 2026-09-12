import { Injectable, Logger } from '@nestjs/common';
import { formatInTz, localDate, wallClockToUtc } from '../../../shared/time/time.js';
import {
  IntentExecutorPort,
  MeetingActionsPort,
  PlannerActionsPort,
  ProfileWritesPort,
  NutritionActionsPort,
  TrainingActionsPort,
  type CancellableItem,
  type ChatTrainingSlot,
  type CreatedItem,
  type ExecutionResult,
  type MemberFacts,
} from '../domain/chat.ports.js';
import type { Intent, ListKind } from '../domain/intent.js';
import { mentionsAClock } from '../domain/relative-time.js';
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
 * `IntentName` has ten members and there are ten cases, with no `default`.
 * That is deliberate and it is checkable: an eleventh name added to the union
 * makes the exhaustiveness check at the bottom of `execute` a compile error, in
 * this file, in the same change. A `default` that returned a polite fallback
 * would make it a silent no-op that ships.
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
    private readonly meetings: MeetingActionsPort,
    private readonly training: TrainingActionsPort,
    private readonly nutrition: NutritionActionsPort,
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

      case 'set_meeting': {
        /*
         * Why the extractor produces this name at all — still the reason, and
         * still worth keeping now that it is carried out rather than declined.
         *
         * `intent.md` teaches the model to answer `set_meeting` for "schedule a
         * call with Sara at four" on purpose: the alternative is the model
         * filing it as a task, and the member discovering months later that
         * Botvy has been quietly turning their meetings into to-do items. A
         * meeting is not a to-do item — it occupies a stretch of the day, it
         * has a place, and somebody else is expecting them.
         */
        const title = intent.args.title;
        if (!title) {
          return ask(
            say('What is the meeting about?', 'الاجتماع بخصوص إيه؟'),
          );
        }

        const when = intent.args.when;
        if (!when) {
          // A meeting is a time in the same way a reminder is. There is no
          // sensible default and an invented hour is one the member finds out
          // about when somebody else is waiting.
          return ask(
            say('When is the meeting?', 'الاجتماع امتى؟'),
          );
        }

        const startAt = wallClockToUtc(when, zone);
        if (!startAt) {
          return ask(say('When is the meeting?', 'الاجتماع امتى؟'));
        }
        if (startAt.getTime() <= now.getTime()) {
          return ask(this.pastQuestion(say, startAt, zone));
        }

        /*
         * FR-001's rule, asked rather than guessed.
         *
         * At least one of a link and an address is required, and the aggregate
         * refuses a meeting with neither — so storing on a guess is not even
         * available. Asking is also the right answer on its own terms: a
         * meeting with no location is one the member cannot attend, and it is
         * the field a sentence most often leaves out.
         */
        const location = normaliseLocation(
          intent.args.onlineLink,
          intent.args.address,
        );
        if (!location) {
          return ask(
            say(
              `Where is "${title}" — do you have a link, or is it somewhere in person?`,
              `"${title}" فين — عندك لينك، ولا في مكان على الأرض؟`,
            ),
          );
        }

        const stored = await this.meetings.createMeeting({
          userId,
          title,
          startAt,
          ...(intent.args.durationMin !== undefined
            ? { durationMin: intent.args.durationMin }
            : {}),
          ...location,
        });

        if (!stored) {
          /*
           * Meetings refused it on a rule of its own. Reported, never thrown:
           * a turn that raises here loses the member's sentence to a stack
           * trace, and the honest outcome is telling them nothing was saved so
           * they can say it differently.
           */
          this.logger.debug(`meeting "${title}" was refused by Meetings`);
          return {
            reply: say(
              `I couldn't save "${title}" — try telling me again with the time and where it is.`,
              `مقدرتش أحفظ "${title}" — قوللي تاني بالوقت والمكان.`,
            ),
            actions: [],
            asking: false,
          };
        }

        // `stored.at` and not `startAt`: a length or a moment Meetings clamped
        // is confirmed as it now is, which is the same rule as the reminder's.
        const at = stored.at ?? startAt;
        return {
          reply: say(
            `"${stored.title}" is in your calendar for ${formatInTz(at, zone)}.`,
            `"${stored.title}" اتحفظ في التقويم يوم ${formatInTz(at, zone)}.`,
          ),
          actions: [{ kind: 'meeting.created', id: stored.id }],
          asking: false,
        };
      }

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

        /*
         * Four kinds, four sources, and no refusal left.
         *
         * `meetings` and `sessions` shared one "coming in a later version" until
         * P5 built meetings, and the refusal was then narrowed to name only
         * training — because a capability that exists must not keep denying
         * itself out of a branch it shares. P6 built training, so the refusal
         * goes: the sibling of that rule is that a "not yet" outlives the
         * capability it was written about unless the phase that ships it deletes
         * the sentence.
         *
         * Both cross-context lists take a week. "What have I got" means the near
         * future — a month of a daily meeting series would fill the card with
         * one meeting said thirty times, and sessions exist only as far ahead as
         * `training.materialiseDays` has materialised them, so asking further is
         * asking for rows that are not there yet. The card is capped at ten
         * below in any case.
         */
        const items =
          kind === 'meetings'
            ? await this.meetings.listUpcoming(userId, now, 7)
            : kind === 'sessions'
              ? await this.training.listUpcoming(userId, now, 7)
              : await this.planner.list(userId, kind, now);
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

      case 'set_slots': {
        /*
         * "gym Monday and Wednesday at six" — a weekly rule, not a session.
         *
         * The three fields a slot cannot be invented without are a sport, at
         * least one weekday and a start time, and every one of them is a
         * question rather than a guess (FR-006). A guessed *day* is the worst
         * of the three: the materialiser turns a slot into a fortnight of
         * sessions, so one wrong weekday is fourteen days of alarms at an hour
         * the member never chose, and they find out by being reminded to train
         * on a day they do not.
         */
        const sport = intent.args.sport?.trim();
        if (!sport) {
          return ask(
            say('Which sport is that for?', 'ده لأي رياضة؟'),
          );
        }

        const weekdays = intent.args.weekdays ?? [];
        if (weekdays.length === 0) {
          return ask(
            say(
              `Which days do you do ${sport}?`,
              `بتعمل ${sport} أي أيام؟`,
            ),
          );
        }

        const start = slotStart(intent.args.when, intent.args.allDay, text);
        if (!start) {
          return ask(
            say(
              `What time do you start ${sport}?`,
              `بتبدأ ${sport} الساعة كام؟`,
            ),
          );
        }

        /*
         * The member's week, merged rather than replaced — and this is the
         * decision in this branch worth arguing.
         *
         * `AthleteProfile.setSlots` replaces the whole timetable, because that
         * is how the editor works: the member arranges their week and saves it.
         * A sentence is not the editor. "Gym Monday and Wednesday at six" names
         * two days of one sport and says **nothing** about the swimming on
         * Sunday or the gym on Friday, so writing the sentence over the
         * timetable would delete slots the member never mentioned — and with
         * them, per the materialiser's reconcile, every future session those
         * slots had produced. That is the invention FR-006 exists to refuse,
         * wearing a deletion.
         *
         * So the rule is: **replace only (this sport, a named day), keep
         * everything else.** A named day the member already had is re-timed and
         * *keeps its id*, which is what keeps its future sessions — the
         * reconcile matches on the id, so a new id for the same Monday would
         * throw the week away and rebuild it. A named day they did not have
         * becomes a new slot. Friday's gym and Sunday's swimming are untouched,
         * because nothing in the sentence was about them.
         *
         * Dropping a slot stays the editor's job, and that asymmetry is
         * deliberate: adding by sentence is cheap to undo and deleting by
         * sentence is not.
         */
        const week = await this.training.week(userId);
        const named = new Set(weekdays);
        const mine = week.filter((slot) => sameSport(slot.sport, sport));
        const kept = new Map(mine.map((slot) => [slot.weekday, slot]));

        /*
         * A slot needs a length and there is no installation default for one —
         * `defaults.meetingDurationMin` has no training sibling in the registry
         * — so the length comes from the member's own week, and when their week
         * cannot answer they are asked.
         *
         * A hard-coded sixty here would be the bug constitution III names, and
         * it would be stored: a member whose sessions are all ninety minutes
         * would find every slot they set by sentence an hour short. The
         * question is asked once per sport, because the next sentence about the
         * same sport inherits the length from the slot this one created.
         *
         * ponytail: a `defaults.sessionDurationMin` registry key would remove
         * the question for a member's first sport. It is a settings change and
         * belongs with whoever owns the registry, not here.
         */
        const template =
          weekdays.map((day) => kept.get(day)).find((slot) => slot) ?? mine[0];
        const durationMin = intent.args.durationMin ?? template?.durationMin;
        if (durationMin === undefined) {
          return ask(
            say(
              `How long is each ${sport} session?`,
              `الحصة الواحدة من ${sport} مدتها قد إيه؟`,
            ),
          );
        }

        const merged: ChatTrainingSlot[] = [
          ...week.filter(
            (slot) => !(sameSport(slot.sport, sport) && named.has(slot.weekday)),
          ),
          ...weekdays.map((weekday) => {
            const existing = kept.get(weekday);
            return {
              // A new slot carries no id; the adapter mints one. See the port.
              ...(existing?.id ? { id: existing.id } : {}),
              weekday,
              start,
              durationMin,
              // Their own capitalisation, when they have already stored this
              // sport: a member with "CrossFit" in their week said "crossfit"
              // this time and did not ask for it to be renamed.
              sport: template?.sport ?? sport,
              location: existing?.location ?? template?.location ?? null,
            };
          }),
        ];

        const stored = await this.training.setSlots(userId, merged);
        if (!stored) {
          // Training refused it on a rule of its own — forty-one slots, or a
          // length past its six-hour ceiling. Reported rather than thrown, for
          // the reason the meeting branch gives. The adapter logs the code.
          this.logger.debug(`slots for "${sport}" were refused by Training`);
          return {
            reply: say(
              `I couldn't save your ${sport} week — try telling me again with the day and the time.`,
              `مقدرتش أحفظ أسبوع ${sport} — قوللي تاني باليوم والساعة.`,
            ),
            actions: [],
            asking: false,
          };
        }

        /*
         * The confirmation is rendered from what came back, never from the
         * sentence (FR-004).
         *
         * Which matters here more than anywhere else in this file, because the
         * write is a *replace*: the member needs to read back the days that are
         * now in their week for this sport, including a day they set weeks ago
         * and did not mention. That is also the cheapest possible check on the
         * merge above — if it had eaten Friday, the reply would say so.
         */
        const forSport = stored
          .filter((slot) => sameSport(slot.sport, sport))
          .sort((a, b) => a.weekday - b.weekday);
        const shown = forSport[0]?.sport ?? sport;
        const days = (arabic: boolean): string =>
          listWords(
            forSport.map(
              (slot) => `${weekdayName(slot.weekday, arabic)} ${slot.start}`,
            ),
            arabic ? 'و' : 'and',
          );

        return {
          reply: say(
            `${shown} is set for ${days(false)} — ${durationMin} minutes each.`,
            `${shown} اتظبط ${days(true)} — ${durationMin} دقيقة للحصة.`,
          ),
          actions: [{ kind: 'slots.updated' }],
          asking: false,
        };
      }

      case 'log_session': {
        /*
         * "I trained legs today" — and what this branch decided to do about it.
         *
         * ## It completes today's session; it never logs sets
         *
         * `Session.log(exerciseId, sets)` is the verb that records what was
         * done, and a sentence cannot reach it: it needs an exercise id and a
         * list of sets, and the member gave neither. Inventing an exercise
         * called "legs" with three sets of nothing would be FR-006's failure at
         * its most expensive — a fabricated record of the member's own training
         * that they would have to find and delete. So the chat does the one
         * thing the sentence actually asserts, which is that the session
         * happened: it completes it, and keeps their own words as its note.
         *
         * The set logger lives on the phone, where the numbers are.
         *
         * ## It never creates a session
         *
         * A session carries a time, a length, a sport and a title. "I trained
         * today" carries none of them, so a created session would be four
         * invented fields wearing one true statement — and it would raise
         * `SessionScheduled`, which plans an alert for a practice that has
         * already happened. With nothing scheduled today the honest answer is
         * to say so.
         *
         * ## What the member is told (FR-004)
         *
         * The title of the session that was completed and the note that was
         * stored, both read back from what the store returned. Two sessions
         * today is a question and never a guess, for the same reason two
         * matches for a `cancel` is: marking the wrong one done leaves the real
         * one looking undone, which is two wrong facts from one turn.
         */
        const todays = await this.training.todaysSessions(userId, now);
        if (todays.length === 0) {
          return {
            reply: say(
              "You have no training scheduled today, so there's nothing for me to mark done — add the session and I'll log it.",
              'مفيش تمرين متسجّل ليك النهاردة، فمفيش حاجة أعلّمها إنها اتعملت — ضيف الحصة وأنا هسجّلها.',
            ),
            actions: [],
            asking: false,
          };
        }

        const open = todays.filter((session) => session.status === 'planned');
        if (open.length === 0) {
          // Everything today has already been dealt with. Named rather than
          // silently re-completed: a session the member skipped and now says
          // they did is a correction, and a correction they can see is one they
          // can make properly in the app.
          const settled = todays[todays.length - 1]!;
          return {
            reply: say(
              `"${settled.title}" today is already recorded as ${statusWord(settled.status, false)}, so I've left it as it is.`,
              `"${settled.title}" النهاردة متسجّلة ${statusWord(settled.status, true)} بالفعل، فسيبتها زي ما هي.`,
            ),
            actions: [],
            asking: false,
          };
        }

        if (open.length > 1) {
          const listed = open
            .map((session) => `- ${session.title} (${formatInTz(session.at, zone)})`)
            .join('\n');
          return ask(
            say(
              `You have ${open.length} sessions today — which one did you do?\n${listed}`,
              `عندك ${open.length} حصص النهاردة — أنهي واحدة عملتها؟\n${listed}`,
            ),
          );
        }

        // `notes` first and `title` second, the same fallback the `cancel`
        // branch uses for `match`: the two are one field apart in the schema
        // and a model puts "legs" in either.
        const note = intent.args.notes ?? intent.args.title;
        const logged = await this.training.completeSession(
          userId,
          open[0]!.id,
          note,
        );
        if (!logged) {
          this.logger.debug(`completing session ${open[0]!.id} was refused`);
          return {
            reply: say(
              `I couldn't log "${open[0]!.title}" — it may already have changed on another device.`,
              `مقدرتش أسجّل "${open[0]!.title}" — يمكن اتغيّرت من جهاز تاني.`,
            ),
            actions: [],
            asking: false,
          };
        }

        const noted = note
          ? say(` I've noted "${note}".`, ` وكتبت "${note}".`)
          : '';
        return {
          reply:
            say(
              `Logged "${logged.title}" as done for today.`,
              `سجّلت "${logged.title}" إنها اتعملت النهاردة.`,
            ) + noted,
          actions: [{ kind: 'session.completed', id: logged.id }],
          asking: false,
        };
      }
      case 'add_meal': {
        /*
         * "Add grilled chicken to my meals" (P8's FR-012).
         *
         * ## It goes through the same command the editor uses
         *
         * `NutritionActionsPort` is bound to Nutrition's `add-meal` handler
         * rather than opening a second way into the collection — a second write
         * path is how one of them comes to skip a rule the other enforces.
         *
         * ## No kind, no ingredients, and that is the honest reading
         *
         * The sentence names a dish. It does not say whether it is lunch or
         * dinner, and the command's default — `any`, eligible for every slot —
         * is the right answer rather than a fallback: a member who says they
         * eat koshari has not said when. Ingredients are the same: inventing
         * them would be inventing the input to the **allergen gate**, which is
         * the one place in this product where a fabricated field can hurt
         * somebody. The member adds them on the screen that asks.
         */
        const name = intent.args.title?.trim();
        if (!name) {
          return ask(
            say(
              'What should I add to your meals?',
              'أضيف إيه لقائمة أكلك؟',
            ),
          );
        }

        const added = await this.nutrition.addMeal({ userId, name });
        if (added.alreadyThere) {
          // The handler's own replay answer. Saying "added" for a meal that was
          // already there leaves the member with one row and two facts, one of
          // which is wrong.
          return {
            reply: say(
              `"${added.name}" is already on your list.`,
              `"${added.name}" موجودة في قائمتك بالفعل.`,
            ),
            actions: [],
            asking: false,
          };
        }

        return {
          reply: say(
            `Added "${added.name}" to your meals. It can show up in any part of the day — set it to breakfast or dinner on the Nutrition screen if it belongs to one.`,
            `ضفت "${added.name}" لقائمة أكلك. ممكن تظهر في أي وقت من اليوم — لو مخصوصة لوجبة معينة اظبطها من شاشة الأكل.`,
          ),
          actions: [{ kind: 'meal.added', id: added.id }],
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
 * Which half of a location the model actually filled, whatever it called it.
 *
 * The grammar cannot help here — a link is a string and so is a street — so
 * this is the normalisation the enum does for `metric`. Two failures are worth
 * correcting rather than refusing:
 *
 * - a *link* in `address` ("zoom.us/j/123"), which is a location and belongs in
 *   the field the client renders as tappable;
 * - a *place* in `onlineLink` ("meeting room 2"), which is a location too and
 *   would otherwise be stored as a link nobody can open.
 *
 * `null` only when both are genuinely empty, which is the case FR-001 makes the
 * executor ask about. Anything with a scheme, a `www.`, or a dot with no space
 * around it is treated as a link; everything else is an address.
 */
function normaliseLocation(
  onlineLink: string | undefined,
  address: string | undefined,
): { onlineLink?: string; address?: string } | null {
  const link = onlineLink?.trim();
  const place = address?.trim();
  const linkish = (value: string): boolean =>
    /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ||
    /^www\./i.test(value) ||
    /^\S+\.[a-z]{2,}(\/|$)/i.test(value);

  const parts: { onlineLink?: string; address?: string } = {};
  for (const value of [link, place]) {
    if (!value) continue;
    if (linkish(value)) parts.onlineLink ??= value;
    else parts.address ??= value;
  }
  return parts.onlineLink || parts.address ? parts : null;
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

/**
 * The `HH:mm` a slot starts at, out of the wall clock the pipeline resolved.
 *
 * `args.when` is reused rather than a `start` field of its own, and that is the
 * point: every time-carrying intent goes through `relative-time.ts` and its
 * `mentionsAMoment` guard, so "at six" is read the way a person reads it and a
 * clock the model supplied for a sentence naming no moment has already been
 * dropped before it reaches here. A second time field would be a second path,
 * one guard short.
 *
 * The *date* half is discarded, because a slot is weekly: the model writes some
 * plausible date beside the hour and the weekdays are the member's own answer.
 *
 * Midnight and `allDay` are both refused. A model writes `T00:00` for a
 * sentence that named a day and no hour, so accepting it would set a slot at
 * midnight — a training week nobody asked for, materialised a fortnight ahead.
 * One question is cheaper.
 *
 * **And the wider guard is not enough for this intent**, which is why the
 * member's own text is passed in and asked a narrower question.
 * `mentionsAMoment` is satisfied by the weekday a slot sentence must contain —
 * "I do football on Fridays" names a moment — so a clock the model invented
 * alongside it survives the extractor, and `T00:00` is the only shape caught by
 * the check above. For a reminder that would be one wrong alarm; for a *slot*
 * it is a fortnight of them, materialised ahead, at an hour nobody chose. So
 * `mentionsAClock` — the same vocabulary's clock half, exported rather than
 * copied — has the final say, and a sentence naming a day but no hour asks
 * instead of guessing.
 */
function slotStart(
  when: string | undefined,
  allDay: boolean | undefined,
  text: string,
): string | null {
  if (!when || allDay === true) return null;
  if (!mentionsAClock(text)) return null;
  const match = /T(\d{2}:\d{2})$/.exec(when);
  if (!match?.[1] || match[1] === '00:00') return null;
  return match[1];
}

/**
 * Whether two sport names are the same sport.
 *
 * Through the same `fold` the allergen guard and the cancel search use, which
 * matters in both languages: it strips the Arabic definite article, so a member
 * who stored "جيم" and typed "الجيم" is talking about one sport rather than
 * two, and it folds case so "CrossFit" and "crossfit" are one as well. Without
 * it the merge below would leave a member with two gym slots on the same
 * Monday, one of them the old time.
 */
function sameSport(left: string, right: string): boolean {
  return fold(left) === fold(right);
}

/**
 * 1 is Monday and 7 is Sunday — ISO 8601, and `TrainingSlot.weekday`'s own
 * convention.
 *
 * Written out in both languages rather than taken from `Intl`, for one reason
 * worth the fifteen lines: `Intl` needs a date to name a weekday, and building
 * one from an index is where the 0-is-Sunday confusion gets in. A table indexed
 * by the number the store holds cannot be off by one without being visibly
 * wrong.
 */
const WEEKDAYS: Array<[string, string]> = [
  ['Mon', 'الاثنين'],
  ['Tue', 'الثلاثاء'],
  ['Wed', 'الأربعاء'],
  ['Thu', 'الخميس'],
  ['Fri', 'الجمعة'],
  ['Sat', 'السبت'],
  ['Sun', 'الأحد'],
];

function weekdayName(weekday: number, arabic: boolean): string {
  const pair = WEEKDAYS[weekday - 1];
  // Unreachable while the schema bounds `weekdays` to 1..7 and the extractor
  // drops anything outside it. The number rather than a crash, because a
  // confirmation is not the place to throw.
  if (!pair) return String(weekday);
  return arabic ? pair[1] : pair[0];
}

/**
 * A session's status, as the member would read it.
 *
 * Training's four words, translated for the one sentence that has to name one.
 * An unmapped status falls back to the raw word for the reason `fieldName`
 * does: a fifth status added in a later phase should read a little raw for one
 * release rather than vanish from the sentence telling the member what is on
 * their record.
 */
function statusWord(status: string, arabic: boolean): string {
  const words: Record<string, [string, string]> = {
    planned: ['planned', 'مخططة'],
    completed: ['done', 'اتعملت'],
    cancelled: ['cancelled', 'اتلغت'],
    skipped: ['skipped', 'اتخطيتها'],
  };
  const pair = words[status];
  if (!pair) return status;
  return arabic ? pair[1] : pair[0];
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

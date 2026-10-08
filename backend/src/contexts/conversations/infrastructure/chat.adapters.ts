import { Injectable, Logger } from '@nestjs/common';
import { newId } from '../../../shared/cqrs/ids.js';
import { MemberContextPort } from '../../../shared/member/member-context.port.js';
import {
  localDate,
  localHhMm,
  wallClockToUtc,
} from '../../../shared/time/time.js';
import { MeetingQueryHandler } from '../../meetings/features/meeting/meeting.query.js';
import { MeetingOccurrencesQueryHandler } from '../../meetings/features/meeting-occurrences/meeting-occurrences.query.js';
import { CreateMeetingHandler } from '../../meetings/features/create-meeting/create-meeting.handler.js';
import { CancelTaskHandler } from '../../planning/features/cancel-task/cancel-task.handler.js';
import { CompleteTaskHandler } from '../../planning/features/complete-task/complete-task.handler.js';
import { DeleteTaskHandler } from '../../planning/features/delete-task/delete-task.handler.js';
import { UpdateTaskHandler } from '../../planning/features/update-task/update-task.handler.js';
import { CancelMeetingHandler } from '../../meetings/features/cancel-meeting/cancel-meeting.handler.js';
import { CompleteMeetingHandler } from '../../meetings/features/complete-meeting/complete-meeting.handler.js';
import { DeleteMeetingHandler } from '../../meetings/features/delete-meeting/delete-meeting.handler.js';
import { MoveMeetingOccurrenceHandler } from '../../meetings/features/move-occurrence/move-occurrence.handler.js';
import { SkipMeetingOccurrenceHandler } from '../../meetings/features/skip-occurrence/skip-occurrence.handler.js';
import { UpdateMeetingHandler } from '../../meetings/features/update-meeting/update-meeting.handler.js';
import { CancelSessionHandler } from '../../training/features/cancel-session/cancel-session.handler.js';
import { DeleteSessionHandler } from '../../training/features/delete-session/delete-session.handler.js';
import { MealsQueryHandler } from '../../nutrition/features/meals/meals.query.js';
import { ReplaceTodayMealHandler } from '../../nutrition/features/replace-today-meal/replace-today-meal.handler.js';
import { CreateTaskHandler } from '../../planning/features/create-task/create-task.handler.js';
import { TasksQueryHandler } from '../../planning/features/tasks-query/tasks.query.js';
import { ManageReminderHandler } from '../../reminders/features/manage-reminder/manage-reminder.handler.js';
import { ReminderLifecycleHandler } from '../../reminders/features/reminder-lifecycle/reminder-lifecycle.handler.js';
import { RemindersQueryHandler } from '../../reminders/features/reminders-query/reminders.query.js';
import {
  AddMealHandler,
  DeleteMealHandler,
} from '../../nutrition/features/add-meal/add-meal.handler.js';
import { ProfileQueryHandler } from '../../profile/features/profile-query/profile.query.js';
import { UpdateProfileHandler } from '../../profile/features/update-profile/update-profile.handler.js';
import { AthleteProfileQueryHandler } from '../../training/features/athlete-profile/athlete-profile.query.js';
import { CompleteSessionHandler } from '../../training/features/complete-session/complete-session.handler.js';
import { LogSessionHandler } from '../../training/features/log-session/log-session.handler.js';
import { SessionQueryHandler } from '../../training/features/session/session.query.js';
import { SessionsQueryHandler } from '../../training/features/sessions/sessions.query.js';
import { SetSlotsHandler } from '../../training/features/set-slots/set-slots.handler.js';
import { TrainingSummaryQueryHandler } from '../../training/features/training-summary/training-summary.query.js';
import {
  SessionNotFound,
  UpdateSessionHandler,
} from '../../training/features/update-session/update-session.handler.js';
import { StreakQueryHandler } from '../../rhythm/features/streak/streak.query.js';
import { TodayPlanQueryHandler } from '../../rhythm/features/today-plan/today-plan.query.js';
import { CaptureCheckinReplyHandler } from '../../rhythm/features/capture-checkin-reply/capture-checkin-reply.handler.js';
import { CheckinsQueryHandler } from '../../rhythm/features/checkins/checkins.query.js';
import { UsageTodayQueryHandler } from '../../operations/features/usage-today/usage-today.query.js';
import {
  ChatItemsPort,
  CheckinPort,
  LatestCheckinPort,
  MeetingActionsPort,
  MemberAgendaPort,
  MemberDayPort,
  MemberFactsPort,
  NutritionActionsPort,
  PlannerActionsPort,
  ProfileWritesPort,
  TrainingActionsPort,
  TrainingSummaryPort,
  UsagePort,
  type CardItem,
  type ChatAction,
  type ItemChange,
  type TargetItem,
  type ChatTrainingSlot,
  type CheckinCapture,
  type CreatedItem,
  type MemberAgenda,
  type MemberDay,
  type MemberFacts,
  type TrainingSessionRef,
} from '../domain/chat.ports.js';
import type { ChatTarget } from '../domain/intent.js';
import { fold } from '../application/allergen-guard.js';

/**
 * Where the chat learns about the rest of the platform.
 *
 * Every class here binds a port declared in `../domain/chat.ports.ts` to
 * another context's published handler. This is the one layer constitution IX
 * lets know another context exists, and it is the reason nothing under
 * `domain/`, `application/` or `features/` imports across — `no-restricted-imports`
 * refuses it there and permits it here.
 *
 * The imports at the top of this file are the *whole* of what the chat knows
 * about the platform. That is the point of collecting them in one file rather
 * than one file per port: a reviewer can see the entire coupling surface of the
 * most connected context in the system on one screen, and a new import here is
 * a visible decision rather than a line buried in a directory of adapters.
 *
 * `contexts/operations/infrastructure/admin-device.lookup.ts` is the pattern
 * these follow.
 */

/** Profile answers who the member is. */
@Injectable()
export class ProfileMemberFacts extends MemberFactsPort {
  constructor(private readonly profiles: ProfileQueryHandler) {
    super();
  }

  async forMember(userId: string): Promise<MemberFacts> {
    const [profile, summary] = await Promise.all([
      this.profiles.profile(userId),
      this.profiles.summary(userId),
    ]);

    /*
     * The fallback is a member mid-bootstrap, not an error.
     *
     * `bootstrap-on-registered` reacts to `identity.UserRegistered` through the
     * relay, which is at-least-once and *eventual*: for a second or two after
     * registration there is no profile row. A member who opens the chat in
     * that window should get an answer in a sensible zone, not a crash — and
     * the installation default is what the bootstrap is about to write anyway.
     *
     * `allergies` defaults to empty and that is the one field where an empty
     * default is dangerous rather than merely thin: it means the guard has
     * nothing to check against. It is correct here because a member with no
     * profile has declared no allergies — there is nothing to be wrong about
     * yet — but a future change that made this return a *stale* empty list
     * would silently disarm FR-018.
     */
    return {
      timezone: profile?.timezone ?? 'Africa/Cairo',
      locale: profile?.locale ?? 'en',
      summary,
      allergies: profile?.allergies ?? [],
    };
  }
}

/** The rhythm answers what today holds. */
@Injectable()
export class RhythmMemberDay extends MemberDayPort {
  constructor(
    private readonly plans: TodayPlanQueryHandler,
    private readonly streaks: StreakQueryHandler,
    private readonly profiles: ProfileQueryHandler,
    /**
     * Training's own account of the week, which replaces what the plan
     * snapshot could say about it (T661, FR-017).
     *
     * The rhythm's `plan.training` is the evening's *snapshot* of what today
     * was going to hold, which is the right thing for the Home card and the
     * wrong thing for a coach: it names one session and knows nothing about the
     * sports, the focus, or whether the member has trained at all this month.
     * It is also a day old by the time the coach is asked anything, so a
     * session completed or skipped since is still in it.
     */
    private readonly training: TrainingSummaryPort,
  ) {
    super();
  }

  async forMember(userId: string, now: Date): Promise<MemberDay> {
    const profile = await this.profiles.profile(userId);
    const timezone = profile?.timezone ?? 'Africa/Cairo';
    const today = localDate(now, timezone);

    const [plan, streak, trainingLine] = await Promise.all([
      this.plans.handle(userId, today),
      this.streaks.handle(userId, now),
      this.training.lineFor(userId, now),
    ]);

    return {
      tasks: plan.tasks.map((task) => {
        const at = task.dueAt
          ? localHhMm(new Date(task.dueAt), timezone)
          : null;
        // The time is rendered here, in the member's zone, because this string
        // goes straight into a prompt — and a model handed a UTC timestamp
        // will happily quote it back at them.
        return `P${task.priority} ${task.title}${at && at !== '00:00' ? ` at ${at}` : ''}`;
      }),
      trainingLine,
      mealLine: plan.mealLine ?? null,
      mealReason: plan.mealReason ?? null,
      streakCurrent: streak.current,
      streakBest: streak.best,
      today,
    };
  }
}

/**
 * What is coming up across the platform, for the prompt's `<now>` block (032).
 *
 * Five published queries and no repository — the rule every adapter in this
 * file follows. Each line is rendered here, in the member's zone, with the
 * weekday and the date, because "Thursday" is how the member will ask and a
 * model handed only a date has to work the weekday out, which a 3B model gets
 * wrong.
 *
 * The windows are fixed by the question each section answers — tasks due in
 * the next three days, reminders in the next two, meetings and sessions in the
 * next week — and the *count* is the operator's (`chat.readViewItems`), because
 * the count is what costs prompt-reading time.
 */
@Injectable()
export class PlatformAgenda extends MemberAgendaPort {
  constructor(
    private readonly tasks: TasksQueryHandler,
    private readonly reminders: RemindersQueryHandler,
    private readonly occurrences: MeetingOccurrencesQueryHandler,
    private readonly sessions: SessionsQueryHandler,
    private readonly athletes: AthleteProfileQueryHandler,
    private readonly member: MemberContextPort,
  ) {
    super();
  }

  async forMember(
    userId: string,
    now: Date,
    limit: number,
  ): Promise<MemberAgenda> {
    const empty: MemberAgenda = {
      overdueTasks: [],
      upcomingTasks: [],
      reminders: [],
      meetings: [],
      sessions: [],
      slots: [],
    };
    if (limit <= 0) return empty;

    const { timezone } = await this.member.clock(userId);
    const day = 86_400_000;
    const [overdue, upcoming, reminders, meetings, sessions, profile] =
      await Promise.all([
        this.tasks.page(userId, { view: 'overdue', limit }, now),
        this.tasks.page(userId, { view: 'upcoming', limit: limit * 2 }, now),
        this.reminders.page(
          userId,
          { view: 'upcoming', limit: limit * 2 },
          now,
        ),
        this.occurrences.forMember(
          userId,
          now,
          new Date(now.getTime() + 7 * day),
        ),
        this.sessions.between(
          userId,
          now,
          new Date(now.getTime() + 7 * day),
          now,
        ),
        this.athletes.handle(userId),
      ]);

    const when = (at: Date, allDay = false): string =>
      allDay
        ? dayName(at, timezone)
        : `${dayName(at, timezone)} ${localHhMm(at, timezone)}`;
    const within = (at: Date | null, days: number): boolean =>
      at !== null && at.getTime() <= now.getTime() + days * day;

    return {
      overdueTasks: overdue.nodes
        .slice(0, limit)
        .map(
          (task) => `${task.title} (was due ${when(task.dueAt!, task.allDay)})`,
        ),
      upcomingTasks: upcoming.nodes
        .filter((task) => within(task.dueAt, 3))
        .slice(0, limit)
        .map((task) => `${when(task.dueAt!, task.allDay)} ${task.title}`),
      reminders: reminders.nodes
        .filter((reminder) => within(reminder.effectiveAt, 2))
        .slice(0, limit)
        .map((reminder) => `${when(reminder.effectiveAt!)} ${reminder.title}`),
      meetings: meetings.slice(0, limit).map((occurrence) => {
        const where = occurrence.location.address
          ? ` at ${occurrence.location.address}`
          : occurrence.location.onlineLink
            ? ' (online)'
            : '';
        return `${when(occurrence.startAt)} ${occurrence.title}, ${occurrence.durationMin} min${where}`;
      }),
      sessions: sessions
        .filter((session) => session.status === 'planned')
        .slice(0, limit)
        .map(
          (session) =>
            `${when(session.plannedAt)} ${session.title} (${session.sport})`,
        ),
      slots: [...profile.slots]
        .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start))
        .map(
          (slot) =>
            `${WEEKDAY_NAMES[slot.weekday - 1] ?? slot.weekday} ${slot.start} ${slot.sport}, ${slot.durationMin} min`,
        ),
    };
  }
}

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Thu 15 Oct" in the member's zone. */
function dayName(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(at);
}

/**
 * Training answers what the member's week of practice looks like (FR-017).
 *
 * A one-line adapter over a `*.query.ts` handler, which is the point: the
 * sentence itself is composed in Training, where the sports, the sessions and
 * the streak live, so the coach and every later reader of the same fact describe
 * a training week identically. Composing it here would put Training's vocabulary
 * in Conversations and give the next caller a reason to write a second version.
 */
@Injectable()
export class TrainingWeekSummary extends TrainingSummaryPort {
  constructor(private readonly training: TrainingSummaryQueryHandler) {
    super();
  }

  async lineFor(userId: string, now: Date): Promise<string> {
    return this.training.summary(userId, now);
  }
}

/**
 * Planning and Reminders perform the planner's writes.
 *
 * Every method returns what was **stored**, which is what makes FR-004's
 * confirmation honest: a title the aggregate trimmed or a moment it clamped
 * must be confirmed as it is, or the member is told something untrue about
 * their own list. That is why `createTask` reads the id back rather than
 * echoing the one it minted.
 */
@Injectable()
export class PlanningReminderActions extends PlannerActionsPort {
  constructor(
    private readonly tasks: CreateTaskHandler,
    private readonly taskQueries: TasksQueryHandler,
    private readonly reminders: ManageReminderHandler,
    private readonly reminderQueries: RemindersQueryHandler,
  ) {
    super();
  }

  async createTask(input: {
    userId: string;
    title: string;
    dueAt: Date | null;
    allDay: boolean;
    priority?: number;
    labelName?: string;
    notes?: string;
  }): Promise<CreatedItem> {
    /*
     * The chat mints the id, because Planning's create is idempotent on it.
     *
     * That looks odd for a server-side caller — client-minted ids are for the
     * phone — and it is right: an offline batch can be flushed twice, and the
     * second flush must not create a second task. A server-minted id would
     * make a retried flush two tasks with one title, which is exactly the
     * failure the UUIDv7 rule exists to prevent.
     */
    const id = newId();
    await this.tasks.handle(input.userId, {
      id,
      title: input.title,
      dueAt: input.dueAt,
      allDay: input.allDay,
      ...(input.priority ? { priority: input.priority as 1 | 2 | 3 | 4 } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      source: 'chat',
    });

    const stored = await this.taskQueries.byId(input.userId, id);
    return {
      id,
      title: stored?.title ?? input.title,
      at: stored?.dueAt ?? input.dueAt,
      allDay: stored?.allDay ?? input.allDay,
      ...(stored?.priority ? { priority: stored.priority } : {}),
    };
  }

  async createReminder(input: {
    userId: string;
    title: string;
    remindAt: Date;
    leadTimes?: string[];
  }): Promise<CreatedItem> {
    const id = newId();
    await this.reminders.create(input.userId, {
      id,
      title: input.title,
      remindAt: input.remindAt,
      ...(input.leadTimes ? { leadTimes: input.leadTimes } : {}),
      source: 'chat',
    });

    const stored = await this.reminderQueries.byId(input.userId, id);
    return {
      id,
      title: stored?.title ?? input.title,
      at: stored?.effectiveAt ?? input.remindAt,
      allDay: false,
    };
  }

  async list(
    userId: string,
    kind: 'tasks' | 'reminders' | 'plan',
    now: Date,
  ): Promise<CardItem[]> {
    if (kind === 'reminders') {
      const page = await this.reminderQueries.page(
        userId,
        { view: 'upcoming', limit: 20 },
        now,
      );
      return page.nodes.map((reminder) => ({
        id: reminder.id,
        title: reminder.title,
        at: reminder.effectiveAt?.toISOString() ?? null,
        status: reminder.status,
        deepLink: `botvy://reminders/${reminder.id}`,
      }));
    }

    // `plan` and `tasks` both answer with today's list. They differ on the
    // phone — the plan card shows the ring and the training slot — and here
    // they are the same rows, which is why `plan` is not a third branch that
    // could disagree with `tasks` about what today holds.
    const page = await this.taskQueries.page(
      userId,
      { view: 'today', limit: 20 },
      now,
    );
    return page.nodes.map((task) => ({
      id: task.id,
      title: task.title,
      at: task.dueAt?.toISOString() ?? null,
      ...(task.priority ? { priority: task.priority } : {}),
      status: task.status,
      deepLink: `botvy://tasks/${task.id}`,
    }));
  }
}

/**
 * Meetings creates the meeting a member asks for in the chat.
 *
 * The same shape as `PlanningReminderActions.createReminder`, and for the same
 * three reasons.
 *
 * **The chat mints the id.** `CreateMeetingHandler` is idempotent on it and
 * refuses anything that is not a UUID, so a retried offline batch flush is one
 * meeting rather than two — the failure the client-minted-id rule exists to
 * prevent, reachable from a server-side caller because a batch can be flushed
 * twice.
 *
 * **It reads back what was stored.** FR-004's confirmation has to name the
 * values the store actually holds: a title the aggregate trimmed or a duration
 * it clamped is confirmed as it now is. `startAt` comes back from the row and
 * not from the command.
 *
 * **A domain refusal becomes `null`.** `MeetingRuleError` is Meetings'
 * vocabulary and `chat.ports.ts` may not import its union of codes, so the code
 * is logged here and the executor tells the member nothing was saved. Anything
 * that is not a rule refusal is rethrown: a store that is down is not a
 * sentence the member typed wrongly, and swallowing it would confirm nothing
 * and report nothing.
 */
@Injectable()
export class MeetingsChatActions extends MeetingActionsPort {
  private readonly logger = new Logger(MeetingsChatActions.name);

  constructor(
    private readonly meetings: CreateMeetingHandler,
    private readonly queries: MeetingQueryHandler,
    private readonly occurrences: MeetingOccurrencesQueryHandler,
    private readonly member: MemberContextPort,
  ) {
    super();
  }

  async createMeeting(input: {
    userId: string;
    title: string;
    startAt: Date;
    durationMin?: number;
    onlineLink?: string;
    address?: string;
  }): Promise<CreatedItem | null> {
    const id = newId();
    try {
      await this.meetings.handle(input.userId, {
        id,
        title: input.title,
        startAt: input.startAt,
        ...(input.durationMin !== undefined
          ? { durationMin: input.durationMin }
          : {}),
        location: {
          onlineLink: input.onlineLink ?? null,
          address: input.address ?? null,
        },
        source: 'chat',
      });
    } catch (error) {
      if ((error as Error).name !== 'MeetingRuleError') throw error;
      this.logger.debug(
        `Meetings refused a chat-created meeting: ${(error as Error).message}`,
      );
      return null;
    }

    const stored = await this.queries.byId(input.userId, id);
    return {
      id,
      title: stored?.title ?? input.title,
      at: stored?.startAt ?? input.startAt,
      // A meeting always occupies a stretch of the day (FR-001); a whole-day
      // entry is a personal event, which is not this port's business.
      allDay: false,
    };
  }

  /**
   * The member's next meetings, expanded from the rule.
   *
   * Through the published occurrence query, which is the same expansion the
   * calendar and the alert reconciliation read — so the chat cannot tell a
   * member about a meeting on a day their calendar does not show it.
   *
   * `at` is ISO-8601, as for tasks and reminders (032). It used to be a display
   * string meant to be rendered as given, and the phone — which parses `at` for
   * every kind — could not read it, so meeting cards showed no time. The
   * executor renders the words beside the card in the member's zone.
   */
  async listUpcoming(
    userId: string,
    now: Date,
    days: number,
  ): Promise<CardItem[]> {
    const to = new Date(now.getTime() + days * 86_400_000);
    const occurrences = await this.occurrences.forMember(userId, now, to);

    return occurrences.map((occurrence) => ({
      id: occurrence.meetingId,
      title: occurrence.title,
      at: occurrence.startAt.toISOString(),
      deepLink: `botvy://meetings/${occurrence.meetingId}`,
    }));
  }
}

/**
 * Training answers what the member practises, and records that they did.
 *
 * Five published surfaces and no repository, which is the rule
 * `CLAUDE.md` states as "a `*.query.ts` handler is the published surface": the
 * timetable comes from `AthleteProfileQueryHandler`, the week from
 * `SessionsQueryHandler`, and the two writes from the command handlers the REST
 * surface uses. Nothing here opens `athlete_profiles` or `sessions`.
 *
 * **The chat mints a new slot's id.** The same argument as the task and the
 * meeting: `AthleteProfile.setSlots` keys future sessions to a slot's id, so a
 * retried write must not re-mint one — and an *existing* slot's id arrives from
 * the executor's merge, which is what keeps its already-materialised sessions.
 *
 * **A domain refusal becomes `null`.** `AthleteProfileRuleError` is Training's
 * vocabulary and `chat.ports.ts` may not import its codes, so the code is
 * logged here and the executor tells the member nothing was saved. Anything
 * that is not a rule refusal is rethrown, because a store that is down is not a
 * sentence the member typed wrongly.
 */
@Injectable()
export class TrainingChatActions extends TrainingActionsPort {
  private readonly logger = new Logger(TrainingChatActions.name);

  constructor(
    private readonly profiles: AthleteProfileQueryHandler,
    private readonly slots: SetSlotsHandler,
    private readonly sessions: SessionsQueryHandler,
    private readonly session: SessionQueryHandler,
    private readonly logs: LogSessionHandler,
    private readonly completions: CompleteSessionHandler,
    private readonly member: MemberContextPort,
  ) {
    super();
  }

  async week(userId: string): Promise<ChatTrainingSlot[]> {
    // Never null — `AthleteProfileQueryHandler` promises a document and answers
    // an empty one for a member mid-bootstrap. So "no week yet" and "a week
    // with nothing in it" are the same thing here, which is what the executor's
    // merge already treats them as.
    const profile = await this.profiles.handle(userId);
    return profile.slots.map((slot) => ({ ...slot }));
  }

  async setSlots(
    userId: string,
    slots: ChatTrainingSlot[],
  ): Promise<ChatTrainingSlot[] | null> {
    try {
      await this.slots.handle(
        userId,
        slots.map((slot) => ({
          id: slot.id ?? newId(),
          weekday: slot.weekday,
          start: slot.start,
          durationMin: slot.durationMin,
          sport: slot.sport,
          location: slot.location ?? null,
        })),
      );
    } catch (error) {
      if ((error as Error).name !== 'AthleteProfileRuleError') throw error;
      this.logger.debug(
        `Training refused chat-set slots: ${(error as Error).message}`,
      );
      return null;
    }

    // Read back rather than echoing the command, because FR-004's confirmation
    // names the timetable the store now holds — a sport name it trimmed or a
    // location it dropped is confirmed as it is.
    return this.week(userId);
  }

  /**
   * Every session on the member's own local today.
   *
   * The bounds are their midnights, built through `shared/time` from their own
   * zone rather than as a window around `now` — principle XI, and the reason
   * "I trained today" said at 00:30 is about the day the member is in. The
   * upper bound is the next midnight less a millisecond because
   * `SessionRepository.between` is inclusive at both ends, and a session at
   * exactly 00:00 tomorrow is not today's.
   */
  async todaysSessions(
    userId: string,
    now: Date,
  ): Promise<TrainingSessionRef[]> {
    const { timezone } = await this.member.clock(userId);
    const today = localDate(now, timezone);
    const from = wallClockToUtc(`${today}T00:00`, timezone);
    const to = wallClockToUtc(`${nextDate(today)}T00:00`, timezone);
    // Unreachable: both strings are built from `localDate`'s own output. A
    // guard rather than a `!` because an `Invalid Date` reaching the repository
    // matches nothing silently, and the member would be told they have no
    // training on a day they do.
    if (!from || !to) return [];

    const views = await this.sessions.between(
      userId,
      from,
      new Date(to.getTime() - 1),
      now,
    );
    return views.map((view) => ({
      id: view.id,
      title: view.title,
      sport: view.sport,
      at: view.plannedAt,
      status: view.status,
    }));
  }

  /**
   * The session happened, and the member's own sentence is kept as its note.
   *
   * Two calls and one decision worth writing down: the note goes through
   * `LogSessionHandler` with **no exercises**, which is that handler's own
   * "notes ride in the same request" path, and it is **appended** rather than
   * assigned. `Session.edit` replaces the field, and a planned session's note
   * can already hold the program's instruction for the day ("tempo work") — so
   * writing "legs" over it would delete a coach's words to record the member's.
   */
  async completeSession(
    userId: string,
    sessionId: string,
    note?: string,
  ): Promise<TrainingSessionRef | null> {
    try {
      if (note && note.trim() !== '') {
        const existing = await this.session.byId(userId, sessionId);
        const before = existing?.notes?.trim();
        await this.logs.handle(userId, sessionId, {
          exercises: [],
          notes: before ? `${before}\n${note.trim()}` : note.trim(),
        });
      }
      await this.completions.handle(userId, sessionId);
    } catch (error) {
      if (!(error instanceof SessionNotFound)) throw error;
      // Gone between the read and the write — another device deleted it. The
      // executor says so rather than reporting a log that did not happen.
      this.logger.debug(`session ${sessionId} was gone before it was logged`);
      return null;
    }

    const stored = await this.session.byId(userId, sessionId);
    if (!stored) return null;
    return {
      id: stored.id,
      title: stored.title,
      sport: stored.sport,
      at: stored.plannedAt,
      status: stored.status,
    };
  }

  /**
   * What training is coming, for `chat.card { kind: 'sessions' }`.
   *
   * `at` is ISO-8601 for the reason `MeetingsChatActions.listUpcoming` gives.
   *
   * `planned` only, and that is the difference from the week view. The card
   * answers "what is coming", and a session the member has already cancelled or
   * skipped is not coming — where the week view keeps every status because it is
   * a record. A completed future session cannot exist.
   */
  async listUpcoming(
    userId: string,
    now: Date,
    days: number,
  ): Promise<CardItem[]> {
    const to = new Date(now.getTime() + days * 86_400_000);
    const views = await this.sessions.between(userId, now, to, now);

    return views
      .filter((view) => view.status === 'planned')
      .map((view) => ({
        id: view.id,
        title: view.title,
        at: view.plannedAt.toISOString(),
        status: view.status,
        deepLink: `botvy://sessions/${view.id}`,
      }));
  }
}

/** Tomorrow, as a date string. Calendar arithmetic, no zone involved. */
function nextDate(date: string): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}

/** Profile records what the member says about themselves. */
@Injectable()
export class ProfileChatWrites extends ProfileWritesPort {
  constructor(private readonly profiles: UpdateProfileHandler) {
    super();
  }

  async recordMetric(input: {
    userId: string;
    metric: 'weightKg' | 'heightCm';
    value: number;
    at: Date;
  }): Promise<{ metric: string; value: number }> {
    // `recordedAt`, which is Profile's own field name for it. Worth stating
    // because `at` is what every other command in this codebase calls the
    // same thing, and the mismatch is exactly the kind a `Partial<>` would
    // have accepted silently.
    await this.profiles.recordMetric(input.userId, {
      recordedAt: input.at,
      ...(input.metric === 'weightKg'
        ? { weightKg: input.value }
        : { heightCm: input.value }),
    });
    return { metric: input.metric, value: input.value };
  }

  /**
   * The narrow set the coach can be told in a sentence.
   *
   * Deliberately not "the whole profile": a port that could write anything
   * would be a chat that could change a member's email, and the extractor's
   * output is model-shaped. Returns the fields that actually moved, so the
   * one-line confirmation names them rather than claiming a change that was a
   * no-op.
   */
  async updateFacts(input: {
    userId: string;
    goal?: string;
    foodLikes?: string[];
    foodDislikes?: string[];
    allergies?: string[];
    symptoms?: string[];
  }): Promise<string[]> {
    const { userId, ...fields } = input;
    const patch = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(patch).length === 0) return [];
    const { changed } = await this.profiles.handle(userId, patch);
    return changed;
  }
}

/**
 * Operations counts the tokens.
 *
 * The other half of the loop: `conversations.MessageSent` carries a turn's cost
 * to Operations, and this asks for the total back. Neither context opens the
 * other's collection. Without this the allowance would sum nothing and every
 * member would sit permanently at zero used.
 */
@Injectable()
export class OperationsUsage extends UsagePort {
  constructor(private readonly usage: UsageTodayQueryHandler) {
    super();
  }

  async tokensBetween(userId: string, from: Date, to: Date): Promise<number> {
    return this.usage.tokensBetween(userId, from, to);
  }
}

/**
 * The rhythm decides whether a reply was the check-in.
 *
 * All three guards — the conversation, the outstanding question, the window —
 * live there, because the window length is Rhythm's setting and the streak is
 * Rhythm's arithmetic. This context knows only that a reply *might* be an
 * answer, and asks. That is why P3 built and specced
 * `capture-checkin-reply` without anything calling it: this is the caller it
 * was waiting for.
 */
@Injectable()
export class RhythmCheckins extends CheckinPort {
  // Named `replies` and not `capture`: the port's method is `capture`, and a
  // field of the same name shadows it into a type error that reads as though
  // the handler were the method.
  constructor(private readonly replies: CaptureCheckinReplyHandler) {
    super();
  }

  async capture(input: {
    userId: string;
    conversationKind: string;
    text: string;
    at: Date;
  }): Promise<CheckinCapture> {
    // `at` is Rhythm's second parameter rather than a field on its input: the
    // handler takes `(input, now)` so a spec can drive its clock.
    const result = await this.replies.handle(
      {
        userId: input.userId,
        conversationKind: input.conversationKind,
        text: input.text,
      },
      input.at,
    );

    return result.captured
      ? { captured: true, streak: result.streak }
      : { captured: false, reason: result.reason };
  }
}

/**
 * The mood the member last reported, for the quick-question order.
 *
 * A fourteen-day window rather than "the latest row ever", and that is the
 * decision worth writing down: a member returning after a month away should be
 * offered the ordinary questions, not the lighter-day ones they last needed in
 * August. A mood is a statement about a day, and a month-old day is not
 * evidence about this one.
 *
 * `null` when there is no row in the window, and also when the newest row has a
 * verdict but no mood — the two halves of a check-in arrive separately, and
 * "followed the plan, said nothing about how I felt" is not a mood.
 */
@Injectable()
export class RhythmLatestCheckin extends LatestCheckinPort {
  constructor(
    private readonly checkins: CheckinsQueryHandler,
    private readonly profiles: ProfileQueryHandler,
  ) {
    super();
  }

  async latestMood(userId: string): Promise<number | null> {
    const profile = await this.profiles.profile(userId);
    const timezone = profile?.timezone ?? 'Africa/Cairo';
    const now = new Date();
    const to = localDate(now, timezone);
    const from = localDate(
      new Date(now.getTime() - MOOD_WINDOW_DAYS * 86_400_000),
      timezone,
    );

    const rows = await this.checkins.handle(userId, from, to);
    // Newest first, then the first row that actually carries a mood. Not
    // simply the newest row: a member who answered "yes" today and gave a mood
    // yesterday has a mood, and it is yesterday's.
    const withMood = [...rows]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .find((row) => typeof row.mood === 'number');
    return withMood?.mood ?? null;
  }
}

/** How far back a mood is still evidence about today. */
const MOOD_WINDOW_DAYS = 14;

/**
 * The wall clock a member named, resolved against their own zone.
 *
 * Here rather than in the executor because it is the same conversion Reminders
 * does for `remindAtLocal`, and `shared/time` is the only clock authority —
 * principle XI. Exported so the executor can use it without importing another
 * context.
 */
export function resolveWallClock(
  wallClock: string,
  timezone: string,
): Date | null {
  return wallClockToUtc(wallClock, timezone);
}

/**
 * Nutrition adds a meal the member named in a sentence (P8's FR-012).
 *
 * Through the ordinary `add-meal` command, not a second write path. The id is
 * **minted here**, which is the one thing this adapter decides: every other
 * caller of that handler is a client that minted its own so an offline create
 * has a reference, and a sentence has no client behind it.
 *
 * `alreadyThere` is the handler's own replay answer, passed straight through.
 * The chat says "you already have that one" rather than claiming to have added
 * it twice — a member told a meal was added who then finds one row wonders
 * which of the two facts is wrong.
 */
@Injectable()
export class NutritionChatActions extends NutritionActionsPort {
  constructor(private readonly meals: AddMealHandler) {
    super();
  }

  async addMeal(input: {
    userId: string;
    name: string;
  }): Promise<{ id: string; name: string; alreadyThere: boolean }> {
    const added = await this.meals.handle(input.userId, {
      id: newId(),
      name: input.name,
    });
    return { id: added.id, name: input.name, alreadyThere: added.replayed };
  }
}

/**
 * Finding and changing the member's existing rows, for the chat (032).
 *
 * Every target goes through its owning context's published query to find and
 * re-read, and through the same command handler the app's own screens use to
 * change — so a chat edit cannot skip a rule an edit on the phone enforces,
 * and every event those handlers raise (a meeting's alerts re-planned, a
 * task's reminder moved) is raised exactly as it would be from the app.
 *
 * **Errors.** A refusal or a row that has gone is the owning context's
 * vocabulary — `TaskRuleError`, `MeetingNotFound`, `NoSuchSlot` and the rest —
 * which `chat.ports.ts` may not import. They are recognised by name here,
 * logged, and become `null`; the executor tells the member nothing changed.
 * Anything else is rethrown, because a store that is down is not a sentence
 * the member typed wrongly.
 */
export interface PlatformItemHandlers {
  tasks: TasksQueryHandler;
  updateTask: UpdateTaskHandler;
  completeTask: CompleteTaskHandler;
  cancelTask: CancelTaskHandler;
  deleteTask: DeleteTaskHandler;
  reminders: RemindersQueryHandler;
  manageReminder: ManageReminderHandler;
  reminderLifecycle: ReminderLifecycleHandler;
  meetings: MeetingQueryHandler;
  occurrences: MeetingOccurrencesQueryHandler;
  updateMeeting: UpdateMeetingHandler;
  cancelMeeting: CancelMeetingHandler;
  completeMeeting: CompleteMeetingHandler;
  deleteMeeting: DeleteMeetingHandler;
  moveOccurrence: MoveMeetingOccurrenceHandler;
  skipOccurrence: SkipMeetingOccurrenceHandler;
  sessions: SessionsQueryHandler;
  session: SessionQueryHandler;
  updateSession: UpdateSessionHandler;
  completeSession: CompleteSessionHandler;
  cancelSession: CancelSessionHandler;
  deleteSession: DeleteSessionHandler;
  athletes: AthleteProfileQueryHandler;
  setSlots: SetSlotsHandler;
  meals: MealsQueryHandler;
  addMeal: AddMealHandler;
  replaceMeal: ReplaceTodayMealHandler;
  deleteMeal: DeleteMealHandler;
  member: MemberContextPort;
}

/** The refusals another context raises, by class name. */
const REFUSALS =
  /NotFound$|RuleError$|^NoSuchSlot$|^NoMealsOnThatDay$|^PastDayIsSettled$/;

@Injectable()
export class PlatformItems extends ChatItemsPort {
  private readonly logger = new Logger(PlatformItems.name);

  constructor(private readonly h: PlatformItemHandlers) {
    super();
  }

  async find(
    userId: string,
    target: ChatTarget,
    action: ChatAction,
    now: Date,
  ): Promise<TargetItem[]> {
    const day = 86_400_000;
    switch (target) {
      case 'task': {
        const pages = await Promise.all(
          (['overdue', 'today', 'upcoming'] as const).map((view) =>
            this.h.tasks.page(userId, { view, limit: 50 }, now),
          ),
        );
        const seen = new Map<string, TargetItem>();
        for (const task of pages.flatMap((page) => page.nodes)) {
          seen.set(task.id, {
            target,
            id: task.id,
            title: task.title,
            at: task.dueAt,
            allDay: task.allDay,
          });
        }
        return [...seen.values()];
      }
      case 'reminder': {
        const page = await this.h.reminders.page(
          userId,
          { view: 'upcoming', limit: 50 },
          now,
        );
        return page.nodes.map((reminder) => reminderItem(reminder));
      }
      case 'meeting': {
        // A day back as well as a month ahead: "mark this morning's standup
        // done" is about an occurrence that has already started.
        const occurrences = await this.h.occurrences.forMember(
          userId,
          new Date(now.getTime() - day),
          new Date(now.getTime() + 30 * day),
        );
        const recurring = new Map<string, boolean>();
        for (const id of new Set(occurrences.map((o) => o.meetingId))) {
          const meeting = await this.h.meetings.byId(userId, id, now);
          recurring.set(id, Boolean(meeting?.recurrence));
        }
        return occurrences.map((occurrence) => {
          const series = recurring.get(occurrence.meetingId) ?? false;
          return {
            target,
            id: occurrence.meetingId,
            title: occurrence.title,
            at: occurrence.startAt,
            durationMin: occurrence.durationMin,
            recurring: series,
            occurrenceStart: series ? occurrence.originalStart : null,
          };
        });
      }
      case 'session': {
        const views = await this.h.sessions.between(
          userId,
          new Date(now.getTime() - day),
          new Date(now.getTime() + 21 * day),
          now,
        );
        return views
          .filter((view) => view.status === 'planned')
          .map((view) => ({
            target,
            id: view.id,
            title: view.title,
            at: view.plannedAt,
            durationMin: view.durationMin,
            sport: view.sport,
          }));
      }
      case 'meal': {
        // An edit swaps a row of today's plan; a delete removes one of the
        // member's own meals from their list. Different rows, one target.
        if (action === 'edit') {
          const { timezone } = await this.h.member.clock(userId);
          const date = localDate(now, timezone);
          const today = await this.h.meals.forDate(userId, date);
          return (today?.meals ?? []).map((meal, index) => ({
            target,
            id: `${date}:${index}`,
            title: `${meal.kind} ${meal.name}`,
            at: null,
            date,
            index,
          }));
        }
        const library = await this.h.meals.list(userId);
        return library.map((meal) => ({
          target,
          id: meal.id,
          title: meal.name,
          at: null,
        }));
      }
      case 'slot': {
        const profile = await this.h.athletes.handle(userId);
        return profile.slots.map((slot) => ({
          target,
          id: slot.id,
          title: `${slot.sport} ${WEEKDAY_NAMES[slot.weekday - 1] ?? slot.weekday} ${slot.start}`,
          at: null,
          durationMin: slot.durationMin,
          weekday: slot.weekday,
          start: slot.start,
          sport: slot.sport,
        }));
      }
    }
  }

  async reread(userId: string, item: TargetItem): Promise<TargetItem | null> {
    switch (item.target) {
      case 'task': {
        const task = await this.h.tasks.byId(userId, item.id);
        if (!task || task.status !== 'open' || task.deletedAt) return null;
        return {
          target: 'task',
          id: task.id,
          title: task.title,
          at: task.dueAt,
          allDay: task.allDay,
        };
      }
      case 'reminder': {
        const reminder = await this.h.reminders.byId(userId, item.id);
        return reminder && !reminder.deletedAt ? reminderItem(reminder) : null;
      }
      case 'meeting': {
        const meeting = await this.h.meetings.byId(userId, item.id);
        if (!meeting) return null;
        // A series is compared by its title and length — the occurrence's own
        // moment is the proposal's key — and a one-off by its start too.
        return {
          ...item,
          title: meeting.title,
          at: item.recurring ? item.at : meeting.startAt,
          durationMin: item.recurring ? item.durationMin : meeting.durationMin,
        };
      }
      case 'session': {
        const session = await this.h.session.byId(userId, item.id);
        if (!session || session.status !== 'planned') return null;
        return {
          ...item,
          title: session.title,
          at: session.plannedAt,
          durationMin: session.durationMin,
        };
      }
      case 'meal':
      case 'slot': {
        const rows = await this.find(
          userId,
          item.target,
          item.date ? 'edit' : 'delete',
          new Date(),
        );
        return rows.find((row) => row.id === item.id) ?? null;
      }
    }
  }

  async apply(
    userId: string,
    action: ChatAction,
    item: TargetItem,
    change: ItemChange,
    now: Date,
  ): Promise<TargetItem | null> {
    try {
      await this.write(userId, action, item, change, now);
    } catch (error) {
      const name = (error as Error).name;
      if (!REFUSALS.test(name)) throw error;
      this.logger.debug(
        `${action} ${item.target} ${item.id} refused: ${name} ${(error as Error).message}`,
      );
      return null;
    }

    // Read back, so the confirmation names what is stored. A completed,
    // cancelled or deleted row no longer reads back as open, so for those the
    // proposal's own copy is what the confirmation names.
    if (action !== 'edit') return item;
    return (await this.reread(userId, item)) ?? item;
  }

  private async write(
    userId: string,
    action: ChatAction,
    item: TargetItem,
    change: ItemChange,
    now: Date,
  ): Promise<void> {
    const { h } = this;
    switch (item.target) {
      case 'task': {
        if (action === 'complete') {
          await h.completeTask.handle(userId, item.id, now);
        } else if (action === 'cancel') {
          await h.cancelTask.handle(userId, item.id);
        } else if (action === 'delete') {
          await h.deleteTask.handle(userId, item.id, now);
        } else {
          await h.updateTask.handle(userId, item.id, {
            ...(change.title ? { title: change.title } : {}),
            ...(change.at
              ? { dueAt: change.at, allDay: change.allDay === true }
              : {}),
            ...(change.priority
              ? { priority: change.priority as 1 | 2 | 3 | 4 }
              : {}),
          });
        }
        return;
      }
      case 'reminder': {
        if (action === 'complete') {
          await h.reminderLifecycle.complete(userId, item.id, now);
        } else if (action === 'cancel') {
          await h.reminderLifecycle.cancel(userId, item.id, now);
        } else if (action === 'delete') {
          await h.reminderLifecycle.remove(userId, item.id, now);
        } else {
          await h.manageReminder.update(
            userId,
            item.id,
            {
              ...(change.title ? { title: change.title } : {}),
              ...(change.at ? { remindAt: change.at } : {}),
            },
            now,
          );
        }
        return;
      }
      case 'meeting': {
        const occurrence =
          item.recurring && item.occurrenceStart
            ? new Date(item.occurrenceStart)
            : null;
        if (action === 'complete') {
          await h.completeMeeting.handle(userId, item.id, now);
          return;
        }
        if (action === 'delete') {
          await h.deleteMeeting.handle(userId, item.id, now);
          return;
        }
        if (action === 'cancel') {
          // One occurrence of a series is skipped; a one-off is cancelled.
          if (occurrence) {
            await h.skipOccurrence.handle(userId, item.id, occurrence, now);
          } else {
            await h.cancelMeeting.handle(userId, item.id, now);
          }
          return;
        }
        // Moving one occurrence of a series is an override, never an edit to
        // the series (CLAUDE.md, recurrence); everything else edits the meeting.
        if (change.at && occurrence) {
          await h.moveOccurrence.handle(
            userId,
            item.id,
            occurrence,
            change.at,
            change.durationMin ?? null,
            now,
          );
        }
        const patch = {
          ...(change.title ? { title: change.title } : {}),
          ...(change.at && !occurrence ? { startAt: change.at } : {}),
          ...(change.durationMin && !(change.at && occurrence)
            ? { durationMin: change.durationMin }
            : {}),
          ...(change.onlineLink !== undefined || change.address !== undefined
            ? {
                location: {
                  onlineLink: change.onlineLink ?? null,
                  address: change.address ?? null,
                },
              }
            : {}),
        };
        if (Object.keys(patch).length > 0) {
          await h.updateMeeting.handle(userId, item.id, patch);
        }
        return;
      }
      case 'session': {
        if (action === 'complete') {
          await h.completeSession.handle(userId, item.id, now);
        } else if (action === 'cancel') {
          await h.cancelSession.handle(userId, item.id, now);
        } else if (action === 'delete') {
          await h.deleteSession.handle(userId, item.id, now);
        } else {
          await h.updateSession.handle(
            userId,
            item.id,
            {
              ...(change.title ? { title: change.title } : {}),
              ...(change.at ? { plannedAt: change.at } : {}),
              ...(change.durationMin
                ? { durationMin: change.durationMin }
                : {}),
            },
            now,
          );
        }
        return;
      }
      case 'meal': {
        if (action === 'delete') {
          await h.deleteMeal.handle(userId, item.id, now);
          return;
        }
        if (!change.mealName || item.index === undefined || !item.date) return;
        // The member's own meal of that name, or a new one: swapping in a dish
        // they named but never saved is a create, and creates happen at once.
        const wanted = fold(change.mealName);
        const library = await h.meals.list(userId);
        const found = library.find((row) => fold(row.name) === wanted);
        const mealId =
          found?.id ??
          (
            await h.addMeal.handle(userId, {
              id: newId(),
              name: change.mealName,
            })
          ).id;
        await h.replaceMeal.handle(
          userId,
          { date: item.date, index: item.index, mealId },
          now,
        );
        return;
      }
      case 'slot': {
        const profile = await h.athletes.handle(userId);
        const slots =
          action === 'edit'
            ? profile.slots.map((slot) =>
                slot.id === item.id
                  ? {
                      ...slot,
                      ...(change.start ? { start: change.start } : {}),
                      ...(change.durationMin
                        ? { durationMin: change.durationMin }
                        : {}),
                    }
                  : slot,
              )
            : profile.slots.filter((slot) => slot.id !== item.id);
        await h.setSlots.handle(
          userId,
          slots.map((slot) => ({ ...slot, location: slot.location ?? null })),
        );
        return;
      }
    }
  }
}

function reminderItem(reminder: {
  id: string;
  title: string;
  effectiveAt: Date;
}): TargetItem {
  return {
    target: 'reminder',
    id: reminder.id,
    title: reminder.title,
    at: reminder.effectiveAt,
  };
}

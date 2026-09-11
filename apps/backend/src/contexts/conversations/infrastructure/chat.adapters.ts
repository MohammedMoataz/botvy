import { Injectable, Logger } from '@nestjs/common';
import { newId } from '../../../shared/cqrs/ids.js';
import { MemberContextPort } from '../../../shared/member/member-context.port.js';
import {
  formatInTz,
  localDate,
  localHhMm,
  wallClockToUtc,
} from '../../../shared/time/time.js';
import { MeetingQueryHandler } from '../../meetings/features/meeting/meeting.query.js';
import { MeetingOccurrencesQueryHandler } from '../../meetings/features/meeting-occurrences/meeting-occurrences.query.js';
import { CreateMeetingHandler } from '../../meetings/features/create-meeting/create-meeting.handler.js';
import { CancelTaskHandler } from '../../planning/features/cancel-task/cancel-task.handler.js';
import { CreateTaskHandler } from '../../planning/features/create-task/create-task.handler.js';
import { TasksQueryHandler } from '../../planning/features/tasks-query/tasks.query.js';
import { ManageReminderHandler } from '../../reminders/features/manage-reminder/manage-reminder.handler.js';
import { ReminderLifecycleHandler } from '../../reminders/features/reminder-lifecycle/reminder-lifecycle.handler.js';
import { RemindersQueryHandler } from '../../reminders/features/reminders-query/reminders.query.js';
import { ProfileQueryHandler } from '../../profile/features/profile-query/profile.query.js';
import { UpdateProfileHandler } from '../../profile/features/update-profile/update-profile.handler.js';
import { AthleteProfileQueryHandler } from '../../training/features/athlete-profile/athlete-profile.query.js';
import { CompleteSessionHandler } from '../../training/features/complete-session/complete-session.handler.js';
import { LogSessionHandler } from '../../training/features/log-session/log-session.handler.js';
import { SessionQueryHandler } from '../../training/features/session/session.query.js';
import { SessionsQueryHandler } from '../../training/features/sessions/sessions.query.js';
import { SetSlotsHandler } from '../../training/features/set-slots/set-slots.handler.js';
import { TrainingSummaryQueryHandler } from '../../training/features/training-summary/training-summary.query.js';
import { SessionNotFound } from '../../training/features/update-session/update-session.handler.js';
import { StreakQueryHandler } from '../../rhythm/features/streak/streak.query.js';
import { TodayPlanQueryHandler } from '../../rhythm/features/today-plan/today-plan.query.js';
import { CaptureCheckinReplyHandler } from '../../rhythm/features/capture-checkin-reply/capture-checkin-reply.handler.js';
import { CheckinsQueryHandler } from '../../rhythm/features/checkins/checkins.query.js';
import { UsageTodayQueryHandler } from '../../operations/features/usage-today/usage-today.query.js';
import {
  CheckinPort,
  LatestCheckinPort,
  MeetingActionsPort,
  MemberDayPort,
  MemberFactsPort,
  PlannerActionsPort,
  ProfileWritesPort,
  TrainingActionsPort,
  TrainingSummaryPort,
  UsagePort,
  type CancellableItem,
  type CardItem,
  type ChatTrainingSlot,
  type CheckinCapture,
  type CreatedItem,
  type MemberDay,
  type MemberFacts,
  type TrainingSessionRef,
} from '../domain/chat.ports.js';

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
        const at = task.dueAt ? localHhMm(new Date(task.dueAt), timezone) : null;
        // The time is rendered here, in the member's zone, because this string
        // goes straight into a prompt — and a model handed a UTC timestamp
        // will happily quote it back at them.
        return `P${task.priority} ${task.title}${at && at !== '00:00' ? ` at ${at}` : ''}`;
      }),
      trainingLine,
      mealLine: plan.mealLine ?? null,
      streakCurrent: streak.current,
      streakBest: streak.best,
      today,
    };
  }
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
    private readonly cancelTask: CancelTaskHandler,
    private readonly reminders: ManageReminderHandler,
    private readonly reminderQueries: RemindersQueryHandler,
    private readonly reminderLifecycle: ReminderLifecycleHandler,
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

  /**
   * Everything still open that a `cancel` could mean.
   *
   * Both kinds in one list, because the member said "cancel the dentist one"
   * and does not know or care whether they made it a task or a reminder. The
   * matching happens in the executor over these rows — never in the model,
   * which would pick an id that does not exist.
   */
  async findCancellable(
    userId: string,
    now: Date,
  ): Promise<CancellableItem[]> {
    const [upcomingTasks, overdueTasks, reminders] = await Promise.all([
      this.taskQueries.page(userId, { view: 'upcoming', limit: 50 }, now),
      this.taskQueries.page(userId, { view: 'overdue', limit: 50 }, now),
      this.reminderQueries.page(userId, { view: 'upcoming', limit: 50 }, now),
    ]);

    return [
      ...[...upcomingTasks.nodes, ...overdueTasks.nodes].map((task) => ({
        id: task.id,
        kind: 'task' as const,
        title: task.title,
        at: task.dueAt,
      })),
      ...reminders.nodes.map((reminder) => ({
        id: reminder.id,
        kind: 'reminder' as const,
        title: reminder.title,
        at: reminder.effectiveAt,
      })),
    ];
  }

  async cancel(userId: string, item: CancellableItem): Promise<boolean> {
    try {
      if (item.kind === 'task') await this.cancelTask.handle(userId, item.id);
      else await this.reminderLifecycle.cancel(userId, item.id);
      return true;
    } catch {
      // Gone between the search and the cancel — the member completed it on
      // another device, which is a race and not an error. `false` lets the
      // executor say so rather than reporting a cancellation that did not
      // happen.
      return false;
    }
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
   * `at` is a wall-clock string in the member's zone, because that is what
   * `CardItem.at` is: the client renders the row as given, and a card carrying
   * an instant would be rendered against the *device's* zone. The occurrence
   * query already resolves the window in the member's zone, so the formatting
   * is the only thing left to do here.
   */
  async listUpcoming(
    userId: string,
    now: Date,
    days: number,
  ): Promise<CardItem[]> {
    const to = new Date(now.getTime() + days * 86_400_000);
    const occurrences = await this.occurrences.forMember(userId, now, to);
    const { timezone } = await this.member.clock(userId);

    return occurrences.map((occurrence) => ({
      id: occurrence.meetingId,
      title: occurrence.title,
      at: formatInTz(occurrence.startAt, timezone),
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
   * `at` is a wall-clock string in the member's zone for the reason
   * `MeetingsChatActions.listUpcoming` gives: `CardItem.at` is rendered as
   * given, so a card carrying an instant is rendered against the *device's*
   * zone.
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
    const { timezone } = await this.member.clock(userId);
    const to = new Date(now.getTime() + days * 86_400_000);
    const views = await this.sessions.between(userId, now, to, now);

    return views
      .filter((view) => view.status === 'planned')
      .map((view) => ({
        id: view.id,
        title: view.title,
        at: formatInTz(view.plannedAt, timezone),
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

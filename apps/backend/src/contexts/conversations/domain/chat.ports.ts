import type { Intent } from './intent.js';

/**
 * Everything a turn needs that this context does not own, plus the four
 * collaborators the turn is assembled from.
 *
 * All of it declared here in `domain/` and bound in this context's own
 * `infrastructure/`, which is the seam constitution IX sanctions:
 * `infrastructure/` is the single layer allowed to know another context exists.
 * Nothing under `domain/` or `features/` imports another context, and
 * `no-restricted-imports` refuses it.
 *
 * ## On the ports that perform *writes* in other contexts
 *
 * `CLAUDE.md` says a handler that dispatches another context's command is the
 * same violation wearing a bus, and that is right about a handler reaching
 * across from `features/`. A port declared here and bound in `infrastructure/`
 * is the sanctioned form of the same need, and P3 already established it: the
 * rhythm writes into the coach chat through `CoachTranscriptPort`, bound to
 * this context's own append command.
 *
 * The alternative for the planner was an event — Conversations raises
 * `IntentDetected`, Planning consumes it and creates the task — and it was
 * rejected for one concrete reason: **FR-004 requires the confirmation to name
 * the values that were actually stored.** The relay is eventual, so an
 * event-driven create cannot be confirmed in the turn that asked for it. The
 * member would get "I'll do that" and then, seconds later and out of band, a
 * task they could not see in the reply. The event still goes out — Planning
 * raises its own — but the acknowledgement the member reads is synchronous
 * because it has to be.
 */

// -------------------------------------------------------- what the turn reads

/** The member's clock, locale and the facts the coach speaks from. */
export interface MemberFacts {
  timezone: string;
  locale: string;
  /**
   * The prose summary Profile composes, with only the fields the member
   * actually recorded. Never a template with "unknown" in it — FR-006 — and
   * null when they have recorded nothing at all.
   */
  summary: string | null;
  /**
   * Declared allergies, verbatim. Separate from the summary because two
   * different things read them: the prompt states them as prohibitions, and
   * `AllergenGuard` checks the answer against them on the way out. A prompt
   * instruction to a 3-billion-parameter model is not a control.
   */
  allergies: string[];
}

export abstract class MemberFactsPort {
  abstract forMember(userId: string): Promise<MemberFacts>;
}

/** Today, as the coach needs to know it: the plan, the streak, the session. */
export interface MemberDay {
  /** One line per task, already ordered. Empty when there is nothing. */
  tasks: string[];
  /**
   * The member's training, as one unlabelled clause.
   *
   * From P6 this is the *training week* rather than only today's session —
   * the sports they practise, the session that is next with its focus, and the
   * streak of completed sessions (FR-017) — because that is what a coach needs
   * to answer a question about training and a single day is not it. The day's
   * own session is still in here: it is the next planned one whenever it has
   * not happened yet, and once it has, the streak is what says so.
   *
   * Null only if no adapter can answer at all. Training answers a sentence even
   * for a member with no slots, saying exactly that — an absent line does not
   * read to a model as "they do not train", it reads as a gap, and a model
   * fills a gap by assuming.
   */
  trainingLine: string | null;
  /**
   * What the member is eating today — the names, joined. Null when there are
   * none, which is not the same as there being no answer.
   */
  mealLine: string | null;
  /**
   * Why there are none, as one of Nutrition's three codes, or null.
   *
   * Both halves reach the prompt because "no meals" and "no meals *because I
   * could not reach the model*" are different things to say to a member who
   * asks, and a coach handed only the absence will invent the reason — which is
   * the gap-filling this file's `trainingLine` note already warns about. The
   * assembler turns the code into the one sentence the coach is allowed to say
   * (FR-012).
   */
  mealReason: string | null;
  streakCurrent: number;
  streakBest: number;
  /** The member's own local date, for the prompt's "today is" line. */
  today: string;
}

export abstract class MemberDayPort {
  abstract forMember(userId: string, now: Date): Promise<MemberDay>;
}

/**
 * The member's training week, for the prompt (FR-017).
 *
 * Bound to Training's `TrainingSummaryQueryHandler` — the sibling of Profile's
 * `summary`, and a `*.query.ts` handler rather than a feature service, because
 * the query handler is the published half.
 *
 * Its own port rather than a field on `TrainingActionsPort`, which the chat also
 * binds to Training: that one is what the *planner* calls to set slots and log a
 * session, and its methods write. This one is read by the prompt on every single
 * turn in every conversation. Two callers with nothing in common beyond the
 * context that answers them, and a port whose consumer set is "everything" is a
 * port nobody can change.
 *
 * Never null, so the prompt has no branch: see the handler's own note on why a
 * member with no training week gets a sentence saying so.
 */
export abstract class TrainingSummaryPort {
  abstract lineFor(userId: string, now: Date): Promise<string>;
}

/**
 * The two writes the planner performs, and the two reads it needs to perform
 * them safely.
 *
 * Bound to Planning's and Reminders' own command handlers. Every method
 * returns what was **stored**, not what was asked for, because that is what
 * the confirmation names: a task whose title was trimmed or whose due date was
 * clamped must be confirmed as it is, or the member is told something untrue
 * about their own list.
 */
export interface CreatedItem {
  id: string;
  title: string;
  /** The stored instant. The confirmation renders it in the member's zone. */
  at: Date | null;
  allDay: boolean;
  priority?: number;
  label?: string;
}

/** A candidate for a `cancel` the member described in words. */
export interface CancellableItem {
  id: string;
  kind: 'task' | 'reminder';
  title: string;
  at: Date | null;
}

export abstract class PlannerActionsPort {
  abstract createTask(input: {
    userId: string;
    title: string;
    dueAt: Date | null;
    allDay: boolean;
    priority?: number;
    labelName?: string;
    notes?: string;
  }): Promise<CreatedItem>;

  abstract createReminder(input: {
    userId: string;
    title: string;
    remindAt: Date;
    leadTimes?: string[];
  }): Promise<CreatedItem>;

  /**
   * Everything open that the member's words could mean.
   *
   * The *matching* happens in the executor, not here, and not in the model:
   * "cancel my 5pm reminder" is a search over the member's own rows, and a
   * model asked to pick an id would pick one that does not exist. Two matches
   * is a question, never a guess — FR-006 again.
   */
  abstract findCancellable(
    userId: string,
    now: Date,
  ): Promise<CancellableItem[]>;

  abstract cancel(
    userId: string,
    item: CancellableItem,
  ): Promise<boolean>;

  /** The `list` intent's answer, as structured items for `chat.card`. */
  abstract list(
    userId: string,
    kind: 'tasks' | 'reminders' | 'plan',
    now: Date,
  ): Promise<CardItem[]>;
}

/**
 * The one write the chat performs in Meetings.
 *
 * Its own port rather than a third method on `PlannerActionsPort`, because that
 * one is bound to Planning's and Reminders' handlers and a meeting is neither.
 * Keeping them apart is what lets a reviewer read the DI wiring and see which
 * contexts a chat turn can write into — and it means the module import that
 * makes meetings possible is a visible line rather than a widened constructor.
 *
 * The same argument as `PlannerActionsPort` applies to why this is a port and
 * not an event: FR-004 requires the confirmation to name what was **actually
 * stored**, and the relay is eventual, so an event-driven create cannot be
 * confirmed in the turn that asked for it.
 *
 * `null` rather than a thrown error when Meetings refuses, exactly as
 * `PlannerActionsPort.cancel` returns `false`: the refusal is a domain rule of
 * another context — `MeetingRuleError`, whose union of codes this file may not
 * import — and the executor's job is to tell the member it was not saved
 * rather than to explain somebody else's vocabulary. The adapter logs the code.
 */
export abstract class MeetingActionsPort {
  abstract createMeeting(input: {
    userId: string;
    title: string;
    startAt: Date;
    /** Absent means the member's own default length (FR-001). */
    durationMin?: number;
    /** At least one half is present; the executor asks when neither is. */
    onlineLink?: string;
    address?: string;
  }): Promise<CreatedItem | null>;

  /**
   * The member's next meetings, for "what have I got this week".
   *
   * A read on the write port, which reads oddly until you see the alternative:
   * a second port bound to the same module for the same context, so the DI
   * wiring would show two lines where the honest statement is one — the chat
   * can reach Meetings. `PlannerActionsPort` already carries both a `list` and
   * its writes, for that reason.
   *
   * Occurrences and not rows. A weekly series is one document (FR-006), so
   * "your meetings" is a question about a window rather than about a
   * collection, and the answer comes from the same expansion the calendar
   * uses — the adapter is bound to the published occurrence query, so the chat
   * and the calendar cannot disagree about where a meeting is.
   */
  abstract listUpcoming(
    userId: string,
    now: Date,
    days: number,
  ): Promise<CardItem[]>;
}

/**
 * One weekly training slot, as a sentence can describe one.
 *
 * A copy of `TrainingSlot`'s shape and not an import: this file is `domain/`
 * and constitution IX refuses a cross-context import here. Two copies is the
 * rule until the third, and the fields are the ones a member can say out loud.
 *
 * `id` is absent for a slot the sentence has just invented and present for one
 * the member already had. That distinction is the whole of the merge below —
 * **a slot that keeps its id keeps its future sessions**, because the
 * materialiser's reconcile matches on it, so re-timing an existing Monday must
 * carry its id across rather than mint a new one and lose the week. The adapter
 * mints the ids for the new ones, exactly as it mints a task's.
 *
 * `start` is `HH:mm` on the member's own clock and never an instant — a slot is
 * a statement about their watch, so a member who flies still trains at six.
 */
export interface ChatTrainingSlot {
  id?: string;
  /** 1 (Monday) to 7 (Sunday), matching ISO 8601 and Training's own field. */
  weekday: number;
  start: string;
  durationMin: number;
  sport: string;
  location?: string | null;
}

/** A session the chat can name, as stored. */
export interface TrainingSessionRef {
  id: string;
  title: string;
  sport: string;
  at: Date;
  /**
   * Training's own status word — `planned`, `completed`, `cancelled`,
   * `skipped`.
   *
   * A `string` and not a union, for the reason `CheckinCapture.reason` gives:
   * the values belong to another context and a union retyped here is the copy
   * that goes stale. The executor compares against `'planned'` and treats
   * everything else as "already dealt with", which is a reading that survives a
   * fifth status being added.
   */
  status: string;
}

/**
 * What the coach chat can do about training (FR-015).
 *
 * Its own port rather than more methods on `PlannerActionsPort`, for the reason
 * `MeetingActionsPort` gives: the DI wiring is where a reviewer reads which
 * contexts a chat turn can write into, and one port per context keeps that
 * readable. And a port rather than an event for the same reason again — FR-004
 * wants the confirmation to name the values that were **actually stored**, and
 * the relay is eventual.
 *
 * ## Why the week is read as well as written
 *
 * `AthleteProfile.setSlots` replaces the whole timetable, because that is how
 * the editor works. A sentence is not the editor: "gym Monday and Wednesday at
 * six" names two days of one sport and says nothing about the swimming on
 * Sunday or the gym on Friday. So the executor reads the week, merges the
 * sentence into it and writes the result — and the merge is in the executor
 * rather than in this adapter because it is a decision about the member's own
 * words, which is the kind of thing a spec should be able to drive without a
 * store.
 */
export abstract class TrainingActionsPort {
  /** The member's timetable as it stands, for the merge. Empty is normal. */
  abstract week(userId: string): Promise<ChatTrainingSlot[]>;

  /**
   * The whole timetable, replaced — and the slots as they were **stored**.
   *
   * `null` when Training refused it on a rule of its own, exactly as
   * `MeetingActionsPort.createMeeting` does: `AthleteProfileRuleError` is
   * Training's vocabulary and this file may not import its codes, so the
   * adapter logs the code and the executor tells the member nothing was saved.
   */
  abstract setSlots(
    userId: string,
    slots: ChatTrainingSlot[],
  ): Promise<ChatTrainingSlot[] | null>;

  /**
   * Every session on the member's own local today, whatever its status.
   *
   * Their local day and not a 24-hour window around `now`, which is the whole
   * of principle XI here: "I trained today" said at half past midnight is about
   * the day the member is in, and the adapter resolves it through their zone.
   */
  abstract todaysSessions(
    userId: string,
    now: Date,
  ): Promise<TrainingSessionRef[]>;

  /**
   * This session happened, with the member's own words kept as its note.
   *
   * `null` when it could not be recorded — gone, or already refused — for the
   * same reason `PlannerActionsPort.cancel` returns `false`: a member told
   * their session was logged when it was not goes looking for a record that
   * does not exist.
   */
  abstract completeSession(
    userId: string,
    sessionId: string,
    note?: string,
  ): Promise<TrainingSessionRef | null>;

  /**
   * What training is coming, for `chat.card { kind: 'sessions' }` (FR-015).
   *
   * The same shape as `MeetingActionsPort.listUpcoming` and for the same
   * reasons: rows from the published query, so the chat and the week view
   * cannot disagree, and `at` a wall-clock string in the member's zone, because
   * a card carrying an instant is rendered against the *device's* zone.
   */
  abstract listUpcoming(
    userId: string,
    now: Date,
    days: number,
  ): Promise<CardItem[]>;
}

/** One row of a structured list answer, as `ws-chat.md` types it. */
export interface CardItem {
  id: string;
  title: string;
  at: string | null;
  priority?: number;
  status?: string;
  /** What tapping it does. `botvy://tasks/<id>` and friends. */
  deepLink?: string;
}

/**
 * Adding a meal to the member's own list from a sentence (P8's FR-012).
 *
 * Bound to Nutrition's ordinary `add-meal` command rather than opening a second
 * way into the collection — a second write path is how one of them comes to
 * skip a rule the other enforces, and the id rule here is load-bearing: the
 * *server* mints it for a chat-created meal, because the member did not.
 *
 * One method, and deliberately no `remove`. "Take koshari off my meals" is a
 * deletion the member can see and undo on the screen that lists them, where a
 * sentence-matched delete would be the `cancel` branch's two-matches problem
 * with nothing to show for it. Adding is safe to get slightly wrong — a wrong
 * meal sits in a list — and deleting is not.
 */
export abstract class NutritionActionsPort {
  abstract addMeal(input: {
    userId: string;
    name: string;
  }): Promise<{ id: string; name: string; alreadyThere: boolean }>;
}

/**
 * The facts a member states about themselves in the coach chat, written to
 * their profile after a one-line confirmation (FR-015).
 *
 * Bound to Profile's own update command. Narrow on purpose: this is the set the
 * coach can be told in a sentence, not the whole profile — a port that could
 * write anything would be a chat that could change a member's email.
 */
export abstract class ProfileWritesPort {
  abstract recordMetric(input: {
    userId: string;
    metric: 'weightKg' | 'heightCm';
    value: number;
    at: Date;
  }): Promise<{ metric: string; value: number }>;

  abstract updateFacts(input: {
    userId: string;
    goal?: string;
    foodLikes?: string[];
    foodDislikes?: string[];
    allergies?: string[];
    symptoms?: string[];
  }): Promise<string[]>;
}

/**
 * Today's token total for this member, over **their** local day.
 *
 * Bound to Operations' `UsageTodayQuery`. Conversations never opens
 * `usage_log`, and Operations never opens `messages`: the loop between them is
 * `conversations.MessageSent` carrying the turn's counts one way and this query
 * going back the other. Without that loop the allowance would sum an empty
 * collection and every member would sit permanently at zero used, which is a
 * limit that silently does not exist.
 *
 * The window is a pair of instants — the member's own midnights, resolved
 * through `shared/time` by the caller — rather than a date, because "today" is
 * the question this port must not be left to answer.
 */
export abstract class UsagePort {
  abstract tokensBetween(userId: string, from: Date, to: Date): Promise<number>;
}

/**
 * The evening check-in, when one is awaited.
 *
 * Bound to Rhythm's `capture-checkin-reply`, which holds all three guards — the
 * conversation must be the coach one, a question must be outstanding, and the
 * window must not have run out. The guards live there and not here because the
 * window length is Rhythm's setting and the streak is Rhythm's arithmetic; this
 * context knows only that a reply *might* be an answer and asks.
 */
export interface CheckinCapture {
  captured: boolean;
  /**
   * Why not, when it was not — `not_coach`, `not_awaiting`, `expired`,
   * `unclear`.
   *
   * A `string` rather than a union, because the values are **Rhythm's** and
   * this file may not import them: a union written out here would be a second
   * copy of somebody else's vocabulary, and the copy is the one that would go
   * stale when Rhythm added a fifth reason. Nothing in the turn branches on it
   * — every refusal falls through to an ordinary turn — so the value is for
   * the log, and a log line does not need a type.
   */
  reason?: string;
  /** What to say back when it was captured. */
  streak?: number;
}

export abstract class CheckinPort {
  abstract capture(input: {
    userId: string;
    conversationKind: string;
    text: string;
    at: Date;
  }): Promise<CheckinCapture>;
}

/**
 * The mood the member last reported, or null.
 *
 * Bound to Rhythm's `checkins` query. Read by the quick-question list so a
 * member who reported a bad day is offered a lighter option first (FR-010) —
 * and read through a port rather than from Rhythm's collection, which is the
 * whole of principle I in one line.
 *
 * **Null rather than a default number**, and the distinction is the feature: a
 * member who has never answered a check-in, or who answered with a verdict and
 * no mood, has no mood — not a middling one. `?? 50` would put every new member
 * in the "ok" bucket by accident and `?? 0` would greet all of them with a
 * lighter day.
 */
export abstract class LatestCheckinPort {
  abstract latestMood(userId: string): Promise<number | null>;
}

// ------------------------------------------------- the turn's own collaborators

/**
 * Turns the member's sentence into an `Intent`.
 *
 * An abstract class rather than an interface so it is its own DI token — a
 * constructor parameter typed as an interface emits no runtime token and fails
 * at boot rather than at build, which has cost this codebase a deploy before.
 */
export abstract class IntentExtractorPort {
  /**
   * Returns `PLAIN_CHAT` and never null on failure.
   *
   * Null would put a "did the extractor work" branch in the turn, and the
   * honest answer to a malformed extraction is "treat it as conversation" —
   * which `PLAIN_CHAT` already is. The failure is logged, not surfaced: a
   * member who asked a question does not need to hear about a JSON parse.
   */
  abstract extract(input: {
    text: string;
    now: Date;
    timezone: string;
  }): Promise<Intent>;
}

/** What the executor did, and what the member should be told about it. */
export interface ExecutionResult {
  /** The reply text. Always present — every branch says something. */
  reply: string;
  /** A structured list, for `chat.card`. */
  card?: { kind: string; items: CardItem[] };
  /** What actually happened, for `chat.done`'s `actions`. */
  actions: Array<{ kind: string; id?: string }>;
  /**
   * True when the executor is *asking* rather than reporting — a missing
   * field, or two matches for a cancel.
   *
   * The turn needs to know because a question is not a completed action: the
   * member's next message is the answer to it, and nothing was stored.
   */
  asking: boolean;
}

export abstract class IntentExecutorPort {
  abstract execute(input: {
    userId: string;
    intent: Intent;
    text: string;
    now: Date;
    facts: MemberFacts;
  }): Promise<ExecutionResult>;
}

/** Builds the messages a chat turn sends to the model. */
export abstract class PromptAssemblerPort {
  abstract build(input: {
    userId: string;
    kind: string;
    text: string;
    conversationId: string;
    floorSeq: number;
    now: Date;
    facts: MemberFacts;
  }): Promise<Array<{ role: 'system' | 'user' | 'assistant'; content: string }>>;
}

/**
 * Watches an answer being written and stops it naming a declared allergen.
 *
 * Stateful per turn, which is why it is a factory rather than a method: it
 * accumulates the text as chunks arrive, because streaming means there is no
 * finished answer to inspect at the end and the whole point is that the word
 * never reaches the member.
 */
export abstract class AllergenGuardPort {
  abstract forMember(allergies: string[]): AllergenScan;
}

export interface AllergenScan {
  /**
   * Feed the next chunk. Returns the allergen that was named, or null.
   *
   * The chunk boundary is not the word boundary — a model can emit "pea", "nut"
   * — so an implementation has to scan the accumulated text and not the chunk.
   */
  push(chunk: string): string | null;
}

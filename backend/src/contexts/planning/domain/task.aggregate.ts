import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';
import { Recurrence, type RecurrenceRule } from './recurrence.js';

/** P1 is highest. Four levels, borrowed from every task manager that works. */
export type Priority = 1 | 2 | 3 | 4;

/**
 * `open → completed | cancelled`, and back to `open` by reopening.
 *
 * Cancelled is not a synonym for completed and not a synonym for deleted: it is
 * "this was never going to happen", which is a different fact about the member's
 * week than "I did it" or "I do not want to see it". The Deleted view exists to
 * show which of the three a removed task was, which is why **deleting never
 * touches the status**.
 */
export type TaskStatus = 'open' | 'completed' | 'cancelled';

/** Where the row came from, for the member's own benefit when they wonder. */
export type TaskSource = 'app' | 'chat' | 'extension' | 'rhythm';

/** The label's name and colour, snapshotted so a list renders in one read. */
export interface LabelSnapshot {
  name: string;
  color: string;
}

export interface TaskState {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  dueAt: Date | null;
  allDay: boolean;
  priority: Priority;
  labelId: string | null;
  label: LabelSnapshot | null;
  status: TaskStatus;
  completedAt: Date | null;
  recurrence: RecurrenceRule | null;
  estimatedMinutes: number | null;
  deferCount: number;
  deferredFrom: Date | null;
  source: TaskSource;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export const MAX_TITLE_LENGTH = 500;
export const MAX_NOTES_LENGTH = 20_000;

/** What a client may change on an existing task. */
export interface TaskPatch {
  title?: string;
  notes?: string | null;
  dueAt?: Date | null;
  allDay?: boolean;
  priority?: Priority;
  labelId?: string | null;
  label?: LabelSnapshot | null;
  recurrence?: RecurrenceRule | null;
  estimatedMinutes?: number | null;
}

/** Refused rather than corrected, so the caller can say why. */
export class TaskRuleError extends Error {
  constructor(
    readonly code:
      | 'title_required'
      | 'bad_priority'
      | 'bad_recurrence'
      | 'not_deleted'
      | 'already_open',
    message: string,
  ) {
    super(message);
    this.name = 'TaskRuleError';
  }
}

/**
 * One task, and for a repeating one, one *series*.
 *
 * The aggregate holds three rules that have each been got wrong before, here or
 * in v1, and each is enforced in one place so it cannot be got wrong per
 * caller:
 *
 * 1. **Deleting does not touch the status.** `tombstone` sets `deletedAt` and
 *    nothing else. The status is the only record of whether the thing was
 *    completed, cancelled or never dealt with, and the Deleted view exists to
 *    show exactly that.
 * 2. **Deferring is deferring, wherever it came from.** `defer` increments the
 *    count and records where the task came from. The nightly rollover calls
 *    this same method rather than moving `dueAt` itself, so "carried over ×3"
 *    is true whether the member pushed it or the rhythm did.
 * 3. **A completed occurrence advances the series rather than ending it.** One
 *    row per series, so completing a repeating task closes the current
 *    occurrence and re-arms the same document.
 */
export class Task extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  title: string;
  notes: string | null;
  dueAt: Date | null;
  allDay: boolean;
  priority: Priority;
  labelId: string | null;
  label: LabelSnapshot | null;
  status: TaskStatus;
  completedAt: Date | null;
  recurrence: RecurrenceRule | null;
  estimatedMinutes: number | null;
  deferCount: number;
  deferredFrom: Date | null;
  readonly source: TaskSource;
  readonly createdAt: Date;
  deletedAt: Date | null;

  private constructor(state: TaskState) {
    super();
    this.id = state.id;
    this.userId = state.userId;
    this.title = state.title;
    this.notes = state.notes;
    this.dueAt = state.dueAt;
    this.allDay = state.allDay;
    this.priority = state.priority;
    this.labelId = state.labelId;
    this.label = state.label;
    this.status = state.status;
    this.completedAt = state.completedAt;
    this.recurrence = state.recurrence;
    this.estimatedMinutes = state.estimatedMinutes;
    this.deferCount = state.deferCount;
    this.deferredFrom = state.deferredFrom;
    this.source = state.source;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
    this.deletedAt = state.deletedAt;
  }

  static rehydrate(state: TaskState): Task {
    return new Task(state);
  }

  /**
   * A new task, with the id the client minted.
   *
   * The id arrives from outside because the phone creates tasks with no network
   * and needs a stable reference before the server has ever seen the row. The
   * handler's replay check turns a retried create into the create that already
   * happened; this method only ever runs for one that is genuinely new.
   */
  static schedule(
    state: Omit<
      TaskState,
      | 'updatedAt'
      | 'deletedAt'
      | 'completedAt'
      | 'deferCount'
      | 'deferredFrom'
      | 'status'
    > & {
      timezone: string;
    },
  ): Task {
    const title = requireTitle(state.title);
    requirePriority(state.priority);
    const recurrence = validatedRecurrence(state.recurrence, state.timezone);

    const task = new Task({
      ...state,
      title,
      notes: truncateNotes(state.notes),
      recurrence,
      status: 'open',
      completedAt: null,
      deferCount: 0,
      deferredFrom: null,
      deletedAt: null,
      updatedAt: state.createdAt,
    });

    task.announceScheduled(state.createdAt);
    return task;
  }

  /**
   * A patch, and one event describing what it did to the alerts.
   *
   * `TaskRescheduled` goes out when any field the notification is *built from*
   * moved — the moment, whether it is timed, or the title that appears on the
   * member's lock screen. A colour or a note changing is not something
   * Notifications has any use for, and raising for it would wake the saga to
   * re-plan an identical set several times a minute while somebody types.
   */
  edit(patch: TaskPatch, timezone: string, at: Date = new Date()): string[] {
    const changed: string[] = [];

    if (patch.title !== undefined) {
      const title = requireTitle(patch.title);
      if (title !== this.title) {
        this.title = title;
        changed.push('title');
      }
    }

    if (patch.notes !== undefined) {
      const notes = truncateNotes(patch.notes);
      if (notes !== this.notes) {
        this.notes = notes;
        changed.push('notes');
      }
    }

    if (patch.dueAt !== undefined && !sameInstant(patch.dueAt, this.dueAt)) {
      this.dueAt = patch.dueAt;
      changed.push('dueAt');
    }

    if (patch.allDay !== undefined && patch.allDay !== this.allDay) {
      this.allDay = patch.allDay;
      changed.push('allDay');
    }

    if (patch.priority !== undefined) {
      requirePriority(patch.priority);
      if (patch.priority !== this.priority) {
        this.priority = patch.priority;
        changed.push('priority');
      }
    }

    if (patch.labelId !== undefined && patch.labelId !== this.labelId) {
      this.labelId = patch.labelId;
      // A task with no label carries no snapshot. Leaving a stale one behind
      // would render the label the member just removed.
      this.label = patch.labelId === null ? null : (patch.label ?? this.label);
      changed.push('labelId');
    } else if (patch.label !== undefined) {
      this.label = patch.label;
      changed.push('label');
    }

    if (patch.recurrence !== undefined) {
      const recurrence = validatedRecurrence(patch.recurrence, timezone);
      this.recurrence = recurrence;
      changed.push('recurrence');
    }

    if (
      patch.estimatedMinutes !== undefined &&
      patch.estimatedMinutes !== this.estimatedMinutes
    ) {
      this.estimatedMinutes = patch.estimatedMinutes;
      changed.push('estimatedMinutes');
    }

    if (changed.length === 0) return changed;

    this.updatedAt = at;
    if (changed.some((field) => ALERT_FIELDS.has(field))) {
      this.raise(
        'planning.TaskRescheduled',
        'task',
        this.alertFacts(),
        at,
      );
    }
    return changed;
  }

  /**
   * Done.
   *
   * For a one-off task that is the end of it. For a series it is the end of
   * *this* occurrence: the next moment is computed, `dueAt` moves to it, and the
   * task stays open. The event carries `recurrenceAdvancedTo` so a consumer can
   * tell "finished for ever" from "finished for now" without re-deriving the
   * rule, and `TaskScheduled` follows for the new moment because the alerts for
   * it have to be planned.
   *
   * Which moment the advance is measured from is the mode's whole purpose, and
   * `Recurrence` owns that decision — see its comments for why "every two weeks"
   * and "every two weeks after I do it" are different tasks.
   */
  complete(timezone: string, at: Date = new Date()): Date | null {
    const advancedTo = this.nextOccurrenceAfterCompleting(timezone, at);

    if (advancedTo) {
      this.dueAt = advancedTo;
      this.completedAt = null;
      this.status = 'open';
      // The occurrence that was just finished is not an exception: the rule
      // still describes it, and the member did it. Only a *skip* is an
      // exception, which is why `skipOccurrence` is a separate operation.
      this.updatedAt = at;
      this.raise(
        'planning.TaskCompleted',
        'task',
        { taskId: this.id, at, recurrenceAdvancedTo: advancedTo },
        at,
      );
      this.announceScheduled(at);
      return advancedTo;
    }

    this.status = 'completed';
    this.completedAt = at;
    this.updatedAt = at;
    this.raise('planning.TaskCompleted', 'task', { taskId: this.id, at }, at);
    return null;
  }

  /**
   * Where the next occurrence lands, or null when there is not one.
   *
   * Separate from `complete` so the read side can show "next: Tuesday" without
   * completing anything, and so a rule the library refuses degrades to "this
   * task simply completes" rather than throwing on the operation the member most
   * wants to succeed. A rule that cannot be parsed is refused at the *write*,
   * which is where it can be explained.
   */
  nextOccurrenceAfterCompleting(
    timezone: string,
    completedAt: Date,
  ): Date | null {
    if (!this.recurrence) return null;
    const rule = Recurrence.parse(this.recurrence, timezone);
    if (!rule) return null;

    const measuredFrom =
      rule.mode === 'completion' ? completedAt : (this.dueAt ?? completedAt);
    return rule.next(measuredFrom, timezone);
  }

  /** Back to open. Raises `TaskScheduled` because its alerts want planning again. */
  reopen(at: Date = new Date()): void {
    if (this.status === 'open') {
      throw new TaskRuleError('already_open', 'This task is already open.');
    }
    this.status = 'open';
    this.completedAt = null;
    this.updatedAt = at;
    this.announceScheduled(at);
  }

  /** Never going to happen. Distinct from completed and from deleted. */
  cancel(at: Date = new Date()): void {
    this.status = 'cancelled';
    this.completedAt = null;
    this.updatedAt = at;
    this.raise('planning.TaskCancelled', 'task', { taskId: this.id, at }, at);
  }

  /**
   * Moved to another day, and counted.
   *
   * The count and `deferredFrom` are what let the evening prompt say "this has
   * been carried over three times" — the sentence that makes a member either do
   * the thing or admit they are not going to. Both are properties of deferring,
   * so the nightly rollover comes through here rather than writing `dueAt`
   * itself; there is one definition of what a deferral is.
   */
  defer(toDate: Date, at: Date = new Date()): void {
    const fromDate = this.dueAt;
    this.deferredFrom = fromDate;
    this.dueAt = toDate;
    this.deferCount += 1;
    this.updatedAt = at;
    this.raise(
      'planning.TaskDeferred',
      'task',
      { taskId: this.id, fromDate, toDate, deferCount: this.deferCount },
      at,
    );
    /*
     * And the moment moved, which is a different fact for a different reader.
     *
     * `TaskDeferred` says "this has now been carried N times" and its only
     * consumer is the rhythm's evening prompt, which prints the count.
     * Notifications listens to `TaskRescheduled` and to nothing else — so
     * without this second raise, deferring a task moved its due date and left
     * every alert sitting at the old moment. A member who swiped tonight's
     * task to tomorrow still got tonight's notification, and from P3 the
     * nightly rollover does that to every unfinished task every night.
     *
     * Two events for one change, deliberately: they are not the same statement,
     * and collapsing them would mean either the rhythm parsing a reschedule for
     * a count that is not in it, or Notifications subscribing to an event whose
     * name is about bookkeeping.
     */
    this.raise('planning.TaskRescheduled', 'task', this.alertFacts(), at);
  }

  /**
   * Removed from view, and **nothing else**.
   *
   * The status is untouched on purpose and this is the third comment saying so,
   * because it is the rule most likely to be "tidied up" by somebody who reads
   * `deletedAt` and `status: 'open'` on one row as an inconsistency. It is not:
   * the Deleted view shows the member which of their removed tasks they had
   * actually finished, and rewriting the status here destroys the only copy of
   * that fact.
   */
  tombstone(at: Date = new Date()): void {
    this.deletedAt = at;
    this.updatedAt = at;
    this.raise('planning.TaskDeleted', 'task', { taskId: this.id, at }, at);
  }

  /** Back from the Deleted view, with its status exactly as it was. */
  restore(at: Date = new Date()): void {
    this.deletedAt = null;
    this.updatedAt = at;
    this.announceScheduled(at);
  }

  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  /**
   * Gone for good. Guarded, because a purge of a live row is data loss dressed
   * as housekeeping — the sweep purges by the tombstone horizon, and a client
   * asking to erase something it has not deleted is a client with a bug.
   */
  assertPurgeable(): void {
    if (!this.isDeleted) {
      throw new TaskRuleError(
        'not_deleted',
        'Only a deleted task can be erased.',
      );
    }
  }

  /**
   * "Not this one." The occurrence joins the exception list and the series moves
   * to the one after it.
   *
   * An exception rather than an edit, which is what keeps the series intact: a
   * member who skips next Tuesday still has a task every Tuesday, and the rule
   * still says so.
   */
  skipOccurrence(
    occurrence: Date,
    timezone: string,
    at: Date = new Date(),
  ): Date | null {
    if (!this.recurrence) {
      throw new TaskRuleError(
        'bad_recurrence',
        'This task does not repeat, so there is nothing to skip.',
      );
    }
    const rule = Recurrence.parse(this.recurrence, timezone);
    if (!rule) {
      throw new TaskRuleError(
        'bad_recurrence',
        'This task’s repeat rule cannot be read.',
      );
    }

    this.recurrence = rule.skip(occurrence);
    const reparsed = Recurrence.parse(this.recurrence, timezone);
    const next = reparsed?.next(occurrence, timezone) ?? null;
    this.dueAt = next;
    this.updatedAt = at;
    this.raise(
      'planning.TaskRescheduled',
      'task',
      this.alertFacts(),
      at,
    );
    return next;
  }

  /**
   * The label snapshot, refreshed because the label itself was renamed or
   * recoloured. Silent by design: it is a projection catching up, not a change
   * the member made, and announcing it would have the alert saga re-plan every
   * task carrying a label somebody recoloured.
   */
  refreshLabel(snapshot: LabelSnapshot | null, at: Date = new Date()): boolean {
    if (
      this.label?.name === snapshot?.name &&
      this.label?.color === snapshot?.color
    ) {
      return false;
    }
    this.label = snapshot;
    this.updatedAt = at;
    return true;
  }

  private announceScheduled(at: Date): void {
    this.raise(
      'planning.TaskScheduled',
      'task',
      { ...this.alertFacts(), priority: this.priority },
      at,
    );
  }

  /**
   * Everything Notifications builds an alert out of, in one place.
   *
   * This method exists because of three defects that were all the same defect,
   * and all of them live until this phase found them while wiring the nightly
   * rollover. `PlanAlertsSaga.onTaskScheduled` reads `dueAt`, `allDay` and
   * `title` off the payload, with `title ?? 'Task due'` and
   * `timed: allDay === false` as its fallbacks — and:
   *
   * 1. **Neither event carried `title`.** So `?? 'Task due'` fired every time
   *    and *every task notification in the product said "Task due"* rather
   *    than naming the task. Nothing failed; the member's lock screen was
   *    simply useless.
   * 2. **`TaskRescheduled` carried no `allDay`.** `undefined === false` is
   *    false, so `timed` came out false and the reconcile dropped every lead
   *    time — a member with `['1h','1d']` who moved a task lost both warnings
   *    and kept only the moment itself. Editing a task quietly cancelled the
   *    warnings the member had asked for.
   * 3. **`defer` raised no reschedule at all**, so the alerts stayed where they
   *    were.
   *
   * One method, called from all four raise sites, is what stops the fourth
   * site from being written without them. A payload built inline is a payload
   * that can omit a field the consumer reads, and the type system cannot say so
   * because a domain event's payload is `unknown` by the time it reaches a
   * handler.
   */
  private alertFacts(): {
    taskId: string;
    dueAt: Date | null;
    allDay: boolean;
    title: string;
  } {
    return {
      taskId: this.id,
      dueAt: this.dueAt,
      allDay: this.allDay,
      title: this.title,
    };
  }
}

/**
 * The fields an alert is built from. A change to one of these means the
 * notification the member would receive is now wrong, which is the only reason
 * to wake the planning saga.
 */
const ALERT_FIELDS = new Set(['title', 'dueAt', 'allDay', 'recurrence']);

function requireTitle(raw: string): string {
  const title = raw.trim().slice(0, MAX_TITLE_LENGTH);
  if (title === '') {
    throw new TaskRuleError('title_required', 'A task needs a title.');
  }
  return title;
}

function truncateNotes(notes: string | null | undefined): string | null {
  if (notes === null || notes === undefined) return null;
  const trimmed = notes.slice(0, MAX_NOTES_LENGTH);
  return trimmed === '' ? null : trimmed;
}

function requirePriority(priority: number): void {
  if (![1, 2, 3, 4].includes(priority)) {
    throw new TaskRuleError('bad_priority', 'Priority is P1 to P4.');
  }
}

/**
 * A rule the library refuses is refused here, at the write, where the member
 * can be told what is wrong with it. Accepting it would leave a task that
 * cannot be completed — the advance would fail on the one operation that
 * matters — and the failure would surface days later with no clue why.
 */
function validatedRecurrence(
  recurrence: RecurrenceRule | null | undefined,
  timezone: string,
): RecurrenceRule | null {
  if (!recurrence) return null;
  if (!Recurrence.parse(recurrence, timezone)) {
    throw new TaskRuleError(
      'bad_recurrence',
      `Cannot read the repeat rule "${recurrence.rrule}".`,
    );
  }
  return { ...recurrence, exdates: [...recurrence.exdates] };
}

function sameInstant(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}

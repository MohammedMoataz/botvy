import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';

/**
 * What an alert is *about*. Every later phase adds a kind rather than a
 * pipeline: a meeting's prep block, the evening prompt and a training session
 * all want the same claim-before-send delivery, and adding a kind here is how
 * they get it.
 */
export type AlertSourceKind =
  'reminder' | 'task' | 'meeting' | 'rhythm' | 'suggestion';

export interface AlertSource {
  kind: AlertSourceKind;
  id: string;
  /**
   * Which occurrence of a repeating source, or null for a one-off.
   *
   * Part of the uniqueness key, which is why it is `null` rather than absent
   * for a one-off: the partial unique index is built on this field *existing*,
   * so every alert must carry it. See the migration's own comment — Mongo reads
   * a missing field and a null as the same value for uniqueness, so a field
   * that is sometimes absent cannot be part of a unique key without a partial
   * filter, and the filter needs something to test.
   */
  occurrenceAt: Date | null;
}

/**
 * Which warning this is.
 *
 * `0m` is special and the specialness is the whole quiet-hours rule: it means
 * "the moment the member themselves chose". Every other label is a warning the
 * *system* derived from that moment, and only derived warnings may be moved.
 */
export type AlertLabel = string;

/** The label meaning "at the moment the member picked". Never shifted. */
export const MEMBER_CHOSEN_LABEL = '0m';

export interface AlertState {
  id: string;
  userId: string;
  source: AlertSource;
  label: AlertLabel;
  notifyAt: Date;
  title: string;
  body: string;
  deepLink: string;
  plannedAt: Date;
  claimedAt: Date | null;
  sentAt: Date | null;
  failedAt: Date | null;
  error: string | null;
  updatedAt: Date;
}

/**
 * One notification the server intends to send, or has.
 *
 * ## Why alerts are their own context rather than fields on a task
 *
 * Because five kinds of thing want the same delivery, and the delivery is the
 * hard part: claim a row atomically so two sweeps cannot both send it, skip the
 * devices that already hold their own local alarm, hold a derived warning until
 * quiet hours are over, expire what is too late to be useful. Per-source
 * scheduling would duplicate all four, three times, and they would drift.
 *
 * ## `plannedAt` is not decoration beside `notifyAt`
 *
 * `notifyAt` is when the member should hear about it. `plannedAt` is when the
 * server decided that. The sweep skips any device whose `lastSeenAt` is at or
 * after `plannedAt`, because such a device has synced *since the plan was made*
 * and therefore already holds this alarm locally — the phone schedules its own,
 * so they work with the network off, and the server sweep is only the fallback.
 *
 * Without that comparison the member is notified twice for one thing. With it
 * comparing the wrong field — `notifyAt`, say — a device that synced yesterday
 * would be considered up to date about an alert planned this morning, and
 * nobody would be notified at all.
 */
export class Alert extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  readonly source: AlertSource;
  readonly label: AlertLabel;
  notifyAt: Date;
  title: string;
  body: string;
  deepLink: string;
  plannedAt: Date;
  claimedAt: Date | null;
  sentAt: Date | null;
  failedAt: Date | null;
  error: string | null;

  private constructor(state: AlertState) {
    super();
    this.id = state.id;
    this.userId = state.userId;
    this.source = state.source;
    this.label = state.label;
    this.notifyAt = state.notifyAt;
    this.title = state.title;
    this.body = state.body;
    this.deepLink = state.deepLink;
    this.plannedAt = state.plannedAt;
    this.claimedAt = state.claimedAt;
    this.sentAt = state.sentAt;
    this.failedAt = state.failedAt;
    this.error = state.error;
    this.updatedAt = state.updatedAt;
  }

  static rehydrate(state: AlertState): Alert {
    return new Alert(state);
  }

  /**
   * Planned. Raises nothing: the *source* event is what other contexts reacted
   * to, and an alert coming into existence is this context's private business
   * until it is actually sent.
   */
  static plan(
    state: Omit<
      AlertState,
      'claimedAt' | 'sentAt' | 'failedAt' | 'error' | 'updatedAt'
    >,
  ): Alert {
    return new Alert({
      ...state,
      claimedAt: null,
      sentAt: null,
      failedAt: null,
      error: null,
      updatedAt: state.plannedAt,
    });
  }

  /** True while nobody has taken it and it has not gone out. */
  get isPending(): boolean {
    return this.sentAt === null && this.claimedAt === null;
  }

  get isSent(): boolean {
    return this.sentAt !== null;
  }

  /**
   * The moment moved, so re-plan rather than re-create.
   *
   * `plannedAt` moves with it, and that is the point: the sweep's device filter
   * compares against `plannedAt`, so a re-planned alert is correctly treated as
   * news that every device has yet to hear — including one that synced five
   * minutes ago, which holds an alarm for the *old* moment and needs telling.
   */
  replan(notifyAt: Date, title: string, at: Date = new Date()): boolean {
    if (
      this.notifyAt.getTime() === notifyAt.getTime() &&
      this.title === title &&
      this.claimedAt === null
    ) {
      return false;
    }
    this.notifyAt = notifyAt;
    this.title = title;
    this.plannedAt = at;
    // A re-planned alert is pending again. It has not been sent — the caller
    // only re-plans unsent rows — and clearing the claim releases one that a
    // crashed sweep took and never finished.
    this.claimedAt = null;
    this.failedAt = null;
    this.error = null;
    this.updatedAt = at;
    return true;
  }

  /**
   * Taken by one sweep, exclusively.
   *
   * The aggregate's half of a rule the *store* enforces: the Mongo adapter's
   * `claim` is a `findOneAndUpdate` filtered on `claimedAt: null`, so exactly
   * one of two concurrent sweeps gets the row and the other gets nothing. This
   * method exists so the in-memory adapter and the handler agree about what a
   * successful claim leaves behind, and it returns false rather than throwing
   * because losing a race is ordinary rather than exceptional.
   */
  claim(at: Date = new Date()): boolean {
    if (this.claimedAt !== null || this.sentAt !== null) return false;
    this.claimedAt = at;
    this.updatedAt = at;
    return true;
  }

  /** Delivered, to these devices. This is the event other contexts react to. */
  markSent(deviceIds: string[], at: Date = new Date()): void {
    this.sentAt = at;
    this.failedAt = null;
    this.error = null;
    this.updatedAt = at;
    this.raise(
      'notifications.AlertSent',
      'alert',
      { alertId: this.id, source: this.source, deviceIds },
      at,
    );
  }

  /**
   * Not delivered, and why.
   *
   * The claim is released so a later sweep can try again, but `failedAt` and
   * `error` stay — a row that keeps failing is a row somebody needs to see, and
   * clearing the reason on every retry would make a permanent failure look like
   * a fresh one for ever.
   */
  markFailed(error: string, at: Date = new Date()): void {
    this.claimedAt = null;
    this.failedAt = at;
    this.error = error.slice(0, 500);
    this.updatedAt = at;
    this.raise(
      'notifications.AlertFailed',
      'alert',
      {
        alertId: this.id,
        source: this.source,
        deviceIds: [],
        error: this.error,
      },
      at,
    );
  }

  /**
   * Too late to be worth sending.
   *
   * Silent, deliberately. An expired alert is one the member did not get and
   * now must not get — telling them about yesterday's reminder at nine o'clock
   * this morning is worse than saying nothing, because they will act on it.
   * `AlertFailed` would be wrong here too: nothing failed, the moment simply
   * passed, and a subscriber counting failures should not count this.
   */
  expire(at: Date = new Date()): void {
    this.sentAt = at;
    this.failedAt = at;
    this.error = 'expired';
    this.updatedAt = at;
  }

  /**
   * The uniqueness key, matching the partial unique index from the migration.
   *
   * One alert per (member, source, occurrence, label) is what makes the
   * planning saga idempotent: source events arrive at least once, so the same
   * `TaskScheduled` delivered twice must reconcile to the same single row
   * rather than plan a second.
   */
  get key(): string {
    return alertKey(this.source, this.label);
  }

  /** True for a warning the system derived, which quiet hours may move. */
  get isDerived(): boolean {
    return this.label !== MEMBER_CHOSEN_LABEL;
  }
}

export function alertKey(source: AlertSource, label: AlertLabel): string {
  return `${source.kind}:${source.id}:${source.occurrenceAt?.getTime() ?? 'once'}:${label}`;
}

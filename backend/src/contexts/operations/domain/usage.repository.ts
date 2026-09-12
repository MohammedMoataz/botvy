/**
 * One model call, as Operations records it.
 *
 * `eventId` is the envelope's id of the `conversations.MessageSent` that
 * carried the counts, and it is on the row rather than merely used to write it
 * because it is the only thing that makes a redelivery harmless. The relay
 * delivers **at least** once; a member's daily allowance that double-counts a
 * replayed event is an allowance that runs out early for reasons nobody can
 * reconstruct afterwards, since the second row is indistinguishable from a real
 * second turn once it is written.
 *
 * `createdAt` is the event's `occurredAt`, not the moment the row was inserted.
 * The window query is what reads it, and the question it answers is "what did
 * this member spend during their day" — which is about when the turn happened,
 * not about when the relay got round to forwarding it. A relay that catches up
 * at 00:05 after being down would otherwise bill yesterday's turns to today,
 * and the member would find their allowance already spent on waking.
 */
export interface UsageRow {
  userId: string;
  /** `chat`, `intent`, `summarize`, `suggest` or `plan`. */
  kind: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  ms: number;
  eventId: string;
  createdAt: Date;
}

/**
 * `usage_log`'s only writer and its only reader, and the whole of the crossing
 * between Conversations and Operations.
 *
 * Conversations never opens `usage_log` and Operations never opens `messages`
 * (constitution I). The loop is `conversations.MessageSent` carrying the turn's
 * counts one way and `UsageTodayQuery` going back the other. **Without it the
 * daily allowance sums an empty collection and every member sits permanently at
 * zero used — a limit that silently does not exist**, which is the defect the
 * analysis pass found and the reason this port exists at all.
 *
 * ## Append-only, deliberately, and that is why there is no `save`
 *
 * There is no aggregate behind this and no optimistic check: nothing ever
 * modifies a row. `shared/persistence/mongo/schemas.spec.ts` lists `usage_log`
 * as an explicit exemption from `MongoRepositoryBase` with that reason, in the
 * same change that added the collection. The port has three methods and offers
 * no update, so there is no edit for a caller to reach for — the same argument
 * `AuditPort` makes: a record that can be edited is not a record.
 *
 * `append` reports which of the two things happened rather than returning void,
 * because "the second delivery of this event wrote nothing" is the assertion the
 * spec needs and the line an operator wants in the log when they are asking why
 * a number looks low.
 */
export abstract class UsageRepository {
  abstract append(row: UsageRow): Promise<'appended' | 'already-recorded'>;

  /**
   * The sum of `promptTokens + completionTokens` over `[from, to)`.
   *
   * A pair of instants, never a date. `from` and `to` are the member's **own**
   * local midnights, resolved by the caller through `shared/time`, so a member
   * in Cairo and a member in Berlin get their own days and the quota error can
   * name the reset in the member's own wall clock. Handing this port a date and
   * letting it decide whose midnight it meant is exactly the mistake that once
   * shifted every extracted reminder by three hours, and the API must never read
   * its own `TZ` for a user-facing boundary.
   *
   * Half-open on purpose: `to` is the *next* midnight, and a row stamped exactly
   * on it belongs to tomorrow. Closing the interval at both ends would count a
   * turn made at midnight against both days.
   */
  abstract tokensBetween(userId: string, from: Date, to: Date): Promise<number>;

  /**
   * What the model was asked to do over a range, grouped (P10, FR-011).
   *
   * By **day, kind and model** always, and by member as well when `byMember` is
   * set — which is the one grouping the Owner uses to find a runaway loop,
   * because a total that has doubled says nothing about whose it is.
   *
   * The day is `YYYY-MM-DD` in **UTC**, deliberately and unlike every other
   * date in this product. Every other one is a member's own day, resolved
   * against their zone (principle XI); this one is the *operator's* view across
   * every member at once, and there is no single member whose midnight it could
   * use. A per-member row in one member's zone and a total row in another's
   * would not add up, which is worse than a boundary the Owner has to know
   * about — so the column says UTC on the screen.
   *
   * `[from, to)`, half-open, matching `tokensBetween`: a call at exactly `to`
   * belongs to the next range, and closing both ends would count it twice on a
   * screen whose whole purpose is arithmetic.
   */
  abstract aggregate(filter: UsageFilter): Promise<UsageAggregate[]>;

  /** Every row of a member who no longer exists. Returns how many went. */
  abstract removeAllFor(userId: string): Promise<number>;
}

export interface UsageFilter {
  from: Date;
  to: Date;
  /** One member, or every member when absent. */
  userId?: string | null;
  /** Group by member as well as by day, kind and model. */
  byMember?: boolean;
}

/** One group: a day, a kind, a model, and optionally a member. */
export interface UsageAggregate {
  /** `YYYY-MM-DD`, UTC. See `aggregate`. */
  day: string;
  kind: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  calls: number;
  /** Non-null only when the query grouped by member. */
  userId: string | null;
}

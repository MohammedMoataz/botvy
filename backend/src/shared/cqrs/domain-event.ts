/**
 * The domain-event envelope, verbatim from the blueprint's `contracts/events.md`
 * — same field set, same order. P0 does not get to invent a dialect: the
 * envelope is what n8n subscribers and every later context read, and a field
 * added here later would have to be back-filled everywhere at once.
 */
export interface DomainEvent<Payload = unknown> {
  eventId: string;
  name: string;
  context: string;
  aggregate: { type: string; id: string };
  userId: string | null;
  occurredAt: Date;
  payload: Payload;
  schemaVersion: number;
}

/** The current envelope version. Bumped only when the envelope itself changes. */
export const EVENT_SCHEMA_VERSION = 1;

/**
 * Splits `<context>.<Event>` into its two halves. The `identity_outbox` table
 * carries no `context` column on purpose — one source for a value cannot drift
 * from itself, two columns holding the same fact can — so the forwarder derives
 * it here when it writes the Mongo row.
 */
export function contextOf(eventName: string): string {
  const dot = eventName.indexOf('.');
  if (dot <= 0) {
    throw new Error(
      `Event name "${eventName}" is not "<context>.<Event>"; the outbox derives context from the name.`,
    );
  }
  return eventName.slice(0, dot);
}

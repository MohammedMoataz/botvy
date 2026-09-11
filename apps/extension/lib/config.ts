/**
 * The constants both contexts share.
 *
 * Tokens, the gateway address and the cached profile moved to `session.ts`,
 * which is the one place that reads or clears them — sign-out has to clear
 * everything the member left behind, and the way that goes wrong is a key
 * written in one file and forgotten in another.
 */

/** What the worker and the panel say to each other. */
export const MESSAGES = {
  /**
   * Something changed elsewhere and this surface should catch up.
   *
   * The whole push path for this surface, and there is no other one: **FCM
   * does not work in an extension**, so `sync.nudge` over the socket is how the
   * extension learns that something changed on the member's phone. The worker
   * owns the socket and the panel owns the round trip, so the nudge crosses
   * between them.
   */
  nudge: 'botvy.sync.nudge',
  /** The panel opened, or the member asked for a pass. */
  syncNow: 'botvy.sync.now',
  /**
   * Capture happened while the panel was shut.
   *
   * The worker queues the row itself, so this is only an invitation to redraw —
   * a panel that is closed misses it and picks the row up from Dexie when it
   * next mounts, which is why nothing is carried in the message.
   */
  captured: 'botvy.captured',
  /** Open the Add form with this text already in it (the keyboard command). */
  compose: 'botvy.compose',
} as const;

export type ExtensionMessage =
  | { type: typeof MESSAGES.nudge; entities?: string[] }
  | { type: typeof MESSAGES.syncNow }
  | { type: typeof MESSAGES.captured }
  | { type: typeof MESSAGES.compose; title: string; url?: string };

/** Kept for the modules that still import it by its old name. */
export const SYNC_NUDGE_MESSAGE = MESSAGES.nudge;

/**
 * The entities this surface holds, and the ones it asks to be nudged about.
 *
 * The blueprint's subset for the extension. The profile is deliberately not in
 * it — the panel needs two fields from it and widening the sync contract to
 * carry them is not the way to get them; they come over GraphQL at sign-in and
 * are cached as a setting.
 */
export const SYNC_ENTITIES = [
  'labels',
  'tasks',
  'meetings',
  'calendar_events',
] as const;

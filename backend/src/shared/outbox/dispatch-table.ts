/**
 * The other half of the relay's hand-written dispatch table (E-005).
 *
 * In-process delivery is a `switch` in `relay.module.ts`, deliberately: the
 * whole event topology of the platform is readable in one file, which
 * `@EventsHandler` discovery would take away. The one thing wrong with it was
 * the failure mode — a handler that is provided in a module but not named in
 * that switch is **never called, and nothing fails**. `bootstrap-on-registered`
 * and `purge-on-deleted` were both in exactly that state, so every account
 * created got no profile and every deleted one left its photo on the volume.
 *
 * So the gap is made loud instead of silent, without giving up the table:
 *
 *   1. Every context declares the event names it subscribes to, beside its own
 *      module — `*_SUBSCRIPTIONS` at the foot of `contexts/<name>/<name>.module.ts`.
 *   2. `RelayModule` calls `assertDispatchable` while it builds the relay, so a
 *      declared name with no case **fails the process at boot**, naming the
 *      event and the handler, rather than failing quietly at three in the
 *      morning. `app.module.spec.ts` resolves the whole graph in both roles,
 *      which is what turns that into a red test rather than a red deploy.
 *   3. `DISPATCHED_EVENTS` below is the list of case labels, and
 *      `dispatch-table.spec.ts` reads `relay.module.ts` and asserts the two
 *      agree exactly — so the list cannot drift from the switch it describes in
 *      either direction, which would otherwise just be the same silence one
 *      file over.
 *
 * The declaration lives in the context's own module rather than here because
 * that file is the context's composition root: it already names the handlers,
 * and constitution IX's rule is about `domain/` and `features/`, which gain no
 * cross-context import from any of this.
 */

/**
 * Every `case` in `relay.module.ts`'s `publish` switch.
 *
 * Kept in step with it by `dispatch-table.spec.ts`, which parses the case
 * labels out of that file — a list nobody checks would be decoration.
 */
export const DISPATCHED_EVENTS: ReadonlySet<string> = new Set([
  'identity.UserRegistered',
  'identity.UserDeleted',
  'identity.PasswordChanged',
  'identity.UserBanned',
  'identity.UserUnbanned',
  'identity.DeviceRegistered',
  'identity.DeviceRemoved',
  'operations.SettingChanged',
  'profile.ProfileUpdated',
  'profile.PreferencesChanged',
  'planning.LabelUpdated',
  'planning.LabelDeleted',
  'planning.TaskScheduled',
  'planning.TaskRescheduled',
  'planning.TaskCompleted',
  'planning.TaskCancelled',
  'planning.TaskDeleted',
  'reminders.ReminderScheduled',
  'reminders.ReminderRescheduled',
  'reminders.ReminderSnoozed',
  'reminders.ReminderCompleted',
  'reminders.ReminderCancelled',
  'reminders.ReminderDeleted',
  'reminders.ReminderPurged',
  'rhythm.PlanTomorrowPrompted',
  'rhythm.MorningBriefingSent',
  'rhythm.EndOfDaySummarySent',
  'meetings.MeetingScheduled',
  'meetings.MeetingChanged',
  'meetings.OccurrenceSkipped',
  'meetings.OccurrenceMoved',
  'meetings.MeetingCompleted',
  'meetings.MeetingCancelled',
  'meetings.MeetingDeleted',
  'training.SportsChanged',
  'training.SlotsChanged',
  'training.ProgramApplied',
  'training.SessionScheduled',
  'training.SessionRescheduled',
  'training.SessionCompleted',
  'training.SessionCancelled',
  'training.SessionSkipped',
  'training.SessionDeleted',
  'knowledge.LinkAdded',
  'knowledge.LinkStateChanged',
  'knowledge.SuggestionAccepted',
  'knowledge.SuggestionReady',
  'nutrition.MealPlanReady',
  'nutrition.MealPlanWithheld',
  'conversations.MessageSent',
  'sync.ChangesApplied',
]);

/**
 * What one context subscribes to: the event name, and the handler of its own
 * that takes it. The handler is carried so the boot failure can name it — "no
 * case for `identity.UserDeleted`" sends somebody to the switch, and "…which
 * `MeetingsPurgeOnDeletedHandler` is waiting for" tells them what to write.
 */
export type Subscriptions = Readonly<Record<string, string>>;

/**
 * Fails the boot if any context declares a subscription the table cannot
 * deliver. Reported all at once rather than one per restart.
 */
export function assertDispatchable(
  declared: Readonly<Record<string, Subscriptions>>,
): void {
  const missing: string[] = [];
  for (const [context, subscriptions] of Object.entries(declared)) {
    for (const [event, handler] of Object.entries(subscriptions)) {
      if (!DISPATCHED_EVENTS.has(event)) {
        missing.push(`${event} → ${context}'s ${handler}`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      'the outbox relay has no case for a declared subscription, so it would ' +
        `never be delivered: ${missing.join(', ')}. Add it to the switch in ` +
        'relay.module.ts and to DISPATCHED_EVENTS in dispatch-table.ts.',
    );
  }
}

/**
 * The two facts about a member that everything scheduling anything needs, and
 * that no scheduling context owns.
 *
 * Planning needs the time zone to know when "today" starts. Reminders needs it
 * to refuse a moment already behind the member's own clock. Notifications needs
 * it plus the lead times and the quiet window to know when to actually send.
 * All three facts live in Profile.
 *
 * Three contexts needing the same helper is the point at which the constitution
 * says to stop duplicating it and put it in `shared/` — the second copy is
 * cheaper than a premature abstraction, the third is a maintenance problem. So
 * this is the port, declared in the shared kernel where no context owns it, and
 * the Profile context provides the implementation. Nothing here imports Profile
 * and nothing in Planning, Reminders or Notifications learns that Profile
 * exists: they ask for `MemberContextPort` and Nest hands them Profile's
 * binding.
 *
 * Deliberately narrow. It is not "the profile" — it is the scheduling-relevant
 * slice of it, and adding a field here should feel like a decision rather than a
 * convenience, because every field widens what three contexts can see of a
 * fourth.
 */

/** Where the member is, for every "what day is it for them" question. */
export interface MemberClock {
  timezone: string;
}

/**
 * How far ahead the member wants warning, and when they do not want to be
 * disturbed.
 *
 * `leadTimes` are durations like `1h`, `0m`, `1d`, expanded by the alert
 * planning saga into one alert each. `quietHours` is a wall-clock window in the
 * member's own zone, so `{ from: '22:00', to: '07:00' }` wraps midnight and is
 * read as such.
 */
export interface MemberAlertPreferences {
  leadTimes: string[];
  quietHours: { from: string; to: string };
}

/**
 * Answers are never null.
 *
 * A member with no profile row is a member mid-bootstrap — the relay is
 * at-least-once and eventual, so there is a window after registration in which
 * the profile does not exist yet. Returning null would push a "what do I do
 * now" branch into every caller, and the honest answer is the installation
 * default: the same value the bootstrap is about to write. So the adapter falls
 * back to the settings registry and the callers stay simple.
 */
export abstract class MemberContextPort {
  abstract clock(userId: string): Promise<MemberClock>;
  abstract alertPreferences(userId: string): Promise<MemberAlertPreferences>;
}

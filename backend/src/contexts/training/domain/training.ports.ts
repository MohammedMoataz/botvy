/**
 * What Training needs and does not own.
 *
 * Declared here in `domain/` and bound in this context's own `infrastructure/`
 * to whichever context publishes the answer — the one seam constitution IX
 * sanctions, because binding a local port to somebody else's published query is
 * `infrastructure/`'s job. Nothing under `domain/` or `features/` imports
 * another context, and `no-restricted-imports` refuses it if anyone tries.
 */

/**
 * The member's own next-practice cut-off, as a `HH:mm` wall clock.
 *
 * ## Why this is a port and not `SettingsService.get('defaults.nextPracticeCutoff')`
 *
 * Constitution XII, and CLAUDE.md states the failure in as many words: *a member
 * preference is never read from the settings registry*. `nextPracticeCutoff` is
 * a `user_preferences` field seeded from `settings.defaults.*` (FR-007 makes it
 * per-member outright), so reading the registry gives the *installation* value
 * and the card silently ignores what the member set. The two agree for every
 * member who has not changed it, which is exactly what would make the bug
 * invisible — and this is the third time the project has had this decision in
 * front of it, after `defaults.meetingDurationMin` and `defaults.leadTimes`.
 *
 * ## Why not `MemberContextPort`
 *
 * That port is in `shared/` and carries the *scheduling-relevant slice three
 * contexts need* — the zone, the lead times, the quiet window. Its own comment
 * asks that adding a field feel like a decision rather than a convenience,
 * because every field widens what three contexts can see of a fourth, and the
 * cut-off is wanted by exactly one screen in one context. So it is declared
 * here, in Training, and bound in Training's own `infrastructure/` to Profile's
 * published `preferencesFor` read with the registry as the fallback — the same
 * shape and the same reasoning as Meetings' `MeetingDefaultsPort`.
 *
 * Never null: a member with no preferences row is a member mid-bootstrap, and
 * the honest answer is the installation default the bootstrap is about to write
 * with that very number in it. The adapter falls back so the caller stays
 * simple.
 */
export abstract class NextPracticeCutoffPort {
  abstract cutoffFor(userId: string): Promise<string>;
}

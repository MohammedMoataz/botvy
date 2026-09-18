import type {
  SettingKey,
  SettingValue,
} from '../settings/settings.registry.js';

/**
 * One knob a member may have turned, with the installation default behind it.
 *
 * ## Why this exists (E-020)
 *
 * Four contexts each declared their own port for one `user_preferences` field
 * and bound their own four-line adapter to Profile's published read — Meetings'
 * `MeetingDefaultsPort`, Training's `NextPracticeCutoffPort`, Knowledge's
 * `AiSuggestionsPort`, Nutrition's `MealModePort`. Every one of them was
 * *correct*; the constitution asks for exactly that shape, and reading
 * `SettingsService.get('defaults.x')` instead is the invisible bug this project
 * has declined to write five times: the two values agree for every member who
 * has not changed the setting, so the failure only ever shows for the members
 * who cared.
 *
 * What was duplicated is the part that matters — *"the member's row, else the
 * installation default"* — and the fallback is what will drift. There is one
 * copy of it now, in Profile's adapter below this port.
 *
 * ## Why a typed accessor rather than the whole document
 *
 * The obvious shape is `forMember(userId): Preferences`, and it is the wrong
 * one. A shared port carrying the whole document lets every context see every
 * field, which is precisely the widening `MemberContextPort`'s own comment was
 * written to prevent. Keyed by field, a context still *names* what it reads —
 * `get(userId, 'aiSuggestions')` at the call site — so the surface each one
 * uses stays visible to a reviewer, which is the property the four separate
 * ports had and the only one worth keeping.
 *
 * ## The type plumbing
 *
 * The field set and every value type are derived from the settings registry
 * rather than listed again: a preference *is* a `settings.defaults.*` key with
 * a member's copy in front of it, and a second list is a second place to be
 * wrong. `defaults.timezone` and `defaults.locale` are excluded because they
 * seed the **profile**, not the preferences row — `timezone` in particular is
 * deliberately not in `PREFERENCE_FIELDS`, which is why a member who moves
 * raises `ProfileUpdated` and not `PreferencesChanged`.
 *
 * A new `defaults.*` key that is not a preference will not compile until it is
 * named here, because the adapter reads the field off the preferences
 * aggregate. That is the intended failure: loud, at the one place that knows.
 */
type FieldOfDefault<K> = K extends `defaults.${infer F}` ? F : never;

/** The two `defaults.*` keys that seed the profile rather than preferences. */
type ProfileSeededField = 'timezone' | 'locale';

export type MemberPreferenceField = Exclude<
  FieldOfDefault<SettingKey>,
  ProfileSeededField
>;

export type MemberPreferences = {
  [K in MemberPreferenceField]: SettingValue<`defaults.${K}` & SettingKey>;
};

/**
 * Answers are never null.
 *
 * A member with no preferences row is a member mid-bootstrap — the relay is
 * at-least-once and eventual, so there is a window after registration in which
 * the row does not exist. Returning null would push a "what do I do now" branch
 * into every caller, and the honest answer is the installation default: the
 * very value the bootstrap is about to write.
 */
export abstract class MemberPreferencesPort {
  abstract get<K extends MemberPreferenceField>(
    userId: string,
    field: K,
  ): Promise<MemberPreferences[K]>;
}

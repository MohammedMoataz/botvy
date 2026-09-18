import {
  MemberPreferencesPort,
  type MemberPreferenceField,
  type MemberPreferences,
} from './member-preferences.port.js';

/**
 * What a handler spec binds in place of Profile's adapter.
 *
 * **It throws for a field nothing stubbed, on purpose.** The trap this port's
 * five predecessors each had to dodge is a stub that answers the registry
 * default: a member preference and its `settings.defaults.*` seed agree for
 * every member who has not changed the setting, so a spec whose stub echoes the
 * default passes whichever source the handler read — including the wrong one.
 * Refusing an unstubbed field makes the spec name the member's own value, which
 * is the only version of the assertion that can fail when a handler reaches for
 * the registry instead.
 *
 * The real adapter never throws: a member with no row gets the installation
 * default, because mid-bootstrap that is the honest answer. That asymmetry is
 * the point — production has a fallback and a test must not.
 */
export class InMemoryMemberPreferences extends MemberPreferencesPort {
  readonly chosen: Partial<MemberPreferences>;

  /**
   * How many times anything has been asked.
   *
   * A spec asserting a read was *skipped* — a guard that runs before it, an
   * early return — has nothing else to assert on: skipping a read changes no
   * output. Knowledge's saga checks the cheap condition first for exactly that
   * reason and pins it here.
   */
  reads = 0;

  constructor(chosen: Partial<MemberPreferences> = {}) {
    super();
    this.chosen = { ...chosen };
  }

  set<K extends MemberPreferenceField>(
    field: K,
    value: MemberPreferences[K],
  ): void {
    this.chosen[field] = value;
  }

  async get<K extends MemberPreferenceField>(
    _userId: string,
    field: K,
  ): Promise<MemberPreferences[K]> {
    this.reads += 1;
    const value = this.chosen[field];
    if (value === undefined) {
      throw new Error(
        `InMemoryMemberPreferences: nothing stubbed for '${field}'. Give it the member's own value — one that differs from settings.defaults.${field}, or the assertion cannot tell the two apart.`,
      );
    }
    return value;
  }
}

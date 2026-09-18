import { Injectable } from '@nestjs/common';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../../shared/member/member-context.port.js';
import { MemberBootstrapPort } from '../../../shared/member/member-bootstrap.port.js';
import {
  MemberPreferencesPort,
  type MemberPreferenceField,
  type MemberPreferences,
} from '../../../shared/member/member-preferences.port.js';
import { SettingsService } from '../../../shared/settings/settings.service.js';
import {
  PreferencesRepository,
  ProfileRepository,
} from '../domain/profile.repository.js';

/**
 * Profile's answer to the shared scheduling questions.
 *
 * This is the adapter half of `MemberContextPort`: the port lives in
 * `shared/` where no context owns it, and Profile — which owns the data —
 * provides the binding. Planning, Reminders and Notifications inject the port
 * and never learn Profile exists, which is what keeps three contexts from
 * opening a fourth's collection to find out what time it is for somebody.
 *
 * The fallback to the registry is the interesting part. `bootstrap-on-registered`
 * reacts to `identity.UserRegistered` through the relay, which is at-least-once
 * and *eventual*: for a second or two after an account is created there is no
 * profile row, and in that window a task created by the same registration flow
 * would ask this adapter what time zone the member is in. Returning null would
 * put a "no profile yet" branch into every scheduling handler; throwing would
 * fail a write for a reason the member cannot act on. So it answers with the
 * installation default — which is the same value the bootstrap is about to
 * write, so the answer is not merely safe, it is correct.
 */
@Injectable()
export class ProfileMemberContext extends MemberContextPort {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly preferences: MemberPreferencesPort,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  async clock(userId: string): Promise<MemberClock> {
    const profile = await this.profiles.find(userId);
    if (profile) return { timezone: profile.timezone, locale: profile.locale };
    // No row yet: the zone falls back to the installation's, and the language
    // is left absent rather than defaulted here — `MemberClock.locale` says
    // what an absent one means and every caller already reads it that way.
    return { timezone: await this.settings.get('defaults.timezone') };
  }

  /**
   * Two reads of one row rather than one, deliberately (E-020).
   *
   * The alternative is a second copy of "the member's row, else the
   * installation default" living here, and that fallback is the part that
   * drifts — four copies of it is what E-020 was written about. The port's
   * own surface is unchanged: Planning, Reminders and Notifications still ask
   * `alertPreferences` and still get two fields, so the narrow scheduling slice
   * this port exists to be is exactly as narrow as it was.
   */
  async alertPreferences(userId: string): Promise<MemberAlertPreferences> {
    const [leadTimes, quietHours] = await Promise.all([
      this.preferences.get(userId, 'leadTimes'),
      this.preferences.get(userId, 'quietHours'),
    ]);
    return { leadTimes, quietHours };
  }
}

/**
 * The one place "the member's row, else the installation default" is written.
 *
 * Profile owns the data, so this reads its own repository rather than its own
 * query handler — the published `preferencesFor` read exists for the *other*
 * contexts, and going through it from inside would be a view mapping for no
 * reader.
 *
 * The assignment to `MemberPreferences` is the point of the line: it is a
 * structural check that the aggregate really carries every field the port
 * promises, with the type the registry says that field has. Drop a field from
 * the aggregate, or change one's type without changing its `defaults.*` schema,
 * and this file stops compiling — which is the only reason the port can promise
 * a typed answer without a cast.
 */
@Injectable()
export class ProfileMemberPreferences extends MemberPreferencesPort {
  constructor(
    private readonly preferences: PreferencesRepository,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  async get<K extends MemberPreferenceField>(
    userId: string,
    field: K,
  ): Promise<MemberPreferences[K]> {
    const row = await this.preferences.find(userId);
    if (row) {
      const chosen: MemberPreferences = row;
      return chosen[field];
    }
    /*
     * `MemberPreferences[K]` is *defined* as `SettingValue<'defaults.' & K>`,
     * so this is the same type by construction — TypeScript simply cannot
     * reduce a mapped type through a still-generic `K`. Instantiate the method
     * with any concrete field and the two agree; the assertion buys nothing
     * beyond that and cannot hide a drift, because the line above checks the
     * aggregate against the same mapped type without one.
     */
    return (await this.settings.get(
      `defaults.${field}`,
    )) as MemberPreferences[K];
  }
}

/**
 * Profile's answer to "has this member's furniture arrived yet" (E-019).
 *
 * Both documents, because the preferences row is the one a first-run client
 * patches and the profile is written first — answering on the profile alone
 * would clear a client to make the call that is still a 404.
 *
 * Two repository reads rather than one, and they go in parallel: this is asked
 * once per sign-in and once per poll of a client that is waiting, not on any
 * hot path.
 */
@Injectable()
export class ProfileMemberBootstrap extends MemberBootstrapPort {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly preferences: PreferencesRepository,
  ) {
    super();
  }

  async isBootstrapped(userId: string): Promise<boolean> {
    const [profile, preferences] = await Promise.all([
      this.profiles.find(userId),
      this.preferences.find(userId),
    ]);
    return profile !== null && preferences !== null;
  }
}

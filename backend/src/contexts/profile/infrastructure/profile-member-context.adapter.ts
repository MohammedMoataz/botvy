import { Injectable } from '@nestjs/common';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../../shared/member/member-context.port.js';
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
    private readonly preferences: PreferencesRepository,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  async clock(userId: string): Promise<MemberClock> {
    const profile = await this.profiles.find(userId);
    if (profile) return { timezone: profile.timezone };
    return { timezone: await this.settings.get('defaults.timezone') };
  }

  async alertPreferences(userId: string): Promise<MemberAlertPreferences> {
    const preferences = await this.preferences.find(userId);
    if (preferences) {
      return {
        leadTimes: preferences.leadTimes,
        quietHours: preferences.quietHours,
      };
    }
    const [leadTimes, quietHours] = await Promise.all([
      this.settings.get('defaults.leadTimes'),
      this.settings.get('defaults.quietHours'),
    ]);
    return { leadTimes, quietHours };
  }
}

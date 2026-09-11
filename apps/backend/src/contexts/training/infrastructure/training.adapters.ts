import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../../shared/settings/settings.service.js';
import { ProfileQueryHandler } from '../../profile/features/profile-query/profile.query.js';
import { NextPracticeCutoffPort } from '../domain/training.ports.js';

/**
 * Where this context is allowed to know another exists.
 *
 * `infrastructure/` is the one layer constitution IX exempts, because binding a
 * local port to somebody else's *published* surface is exactly its job — the
 * pattern P0 established with `admin-device.lookup.ts` and every phase since
 * has repeated. Nothing in `domain/` or `features/` imports any of this, and
 * `no-restricted-imports` refuses it anywhere else: `training` was added to
 * that rule's pattern list in this phase, and the rule was probed by writing a
 * file that should fail and watching it do so.
 */

/**
 * The member's own next-practice cut-off.
 *
 * `preferencesFor` rather than the preferences collection, and the difference is
 * the whole of constitution IX: a `*.query.ts` handler is Profile's published
 * surface, and a Mongo context reaching for another context's collection — or
 * for its *feature service* — is the violation even in the permitted direction.
 *
 * The fallback is the installation default, for a member whose preferences row
 * the registration bootstrap has not written yet. That window is real: the
 * relay is at-least-once and eventual, so a member can open the Athlete screen
 * in the seconds between registering and their preferences existing. Answering
 * `null` would push a "what now" branch into the card for a value the bootstrap
 * is about to write with exactly this number in it.
 *
 * This is the third time the project has made this decision — after
 * `defaults.meetingDurationMin` in P5 and `defaults.leadTimes` in P2 — and the
 * third identical adapter. The constitution prices the third copy as the one
 * that moves to `shared/`, so it is worth saying why this one does not: the
 * three read *different* preferences for *different* contexts, and what would
 * move is not the logic (four lines) but a widened shared port, which is the
 * thing `MemberContextPort`'s own comment asks not to happen by default. What
 * could reasonably be shared one day is a `MemberPreferencesPort` exposing the
 * whole preferences view, and that is a decision about coupling rather than
 * about duplication.
 */
@Injectable()
export class ProfileNextPracticeCutoff extends NextPracticeCutoffPort {
  constructor(
    private readonly profiles: ProfileQueryHandler,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  async cutoffFor(userId: string): Promise<string> {
    const preferences = await this.profiles.preferencesFor(userId);
    return (
      preferences?.nextPracticeCutoff ??
      (await this.settings.get('defaults.nextPracticeCutoff'))
    );
  }
}

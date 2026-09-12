import { Injectable } from '@nestjs/common';
import { ProfileQueryHandler } from '../../profile/features/profile-query/profile.query.js';
import {
  MemberSchedulePort,
  type MemberSchedule,
} from '../domain/rhythm.ports.js';

/**
 * When each member's three daily touches are due — bound to Profile.
 *
 * `infrastructure/` is the one layer constitution IX lets know another context
 * exists, because binding a local port to somebody else's published query is
 * precisely its job; `contexts/operations/infrastructure/admin-device.lookup.ts`
 * is the same shape, and `no-restricted-imports` refuses this import from
 * anywhere under `domain/` or `features/`. One dependency, and it is a
 * `*.query.ts` handler rather than a repository or a feature service: Profile's
 * published surface is what a query handler exposes, and reaching past it to
 * `PreferencesRepository` would be two contexts holding a key to one
 * collection with nothing in the code saying so.
 *
 * ## Why it is one call and not one call per member
 *
 * The caller is the tick: a five-minute pulse that walks the whole roster
 * deciding whose local plan-prompt, end-of-day or morning hour has arrived. The
 * schedule lives in two collections — the zone on the profile, the three times
 * and the check-in flag in preferences — so a per-member port would be two
 * round trips per member, and a five-hundred-member installation would pay a
 * thousand of them on a job whose stated goal is a pass in under ten seconds
 * when nobody is due. `schedulesFor` batches both reads; the round trip is the
 * cost, not the query.
 *
 * ## Why the result is never short
 *
 * `schedulesFor` promises an entry for every id asked for, falling back to
 * `settings.defaults.*` for a member whose rows the relay has not delivered yet
 * — it is at-least-once and *eventual*, so there is a real window after
 * registration with no profile row. That promise is the reason there is no
 * "does this member have a schedule" branch in the tick's loop body: the
 * fallback values are the very ones `bootstrap-on-registered` is about to
 * write, so a member in that window is scheduled correctly rather than skipped.
 *
 * The mapping below is a copy in the sense that the fields have the same names,
 * and that is deliberate rather than lazy: `MemberSchedule` is the rhythm's own
 * shape, declared in its `domain/`, and this is where the two are joined. If
 * Profile adds a field or renames one, the compiler stops here — in the layer
 * allowed to know about Profile — rather than in a handler that is not.
 */
@Injectable()
export class ProfileMemberSchedule extends MemberSchedulePort {
  constructor(private readonly profiles: ProfileQueryHandler) {
    super();
  }

  async forUsers(userIds: string[]): Promise<MemberSchedule[]> {
    const schedules = await this.profiles.schedulesFor(userIds);
    return schedules.map((schedule) => ({
      userId: schedule.userId,
      timezone: schedule.timezone,
      planTomorrowTime: schedule.planTomorrowTime,
      endOfDayTime: schedule.endOfDayTime,
      morningBriefingTime: schedule.morningBriefingTime,
      checkinEnabled: schedule.checkinEnabled,
    }));
  }
}

import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';

/**
 * The fields whose change alters when this member's touches fire.
 *
 * `timezone` is in the list and cannot arrive on `profile.PreferencesChanged`
 * today: it lives on the profile, not in `PREFERENCE_FIELDS`, so a member who
 * moves zones raises `profile.ProfileUpdated` instead. It is named here because
 * the *rule* is about the member's wall clock, and both halves of that clock —
 * the three times, and the zone they are read against — belong in one list
 * rather than in one list and one reviewer's memory.
 */
const RHYTHM_FIELDS = new Set([
  'planTomorrowTime',
  'endOfDayTime',
  'morningBriefingTime',
  'checkinEnabled',
  'timezone',
]);

interface PreferencesChangedPayload {
  changed?: string[];
}

/**
 * `profile.PreferencesChanged`, and the deliberate absence of any write.
 *
 * ## This handler has no work to do, and that is the finding rather than an omission
 *
 * A reader arriving here expects a reschedule. There is nothing to reschedule.
 * The tick holds no schedule of its own: every pass reads the member's zone and
 * their three times **live** through `MemberSchedulePort` and compares them
 * against the clock, so a preference saved at 20:40 is already in effect at
 * 20:45 without anything in this context being told. The re-evaluation P3's
 * plan asks for *is* the next pass, and the next pass happens anyway.
 *
 * ## And clearing a claim would be a defect
 *
 * The obvious-looking alternative — "their times moved, so let the touch fire
 * again" — is the bug the plan names outright, twice over:
 *
 * - **A member who moves three zones east after their summary was sent gets a
 *   second summary.** Their local date is unchanged or advanced, the claim is
 *   gone, the new local time is past their 22:00, and the tick sends tonight's
 *   end-of-day summary for the second time inside an hour. The claim is keyed
 *   on the *date* and not on the time precisely so that changing the time
 *   cannot re-fire what has already gone out.
 * - **A member who moves their summary from 22:00 to 21:00 after tonight's has
 *   gone out gets a second one**, for the same reason and without leaving their
 *   chair.
 *
 * Moving a time *earlier on a day whose touch has not yet fired* needs no help
 * either: the claim is still null and the live read already sees the new time.
 * Moving one *later* correctly means the member waits — and the touch is simply
 * missed if the day ends first, because the tick's rule is "the time has passed
 * today", not "the touch is owed from some earlier day".
 *
 * So what is left is a log line, and it earns its keep: "why did this member's
 * briefing arrive at 07:00 today and 08:00 yesterday" is answered by this line
 * and by nothing else in the system, because preferences are stored by value
 * with no history. Anyone tempted to add a write here should read the two
 * bullets above first — this file is where that argument is kept.
 */
@Injectable()
export class RhythmPreferencesChangedHandler {
  private readonly logger = new Logger(RhythmPreferencesChangedHandler.name);

  async handle(event: DomainEvent): Promise<'noted' | 'not-ours'> {
    const userId = event.userId;
    const { changed = [] } = (event.payload ?? {}) as PreferencesChangedPayload;

    const ours = changed.filter((field) => RHYTHM_FIELDS.has(field));
    if (!userId || ours.length === 0) return 'not-ours';

    // No repository call, no claim touched, nothing saved. See the class
    // comment: the tick reads preferences live, and clearing a claim would send
    // a member a second copy of a touch they had already received.
    this.logger.log(
      `${userId} changed ${ours.join(', ')}; the next tick pass reads it live`,
    );
    return 'noted';
  }
}

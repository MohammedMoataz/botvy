import { Injectable } from '@nestjs/common';
import {
  MeetingOccurrencesQueryHandler,
  type MeetingOccurrenceView,
} from '../../meetings/features/meeting-occurrences/meeting-occurrences.query.js';
import type { PlanMeeting } from '../domain/daily-plan.aggregate.js';
import { MeetingsOnPort } from '../domain/rhythm.ports.js';

/**
 * The meetings a day's plan names — bound to Meetings (FR-012).
 *
 * The same seam as `rhythm-planned-tasks.adapter.ts`, and the same rule: this
 * is the one layer allowed to import another context, and it binds to a
 * `*.query.ts` handler, which is Meetings' published surface. P5 declared
 * `onDate` with this caller named in its own comment, so this is a port meeting
 * a query that was written for it rather than a reach into somebody's rows.
 *
 * There is no alternative to asking here even in principle. Occurrences are
 * derived from the rule and never stored (FR-006), so a weekly meeting is one
 * document and "where does it fall on Tuesday" is a question only the expander
 * can answer. A second expansion on this side would be the hardest logic in the
 * platform implemented twice, and the first divergence would be a plan naming a
 * meeting at an hour the calendar disagrees with.
 *
 * ## The mapping narrows nine fields to four
 *
 * `MeetingOccurrenceView` carries what a *scheduler* needs — `prepMinutes`,
 * `reminderOffsets`, `originalStart`, the override flag — because its other
 * caller is Notifications' alert saga. A `daily_plans` row is a snapshot of
 * what the member was shown, so it keeps only what the sentence said: the
 * series id to tap through to, the title, the time and the length. Storing the
 * whole view would put five fields in the plan that go stale with no event
 * that could refresh them, which is the argument `toPlanTask` makes at length.
 *
 * `startAt` and not `originalStart`: an occurrence the member dragged to 11:00
 * is at 11:00, and the plan must name the time they will actually turn up at.
 * `originalStart` is the alert's key and has no business in a sentence.
 */
@Injectable()
export class MeetingsOnDate extends MeetingsOnPort {
  constructor(private readonly occurrences: MeetingOccurrencesQueryHandler) {
    super();
  }

  async onDate(userId: string, date: string): Promise<PlanMeeting[]> {
    const views = await this.occurrences.onDate(userId, date);
    return views.map(toPlanMeeting);
  }
}

function toPlanMeeting(view: MeetingOccurrenceView): PlanMeeting {
  return {
    meetingId: view.meetingId,
    title: view.title,
    startAt: view.startAt,
    durationMin: view.durationMin,
  };
}

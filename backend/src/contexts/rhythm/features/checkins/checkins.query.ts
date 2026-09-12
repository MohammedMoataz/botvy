import { Injectable } from '@nestjs/common';
import type { Checkin } from '../../domain/checkin.aggregate.js';
import { CheckinRepository } from '../../domain/rhythm.repositories.js';

/**
 * One day's answer, as a screen reads it.
 *
 * Every value except the date is nullable, and the nulls are load-bearing
 * rather than lazy. The two halves of a check-in arrive by different routes —
 * a one-word reply in the coach chat carries a verdict and no mood, the card
 * on the phone can carry a mood and no verdict — so a row with one half
 * filled in is the ordinary case, not a broken one.
 *
 * Which makes `mood: 0` and `mood: null` genuinely different values: nought is
 * a member having a terrible day and null is a member who did not say. A
 * `mood || undefined` anywhere between the store and the chart is a bug, and
 * so is a chart that plots a missing mood at the bottom of its axis.
 *
 * `source` is deliberately absent. It exists on the aggregate so the write
 * side can tell a chat answer from a card tap, and it is nothing a member's
 * history screen has any use for — putting it in the read shape would invite a
 * client to render "via notification" beside somebody's mood.
 */
export interface CheckinView {
  date: string;
  mood: number | null;
  adhered: boolean | null;
  note: string | null;
}

/**
 * A range of check-ins, for the history screen and the mood chart.
 *
 * Inclusive at both ends, over `CheckinRepository.between`, for the same
 * reason `plans` is: the caller drew the calendar and means the days it named,
 * and a half-open range would drop the last day of every view it renders.
 *
 * No zone lookup — the dates arrive resolved. See `plans.query.ts` for why
 * that is not an inconsistency with `todayPlan`.
 *
 * Days with no answer are absent from the result rather than present as an
 * all-null row. A caller that needs the third state positioned in a week —
 * the home screen's dots — gets it from `streak.weekAdherence`, which is
 * seven fixed slots for exactly that reason. Making this query pad its range
 * too would give two shapes for one question and let a chart plot a row the
 * member never wrote.
 */
@Injectable()
export class CheckinsQueryHandler {
  constructor(private readonly checkins: CheckinRepository) {}

  async handle(
    userId: string,
    from: string,
    to: string,
  ): Promise<CheckinView[]> {
    const rows = await this.checkins.between(userId, from, to);
    return rows.map(checkinView);
  }
}

export function checkinView(checkin: Checkin): CheckinView {
  return {
    date: checkin.date,
    mood: checkin.mood,
    adhered: checkin.adhered,
    note: checkin.note,
  };
}

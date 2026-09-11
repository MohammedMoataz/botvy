import { Injectable } from '@nestjs/common';
import {
  UsageRepository,
  type UsageAggregate,
} from '../../domain/usage.repository.js';

export interface UsageQuery {
  /** `YYYY-MM-DD`, inclusive. The operator's UTC day — see the repository. */
  from: string;
  /** `YYYY-MM-DD`, inclusive: the whole of that day is counted. */
  to: string;
  userId?: string | null;
  byMember?: boolean;
}

/**
 * What the model has been asked to do (P10, FR-011, T1004).
 *
 * ## Why the Owner is shown this at all
 *
 * Not to bill anybody: this installation is one person's machine and the
 * numbers are tokens, not money. It is there so that **a runaway loop is
 * visible before it becomes a problem** — a saga that retries for ever, a
 * member whose client reconnects in a tight loop — and the shape that makes
 * that visible is a per-day breakdown with a per-member total beside it. One
 * number that has doubled says something is wrong; it does not say whose.
 *
 * ## The range is dates and the store holds instants
 *
 * `to` is inclusive, because an operator typing 1st to 7th means seven days —
 * and every range *inside* the system is half-open. Both are true here: the
 * handler turns the inclusive date into the exclusive instant at the start of
 * the following day, in one place, so no caller has to remember which
 * convention it is holding. Getting this wrong silently drops the last day of
 * every report, which is the sort of arithmetic bug nobody reports because the
 * number still looks plausible.
 */
@Injectable()
export class UsageQueryHandler {
  constructor(private readonly usage: UsageRepository) {}

  async between(query: UsageQuery): Promise<UsageAggregate[]> {
    return this.usage.aggregate({
      from: startOfDay(query.from),
      to: startOfDay(nextDay(query.to)),
      userId: query.userId ?? null,
      byMember: query.byMember ?? false,
    });
  }
}

/** Midnight UTC on a `YYYY-MM-DD`. The operator's day; see the repository. */
function startOfDay(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * The calendar day after a `YYYY-MM-DD`.
 *
 * Through `Date.UTC` rather than by adding 86,400,000 milliseconds. The two
 * agree in UTC, where there is no daylight saving — and writing the arithmetic
 * version anyway is how somebody later "improves" it into a member's zone,
 * where a day is sometimes twenty-three hours long.
 */
function nextDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

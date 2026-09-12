import { Inject, Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { localDate, wallClockToUtc } from '../../../../shared/time/time.js';
import {
  TASK_READ_REPOSITORY,
  type LabelView,
  type TaskListView,
  type TaskPage,
  type TaskReadRepository,
  type TaskView,
} from '../../domain/task-read.repository.js';

/** A page bigger than this is a client that means to scroll, not to page. */
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;

export interface TasksQuery {
  view: TaskListView;
  labelId?: string;
  limit?: number;
  cursor?: string;
}

/**
 * The read side of Planning, and the one place "today" is defined.
 *
 * **The member's day is computed here, from their own zone, and nowhere else.**
 * The read adapters are handed two instants and never work out a boundary
 * themselves — two adapters computing midnight would be two chances to compute
 * it against the server's clock, which is the mistake principle XI exists to
 * stop. It is not a hypothetical: resolving a user-facing time against the
 * API's own `TZ` once shifted every extracted reminder by three hours.
 *
 * So a member in Cairo asking for Today at 00:30 gets the tasks for the day
 * that has just started where *they* are, and a member in Berlin asking at the
 * same instant gets the day that is still yesterday where they are. Both are
 * correct, and neither is what the server's own date would have said.
 */
@Injectable()
export class TasksQueryHandler {
  constructor(
    @Inject(TASK_READ_REPOSITORY) private readonly tasks: TaskReadRepository,
    private readonly member: MemberContextPort,
  ) {}

  async page(
    userId: string,
    query: TasksQuery,
    now: Date = new Date(),
  ): Promise<TaskPage> {
    const { timezone } = await this.member.clock(userId);
    const { dayStart, dayEnd } = memberDay(now, timezone);

    return this.tasks.page(userId, {
      view: query.view,
      labelId: query.labelId,
      dayStart,
      dayEnd,
      now,
      timezone,
      limit: clampLimit(query.limit),
      cursor: query.cursor,
    });
  }

  async byId(userId: string, id: string): Promise<TaskView | null> {
    const { timezone } = await this.member.clock(userId);
    return this.tasks.byId(userId, id, timezone);
  }

  async labels(userId: string, includeDeleted = false): Promise<LabelView[]> {
    return this.tasks.labels(userId, includeDeleted);
  }
}

function clampLimit(limit: number | undefined): number {
  if (!limit || limit <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(limit, MAX_PAGE_SIZE);
}

/**
 * Midnight to midnight, on the member's clock, as two instants.
 *
 * Built by asking `shared/time` what calendar date it is where the member is,
 * then asking it which instants that date's midnights name. Doing it in that
 * order is what makes the day come out right across a daylight-saving change:
 * a spring-forward day is 23 hours long, and adding 24 hours to its start would
 * put `dayEnd` an hour into the next day — so every task due in that hour would
 * appear in Today twice, once on each day.
 */
export function memberDay(
  now: Date,
  timezone: string,
): { dayStart: Date; dayEnd: Date } {
  const today = localDate(now, timezone);
  const [year, month, day] = today.split('-').map(Number);
  const tomorrow = new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + 1),
  );
  const tomorrowDate = `${tomorrow.getUTCFullYear()}-${String(
    tomorrow.getUTCMonth() + 1,
  ).padStart(2, '0')}-${String(tomorrow.getUTCDate()).padStart(2, '0')}`;

  // `wallClockToUtc` returns null only for an unparseable string, and both of
  // these were built here — but a `??` beats a non-null assertion, because the
  // fallback is still a defensible instant rather than a crash on a screen.
  return {
    dayStart: wallClockToUtc(`${today}T00:00`, timezone) ?? now,
    dayEnd: wallClockToUtc(`${tomorrowDate}T00:00`, timezone) ?? now,
  };
}

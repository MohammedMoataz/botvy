import { Inject, Injectable } from '@nestjs/common';
import {
  REMINDER_READ_REPOSITORY,
  type ReminderListView,
  type ReminderPage,
  type ReminderReadRepository,
  type ReminderView,
} from '../../domain/reminder.repository.js';

export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;

export interface RemindersQuery {
  view: ReminderListView;
  limit?: number;
  cursor?: string;
}

/**
 * The read side.
 *
 * No time-zone resolution here, and that is the difference from Planning's
 * query: a reminder is an *instant*, not a day. "Is this reminder overdue" is
 * one comparison against `now` and gives the same answer in every zone, where
 * "is this task due today" needs the member's own midnight. Adding a zone
 * lookup for symmetry would be a read of Profile on every list for no reason —
 * and the wrong kind of consistency, since it would suggest the two questions
 * are the same shape when they are not.
 */
@Injectable()
export class RemindersQueryHandler {
  constructor(
    @Inject(REMINDER_READ_REPOSITORY)
    private readonly reminders: ReminderReadRepository,
  ) {}

  async page(
    userId: string,
    query: RemindersQuery,
    now: Date = new Date(),
  ): Promise<ReminderPage> {
    return this.reminders.page(userId, {
      view: query.view,
      now,
      limit: clampLimit(query.limit),
      cursor: query.cursor,
    });
  }

  async byId(userId: string, id: string): Promise<ReminderView | null> {
    return this.reminders.byId(userId, id);
  }
}

function clampLimit(limit: number | undefined): number {
  if (!limit || limit <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(limit, MAX_PAGE_SIZE);
}

import { Injectable } from '@nestjs/common';
import { isUuid } from '../../../../shared/cqrs/ids.js';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { wallClockToUtc } from '../../../../shared/time/time.js';
import {
  Reminder,
  type ReminderSource,
} from '../../domain/reminder.aggregate.js';
import { ReminderRepository } from '../../domain/reminder.repository.js';

export class ReminderNotFound extends Error {
  constructor(id: string) {
    super(`no reminder ${id}`);
  }
}

export class InvalidReminderId extends Error {
  constructor(id: string) {
    super(
      `"${id}" is not a UUID. The client mints the id, and it has to be a UUIDv7.`,
    );
  }
}

/**
 * When the member wants telling, in one of two forms.
 *
 * `remindAt` is an instant a client already resolved. `remindAtLocal` is a
 * wall-clock string with no zone — `2026-09-12T18:00` — and it exists because
 * that is what the chat's extraction produces: a small model gets "tomorrow at
 * six" right and the UTC arithmetic wrong, landing reminders hours out and
 * occasionally on the wrong day. Handing over the wall clock and letting the
 * server resolve it against the member's zone is deterministic, so code does
 * it rather than the model.
 */
export interface ReminderMoment {
  remindAt?: Date;
  remindAtLocal?: string;
}

export interface CreateReminderCommand extends ReminderMoment {
  id: string;
  title: string;
  leadTimes?: string[];
  source?: ReminderSource;
}

export interface UpdateReminderCommand extends ReminderMoment {
  title?: string;
  leadTimes?: string[];
}

export class UnresolvableMoment extends Error {
  constructor(value: string) {
    super(`"${value}" is not a wall-clock time like 2026-09-12T18:00`);
  }
}

/**
 * Creating and editing a reminder.
 *
 * The two halves of this handler are the phase's two decisions about time, and
 * they pull in opposite directions on purpose:
 *
 * - **The member's wall clock is resolved for them**, against their profile's
 *   zone, through `shared/time`. Never against the server's `TZ` — reading
 *   `process.env.TZ` for this once shifted every extracted reminder by three
 *   hours, and it is the single most expensive mistake in this codebase's
 *   history.
 * - **A moment already past is refused, not resolved forward.** The aggregate
 *   throws `remind_at_past` and the client re-offers the same clock time on the
 *   next day. Moving it silently would be the same class of harm as reading the
 *   server's zone: the member ends up with a reminder at a time they never
 *   chose, and nothing tells them.
 */
@Injectable()
export class ManageReminderHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly reminders: ReminderRepository,
    private readonly member: MemberContextPort,
  ) {}

  async create(
    userId: string,
    command: CreateReminderCommand,
    now: Date = new Date(),
  ): Promise<{ id: string; updatedAt: Date; replayed: boolean }> {
    if (!isUuid(command.id)) throw new InvalidReminderId(command.id);

    // The replay rule, identical to tasks and labels: the client minted this id
    // offline and may well send it twice.
    const existing = await this.reminders.findById(userId, command.id);
    if (existing)
      return { id: existing.id, updatedAt: existing.updatedAt, replayed: true };

    const remindAt = await this.resolve(userId, command);
    const reminder = Reminder.schedule(
      {
        id: command.id,
        userId,
        title: command.title,
        remindAt,
        leadTimes:
          command.leadTimes ??
          (await this.member.alertPreferences(userId)).leadTimes,
        source: command.source ?? 'app',
        createdAt: now,
      },
      now,
    );

    await this.uow.run(() => this.reminders.save(reminder));
    return { id: reminder.id, updatedAt: reminder.updatedAt, replayed: false };
  }

  async update(
    userId: string,
    id: string,
    command: UpdateReminderCommand,
    now: Date = new Date(),
  ): Promise<{ changed: string[]; updatedAt: Date }> {
    const reminder = await this.reminders.findById(userId, id);
    if (!reminder) throw new ReminderNotFound(id);

    const remindAt =
      command.remindAt === undefined && command.remindAtLocal === undefined
        ? undefined
        : await this.resolve(userId, command);

    const changed = reminder.edit(
      { title: command.title, remindAt, leadTimes: command.leadTimes },
      now,
    );
    if (changed.length > 0)
      await this.uow.run(() => this.reminders.save(reminder));
    return { changed, updatedAt: reminder.updatedAt };
  }

  /**
   * The wall clock, resolved against the member's own zone.
   *
   * A moment landing in a daylight-saving gap comes back as the first valid
   * instant *after* it rather than the hour before — a reminder set for 02:30
   * on the morning the clocks move should go off once they have moved, not an
   * hour early. `shared/time` owns that rule, and got it wrong for every zone
   * ahead of UTC until this phase; see its comment.
   *
   * Public because reactivation needs it too, and reactivation lives in the
   * lifecycle handler, which has no business knowing about time zones — every
   * other method it has is load, call, save. Exposing the resolver keeps the
   * one place that reads the member's zone the one place that reads it.
   */
  async resolveMoment(userId: string, moment: ReminderMoment): Promise<Date> {
    return this.resolve(userId, moment);
  }

  private async resolve(userId: string, moment: ReminderMoment): Promise<Date> {
    if (moment.remindAt) return moment.remindAt;

    const local = moment.remindAtLocal;
    if (!local) throw new UnresolvableMoment('(nothing)');

    const { timezone } = await this.member.clock(userId);
    const resolved = wallClockToUtc(local, timezone);
    if (!resolved) throw new UnresolvableMoment(local);
    return resolved;
  }
}

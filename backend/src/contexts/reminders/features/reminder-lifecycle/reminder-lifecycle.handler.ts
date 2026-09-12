import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { Reminder } from '../../domain/reminder.aggregate.js';
import { ReminderRepository } from '../../domain/reminder.repository.js';
import { ReminderNotFound } from '../manage-reminder/manage-reminder.handler.js';

/**
 * Everything that moves a reminder through its states without changing what it
 * says: snooze, complete, cancel, reactivate, delete, restore, erase.
 *
 * One class rather than seven, and the reason is that every one of them is the
 * same three lines — load, call the aggregate, save — with no dependency of its
 * own. Splitting them would produce seven files whose only difference is a verb
 * and seven constructors injecting the same two things, which makes the
 * *shared* rule below harder to see rather than easier. Where a slice has real
 * behaviour of its own it gets its own file; Planning's `create-task`, with its
 * replay rule and its label resolution, is that, and `cancel` is not.
 *
 * The rule they share, and the reason this file has a comment at all:
 *
 * **Deleting and restoring never touch the status.** `status` is the only
 * record of whether the reminder was done, cancelled or still waiting, and the
 * Deleted view exists to show the member exactly that. `restore` therefore
 * gives back a *done* reminder as done — which reads oddly until you consider
 * that the alternative makes the Deleted view a trap, because recovering
 * something you had finished would put it back on your list.
 */
@Injectable()
export class ReminderLifecycleHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly reminders: ReminderRepository,
  ) {}

  /** "Not now, in twenty minutes." Sets `snoozedUntil`, never `remindAt`. */
  async snooze(
    userId: string,
    id: string,
    until: Date,
    now: Date = new Date(),
  ): Promise<{ updatedAt: Date }> {
    const reminder = await this.#load(userId, id);
    reminder.snooze(until, now);
    return this.#save(reminder);
  }

  async complete(
    userId: string,
    id: string,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date }> {
    const reminder = await this.#load(userId, id);
    reminder.complete(at);
    return this.#save(reminder);
  }

  async cancel(
    userId: string,
    id: string,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date }> {
    const reminder = await this.#load(userId, id);
    reminder.cancel(at);
    return this.#save(reminder);
  }

  /**
   * Back to active, with a new moment the caller has to supply.
   *
   * Required rather than optional: reactivating with the old moment would put
   * the reminder back on the active list already overdue, so it would fire at
   * once or be expired by the sweep. Neither is what the member meant, and
   * making the parameter mandatory forces the question onto the screen where a
   * person can answer it.
   */
  async reactivate(
    userId: string,
    id: string,
    remindAt: Date,
    now: Date = new Date(),
  ): Promise<{ updatedAt: Date }> {
    const reminder = await this.#load(userId, id);
    reminder.reactivate(remindAt, now);
    return this.#save(reminder);
  }

  async remove(
    userId: string,
    id: string,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date }> {
    const reminder = await this.#load(userId, id);
    // A repeated delete answers with what is there rather than moving
    // `deletedAt`, which the purge horizon is measured from.
    if (reminder.isDeleted) return { updatedAt: reminder.updatedAt };
    reminder.tombstone(at);
    return this.#save(reminder);
  }

  async restore(
    userId: string,
    id: string,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date }> {
    const reminder = await this.#load(userId, id);
    if (!reminder.isDeleted) return { updatedAt: reminder.updatedAt };
    reminder.restore(at);
    return this.#save(reminder);
  }

  /** One row, at the member's request. Refused unless it is already a tombstone. */
  async purge(userId: string, id: string): Promise<void> {
    const reminder = await this.#load(userId, id);
    reminder.assertPurgeable();
    await this.uow.run(() => this.reminders.remove(reminder));
  }

  /**
   * The whole Deleted view at once.
   *
   * Each row goes through `remove` rather than a bulk delete, so a live row
   * that somehow carried no `deletedAt` is refused rather than swept up with
   * the rest — "empty the bin" must not be a way to erase something that is not
   * in the bin.
   */
  async clearDeleted(userId: string): Promise<{ purged: number }> {
    const all = await this.reminders.pullSince(userId, null);
    const tombstones = all.filter((reminder) => reminder.isDeleted);

    await this.uow.run(async () => {
      for (const reminder of tombstones) {
        await this.reminders.remove(reminder);
      }
    });
    return { purged: tombstones.length };
  }

  /**
   * The `PurgeTombstones` command the notification sweep dispatches. It is this
   * context's own write, asked for from outside rather than done from outside.
   */
  async purgeTombstones(before: Date, userId?: string): Promise<number> {
    return this.uow.run(() =>
      this.reminders.purgeTombstonesBefore(before, userId),
    );
  }

  async #load(userId: string, id: string): Promise<Reminder> {
    const reminder = await this.reminders.findById(userId, id);
    if (!reminder) throw new ReminderNotFound(id);
    return reminder;
  }

  async #save(reminder: Reminder): Promise<{ updatedAt: Date }> {
    await this.uow.run(() => this.reminders.save(reminder));
    return { updatedAt: reminder.updatedAt };
  }
}

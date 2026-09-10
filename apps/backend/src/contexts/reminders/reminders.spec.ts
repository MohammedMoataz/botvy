import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../shared/cqrs/ids.js';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../shared/member/member-context.port.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { localDate, localHhMm } from '../../shared/time/time.js';
import { ReminderRuleError } from './domain/reminder.aggregate.js';
import {
  InvalidReminderId,
  ManageReminderHandler,
  ReminderNotFound,
  UnresolvableMoment,
} from './features/manage-reminder/manage-reminder.handler.js';
import { ReminderLifecycleHandler } from './features/reminder-lifecycle/reminder-lifecycle.handler.js';
import { RemindersQueryHandler } from './features/reminders-query/reminders.query.js';
import {
  InMemoryReminderReadRepository,
  InMemoryReminderRepository,
} from './infrastructure/in-memory-reminder.repository.js';

const MEMBER = 'member-1';
const OTHER = 'member-2';
const CAIRO = 'Africa/Cairo';
const BERLIN = 'Europe/Berlin';

class StubMemberContext extends MemberContextPort {
  constructor(private readonly timezone = CAIRO) {
    super();
  }

  async clock(): Promise<MemberClock> {
    return { timezone: this.timezone };
  }

  async alertPreferences(): Promise<MemberAlertPreferences> {
    return {
      leadTimes: ['1h', '0m'],
      quietHours: { from: '22:00', to: '07:00' },
    };
  }
}

interface Bench {
  uow: InMemoryUnitOfWork;
  reminders: InMemoryReminderRepository;
  manage: ManageReminderHandler;
  lifecycle: ReminderLifecycleHandler;
  query: RemindersQueryHandler;
}

function bench(timezone = CAIRO): Bench {
  const uow = new InMemoryUnitOfWork();
  const reminders = new InMemoryReminderRepository(uow);
  const reads = new InMemoryReminderReadRepository(reminders);
  const member = new StubMemberContext(timezone);

  return {
    uow,
    reminders,
    manage: new ManageReminderHandler(uow, reminders, member),
    lifecycle: new ReminderLifecycleHandler(uow, reminders),
    query: new RemindersQueryHandler(reads),
  };
}

const names = (b: Bench) => b.uow.events.map((event) => event.name);

/** Everything relative to now, so no fixture rots when the clock moves. */
const inMinutes = (n: number) => new Date(Date.now() + n * 60_000);
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

describe('creating a reminder', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('accepts the client’s id and raises ReminderScheduled with the moment and the lead times', async () => {
    const id = newId();
    const remindAt = inMinutes(120);
    await b.manage.create(MEMBER, {
      id,
      title: 'Call Dad',
      remindAt,
      leadTimes: ['1h', '0m'],
    });

    expect(names(b)).toEqual(['reminders.ReminderScheduled']);
    const event = b.uow.events[0]!;
    // The saga expands the lead times, so the event has to carry them — this
    // context announces what the member chose and lets Notifications work out
    // what instants that means.
    expect(event.payload).toMatchObject({
      reminderId: id,
      leadTimes: ['1h', '0m'],
    });
    expect((event.payload as { remindAt: Date }).remindAt.getTime()).toBe(
      remindAt.getTime(),
    );
  });

  it('answers a replay as the create that already happened', async () => {
    const id = newId();
    await b.manage.create(MEMBER, {
      id,
      title: 'Call Dad',
      remindAt: inMinutes(120),
    });
    b.uow.events.length = 0;

    const replay = await b.manage.create(MEMBER, {
      id,
      title: 'Call Dad',
      remindAt: inMinutes(120),
    });

    expect(replay.replayed).toBe(true);
    expect(b.reminders.rows.size).toBe(1);
    expect(names(b)).toEqual([]);
  });

  it('takes the member’s default lead times when the client sends none', async () => {
    // Never a literal in this file: the defaults come from preferences, which
    // are seeded from the registry.
    const id = newId();
    await b.manage.create(MEMBER, {
      id,
      title: 'Call Dad',
      remindAt: inMinutes(120),
    });

    const reminder = await b.reminders.findById(MEMBER, id);
    expect(reminder?.leadTimes).toEqual(['1h', '0m']);
  });

  it('refuses an id that is not a UUID', async () => {
    await expect(
      b.manage.create(MEMBER, {
        id: 'r-1',
        title: 'Call Dad',
        remindAt: inMinutes(60),
      }),
    ).rejects.toThrow(InvalidReminderId);
  });

  it('orders lead times longest-first and drops duplicates', async () => {
    // The order the member is warned in. `0m, 1h` would render as a countdown
    // running backwards.
    const id = newId();
    await b.manage.create(MEMBER, {
      id,
      title: 'Call Dad',
      remindAt: inMinutes(3000),
      leadTimes: ['0m', '1d', '1h', '1h', '30m'],
    });

    const reminder = await b.reminders.findById(MEMBER, id);
    expect(reminder?.leadTimes).toEqual(['1d', '1h', '30m', '0m']);
  });

  it('refuses a lead time that is not a duration', async () => {
    await expect(
      b.manage.create(MEMBER, {
        id: newId(),
        title: 'Call Dad',
        remindAt: inMinutes(60),
        leadTimes: ['soon'],
      }),
    ).rejects.toMatchObject({ code: 'bad_lead_time' });
  });
});

describe('a moment already past is refused, not moved', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  /**
   * The phase's own decision, recorded in `plan.md`: principle XI makes the
   * member's clock the authority, so quietly shifting a time they chose is the
   * silent shift it forbids. The client re-offers the same clock time tomorrow
   * and sends *that*, so the member sees the change and agrees to it.
   */
  it('refuses a create an hour behind the clock, naming the reason', async () => {
    await expect(
      b.manage.create(MEMBER, {
        id: newId(),
        title: 'Call Dad',
        remindAt: minutesAgo(60),
      }),
    ).rejects.toMatchObject({ code: 'remind_at_past' });

    // And nothing was written, so the client's retry with a new moment is a
    // create rather than an update.
    expect(b.reminders.rows.size).toBe(0);
  });

  it('refuses an edit that moves the moment into the past', async () => {
    const id = newId();
    await b.manage.create(MEMBER, {
      id,
      title: 'Call Dad',
      remindAt: inMinutes(120),
    });

    await expect(
      b.manage.update(MEMBER, id, { remindAt: minutesAgo(60) }),
    ).rejects.toMatchObject({ code: 'remind_at_past' });

    // The stored moment is untouched: a refused edit leaves the reminder as it
    // was rather than half-applied.
    const reminder = await b.reminders.findById(MEMBER, id);
    expect(reminder?.remindAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses a snooze to a moment that has passed', async () => {
    const id = newId();
    await b.manage.create(MEMBER, {
      id,
      title: 'Call Dad',
      remindAt: inMinutes(120),
    });

    await expect(
      b.lifecycle.snooze(MEMBER, id, minutesAgo(5)),
    ).rejects.toMatchObject({
      code: 'snooze_past',
    });
  });
});

describe('the member’s wall clock, resolved in their own zone', () => {
  it('reads a zoneless wall-clock time against the member’s zone, not the server’s', async () => {
    // What the chat's extraction produces. A small model gets "tomorrow at six"
    // right and the UTC arithmetic wrong, so it hands over the wall clock and
    // the server resolves it — deterministically, and against the member.
    const b = bench(CAIRO);
    const tomorrow = localDate(new Date(Date.now() + 86_400_000), CAIRO);

    const id = newId();
    await b.manage.create(MEMBER, {
      id,
      title: 'Call Dad',
      remindAtLocal: `${tomorrow}T18:00`,
    });

    const reminder = await b.reminders.findById(MEMBER, id);
    // Reads back as six in the evening where the member is, whatever the
    // server's own clock says.
    expect(localHhMm(reminder!.remindAt, CAIRO)).toBe('18:00');
    expect(localDate(reminder!.remindAt, CAIRO)).toBe(tomorrow);
  });

  it('gives two members in different zones two different instants for one wall clock', async () => {
    // The assertion that fails the moment somebody resolves against
    // `process.env.TZ`: same string, same code path, two answers.
    const cairo = bench(CAIRO);
    const berlin = bench(BERLIN);
    const tomorrow = localDate(new Date(Date.now() + 86_400_000), 'UTC');

    const one = newId();
    const two = newId();
    await cairo.manage.create(MEMBER, {
      id: one,
      title: 'X',
      remindAtLocal: `${tomorrow}T18:00`,
    });
    await berlin.manage.create(MEMBER, {
      id: two,
      title: 'X',
      remindAtLocal: `${tomorrow}T18:00`,
    });

    const inCairo = await cairo.reminders.findById(MEMBER, one);
    const inBerlin = await berlin.reminders.findById(MEMBER, two);
    expect(inCairo!.remindAt.getTime()).not.toBe(inBerlin!.remindAt.getTime());
    expect(localHhMm(inCairo!.remindAt, CAIRO)).toBe('18:00');
    expect(localHhMm(inBerlin!.remindAt, BERLIN)).toBe('18:00');
  });

  it('lands after a daylight-saving gap rather than an hour before it', async () => {
    // 02:30 on 29 March 2026 does not exist in Berlin. Pinned deliberately —
    // the whole point is that specific weekend — and it is the case that
    // returned 01:30 for every zone ahead of UTC until this phase fixed
    // `shared/time`.
    const b = bench(BERLIN);
    const id = newId();
    await b.manage.create(
      MEMBER,
      { id, title: 'Small hours', remindAtLocal: '2026-03-29T02:30' },
      // `now` well before the fixture, so the past-moment rule does not fire
      // first and hide what is being tested.
      new Date('2026-03-01T00:00:00.000Z'),
    );

    const reminder = await b.reminders.findById(MEMBER, id);
    expect(localHhMm(reminder!.remindAt, BERLIN)).toBe('03:30');
  });

  it('refuses a wall clock it cannot read, rather than guessing', async () => {
    const b = bench();
    await expect(
      b.manage.create(MEMBER, {
        id: newId(),
        title: 'X',
        remindAtLocal: 'tomorrow evening',
      }),
    ).rejects.toThrow(UnresolvableMoment);
  });
});

describe('snoozing', () => {
  let b: Bench;
  let id: string;
  beforeEach(async () => {
    b = bench();
    id = newId();
    await b.manage.create(MEMBER, {
      id,
      title: 'Call Dad',
      remindAt: inMinutes(10),
    });
    b.uow.events.length = 0;
  });

  it('sets snoozedUntil and leaves remindAt alone', async () => {
    // The member's original moment is still the truth about what they asked
    // for. Overwriting it would make "snoozed twice from 09:00" and "asked for
    // 09:40" the same row.
    const original = (await b.reminders.findById(MEMBER, id))!.remindAt;
    const until = inMinutes(30);

    await b.lifecycle.snooze(MEMBER, id, until);

    const reminder = await b.reminders.findById(MEMBER, id);
    expect(reminder?.remindAt.getTime()).toBe(original.getTime());
    expect(reminder?.snoozedUntil?.getTime()).toBe(until.getTime());
    expect(names(b)).toEqual(['reminders.ReminderSnoozed']);
  });

  it('announces the effective moment, so the saga does not need to know what a snooze is', async () => {
    const until = inMinutes(30);
    await b.lifecycle.snooze(MEMBER, id, until);

    const payload = b.uow.events[0]!.payload as { remindAt: Date };
    expect(payload.remindAt.getTime()).toBe(until.getTime());
  });

  it('clears the snooze when the member moves the reminder themselves', async () => {
    // They have just told us when they want it, which supersedes "not now".
    await b.lifecycle.snooze(MEMBER, id, inMinutes(30));
    await b.manage.update(MEMBER, id, { remindAt: inMinutes(600) });

    const reminder = await b.reminders.findById(MEMBER, id);
    expect(reminder?.snoozedUntil).toBeNull();
  });

  it('moves a snoozed reminder between Overdue and Upcoming as the snooze runs out', async () => {
    // The lists split on the *effective* moment, which is what the member
    // expects, having pushed it there themselves.
    await b.lifecycle.snooze(MEMBER, id, inMinutes(30));

    const upcoming = await b.query.page(MEMBER, { view: 'upcoming' });
    expect(upcoming.nodes.map((r) => r.id)).toEqual([id]);

    // Twenty minutes later the original moment has passed but the snooze has
    // not: still upcoming.
    const later = await b.query.page(
      MEMBER,
      { view: 'upcoming' },
      inMinutes(20),
    );
    expect(later.nodes.map((r) => r.id)).toEqual([id]);

    // Forty minutes later the snooze has run out too.
    const overdue = await b.query.page(
      MEMBER,
      { view: 'overdue' },
      inMinutes(40),
    );
    expect(overdue.nodes.map((r) => r.id)).toEqual([id]);
  });

  it('shows a never-snoozed reminder in the lists at all', async () => {
    /*
     * The regression this phase owes its own past, in the other store.
     *
     * The effective-moment filter has to state both halves — "snoozed and past"
     * or "not snoozed and past" — because `snoozedUntil` is null for a reminder
     * nobody has snoozed, and that is nearly all of them. A filter that only
     * tested `snoozedUntil` would hide every one of them, which is exactly the
     * shape of the phone's `pending_op != 'x'` bug that has bitten twice.
     */
    const fresh = bench();
    const never = newId();
    await fresh.manage.create(MEMBER, {
      id: never,
      title: 'Never snoozed',
      remindAt: inMinutes(60),
    });

    const upcoming = await fresh.query.page(MEMBER, { view: 'upcoming' });
    expect(upcoming.nodes.map((r) => r.id)).toEqual([never]);

    const overdue = await fresh.query.page(
      MEMBER,
      { view: 'overdue' },
      inMinutes(120),
    );
    expect(overdue.nodes.map((r) => r.id)).toEqual([never]);
  });
});

describe('the lifecycle, and what a delete must not touch', () => {
  let b: Bench;
  let id: string;
  beforeEach(async () => {
    b = bench();
    id = newId();
    await b.manage.create(MEMBER, {
      id,
      title: 'Call Dad',
      remindAt: inMinutes(120),
    });
  });

  it('completing raises ReminderCompleted and clears any snooze', async () => {
    await b.lifecycle.snooze(MEMBER, id, inMinutes(30));
    b.uow.events.length = 0;

    await b.lifecycle.complete(MEMBER, id);

    const reminder = await b.reminders.findById(MEMBER, id);
    expect(reminder?.status).toBe('done');
    expect(reminder?.snoozedUntil).toBeNull();
    expect(names(b)).toEqual(['reminders.ReminderCompleted']);
  });

  it('cancelling is a third state, not a synonym for done', async () => {
    await b.lifecycle.cancel(MEMBER, id);
    const reminder = await b.reminders.findById(MEMBER, id);
    expect(reminder?.status).toBe('cancelled');
  });

  it('leaves the status alone when deleted, for all three statuses', async () => {
    const done = newId();
    const cancelled = newId();
    const untouched = newId();
    for (const each of [done, cancelled, untouched]) {
      await b.manage.create(MEMBER, {
        id: each,
        title: 'X',
        remindAt: inMinutes(120),
      });
    }
    await b.lifecycle.complete(MEMBER, done);
    await b.lifecycle.cancel(MEMBER, cancelled);
    for (const each of [done, cancelled, untouched]) {
      await b.lifecycle.remove(MEMBER, each);
    }

    expect((await b.reminders.findById(MEMBER, done))?.status).toBe('done');
    expect((await b.reminders.findById(MEMBER, cancelled))?.status).toBe(
      'cancelled',
    );
    expect((await b.reminders.findById(MEMBER, untouched))?.status).toBe(
      'active',
    );

    // And the Deleted view reports which was which, which is what the view is
    // for.
    const deleted = await b.query.page(MEMBER, { view: 'deleted' });
    expect(new Set(deleted.nodes.map((r) => r.status))).toEqual(
      new Set(['done', 'cancelled', 'active']),
    );
  });

  it('restores with the status it had', async () => {
    await b.lifecycle.complete(MEMBER, id);
    await b.lifecycle.remove(MEMBER, id);
    await b.lifecycle.restore(MEMBER, id);

    const reminder = await b.reminders.findById(MEMBER, id);
    expect(reminder?.isDeleted).toBe(false);
    expect(reminder?.status).toBe('done');
  });

  it('requires a new moment to reactivate, and refuses one in the past', async () => {
    await b.lifecycle.cancel(MEMBER, id);

    await expect(
      b.lifecycle.reactivate(MEMBER, id, minutesAgo(30)),
    ).rejects.toMatchObject({
      code: 'remind_at_past',
    });

    await b.lifecycle.reactivate(MEMBER, id, inMinutes(300));
    const reminder = await b.reminders.findById(MEMBER, id);
    expect(reminder?.status).toBe('active');
    expect(reminder?.remindAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses to reactivate one that is already active', async () => {
    await expect(
      b.lifecycle.reactivate(MEMBER, id, inMinutes(300)),
    ).rejects.toMatchObject({
      code: 'already_active',
    });
  });

  it('refuses to erase a reminder that is not a tombstone', async () => {
    await expect(b.lifecycle.purge(MEMBER, id)).rejects.toMatchObject({
      code: 'not_deleted',
    });
    expect(b.reminders.rows.size).toBe(1);
  });

  it('empties the Deleted view without touching a live row', async () => {
    const live = newId();
    await b.manage.create(MEMBER, {
      id: live,
      title: 'Still here',
      remindAt: inMinutes(120),
    });
    await b.lifecycle.remove(MEMBER, id);

    const result = await b.lifecycle.clearDeleted(MEMBER);

    expect(result.purged).toBe(1);
    expect(await b.reminders.findById(MEMBER, id)).toBeNull();
    expect(await b.reminders.findById(MEMBER, live)).not.toBeNull();
  });

  it('purges tombstones past the horizon and leaves fresh ones alone', async () => {
    const old = newId();
    await b.manage.create(MEMBER, {
      id: old,
      title: 'Ancient',
      remindAt: inMinutes(120),
    });
    await b.lifecycle.remove(MEMBER, old);
    await b.lifecycle.remove(MEMBER, id);
    // Forty days pass for one of them.
    b.reminders.rows.get(old)!.deletedAt = new Date(
      Date.now() - 40 * 86_400_000,
    );

    const purged = await b.lifecycle.purgeTombstones(
      new Date(Date.now() - 30 * 86_400_000),
    );

    expect(purged).toBe(1);
    expect(await b.reminders.findById(MEMBER, old)).toBeNull();
    // The fresh tombstone stays: erasing it before every device had heard the
    // deletion would leave the phone's copy surviving the next full snapshot.
    expect(await b.reminders.findById(MEMBER, id)).not.toBeNull();
  });

  it('refuses every operation on another member’s reminder', async () => {
    for (const attempt of [
      () => b.lifecycle.complete(OTHER, id),
      () => b.lifecycle.cancel(OTHER, id),
      () => b.lifecycle.remove(OTHER, id),
      () => b.lifecycle.snooze(OTHER, id, inMinutes(30)),
      () => b.manage.update(OTHER, id, { title: 'Hijacked' }),
    ]) {
      await expect(attempt()).rejects.toThrow(ReminderNotFound);
    }
  });
});

describe('the reminder aggregate’s own guards', () => {
  it('refuses a title that is only whitespace', async () => {
    const b = bench();
    await expect(
      b.manage.create(MEMBER, {
        id: newId(),
        title: '  ',
        remindAt: inMinutes(60),
      }),
    ).rejects.toBeInstanceOf(ReminderRuleError);
  });

  it('raises nothing for an edit that changed nothing', async () => {
    const b = bench();
    const id = newId();
    const remindAt = inMinutes(120);
    await b.manage.create(MEMBER, {
      id,
      title: 'Call Dad',
      remindAt,
      leadTimes: ['1h'],
    });
    b.uow.events.length = 0;

    const result = await b.manage.update(MEMBER, id, {
      title: 'Call Dad',
      remindAt,
      leadTimes: ['1h'],
    });

    expect(result.changed).toEqual([]);
    expect(names(b)).toEqual([]);
  });
});

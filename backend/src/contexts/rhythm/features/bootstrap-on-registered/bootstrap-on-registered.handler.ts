import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { localDate, localHhMm } from '../../../../shared/time/time.js';
import { MemberSchedulePort } from '../../domain/rhythm.ports.js';
import {
  RhythmState,
  type TouchKind,
} from '../../domain/rhythm-state.aggregate.js';
import { RhythmStateRepository } from '../../domain/rhythm.repositories.js';

/**
 * Gives a new member the row the tick reads, and closes the day they arrived in.
 *
 * Reacts to `identity.UserRegistered` rather than being called by the register
 * handler, for the reason every bootstrap handler in this codebase does:
 * Identity is on PostgreSQL and this context is on MongoDB, so no transaction
 * spans both. The event goes into `identity_outbox` in the same transaction as
 * the account and the relay delivers it here at least once — which makes
 * idempotency mandatory rather than a nicety. A second delivery three weeks
 * later must not reset a member's claim dates or wipe a streak they have been
 * building, so the handler exits on finding a row rather than writing a fresh
 * one.
 *
 * ## Nulls alone are the bug this handler exists to prevent
 *
 * `RhythmState.create` starts every claim date at null, which reads as "nothing
 * has been sent". The tick's rule is "the member's clock now reads at or past
 * their chosen time **and** the date is unclaimed" — so a member who registers
 * at 23:00 Cairo, with a 21:00 prompt and a 22:00 summary, satisfies both
 * halves for both touches the moment the row appears. Within five minutes they
 * would be asked to plan a day that is ending, and then told it had been set
 * for them, about a day with forty minutes left in it. That is the spec's own
 * edge case ("no prompt or summary is invented for a day already ending; the
 * first touch is the next evening"), and it is fixed nowhere else: the tick
 * cannot tell "never sent" from "not owed", because the only difference between
 * them is when this member's account came into existence.
 *
 * So registration claims whichever of the three times has already gone by on
 * **the member's own clock**, through `suppressToday`. The touch is then not
 * owed, so it is not sent, and the next day runs normally because `isDue`
 * compares the claimed date as strictly older than today.
 *
 * ## Why the member's clock and not the server's
 *
 * Constitution XI, and load-bearing here rather than decorative: at 23:00 in
 * Cairo it is 21:00 UTC, so a server-side comparison against a 22:00
 * preference would suppress the prompt and leave the summary owed — which is
 * precisely the touch the edge case is about. The zone and the three times both
 * come from `MemberSchedulePort`, which is Profile's answer rather than a copy
 * of Profile's defaults; a literal `'21:00'` in this file would be a
 * constitution-XII bug and would also disagree with the tick the first time an
 * operator retuned `settings.defaults.planTomorrowTime`.
 *
 * ## Measured at `occurredAt`, not at `new Date()`
 *
 * The suppression asks "what had already passed when this member registered",
 * so it reads the event's own instant. That matters in both directions a relay
 * can be late in:
 *
 * - A few minutes late — registration at 20:59, delivery at 21:04 — leaves the
 *   21:00 prompt *unsuppressed*, and the tick sends it minutes afterwards. That
 *   is the right side to err on: the member registered before their prompt time
 *   and gets their prompt, slightly late.
 * - A day late leaves yesterday's date claimed, and `isDue` sees a claim
 *   strictly older than today, so today's three touches all fire normally.
 *
 * Reading the delivery moment instead would silently swallow a touch the member
 * was owed every time the relay hiccupped.
 */
@Injectable()
export class RhythmBootstrapHandler {
  private readonly logger = new Logger(RhythmBootstrapHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly states: RhythmStateRepository,
    private readonly schedules: MemberSchedulePort,
  ) {}

  async handle(event: DomainEvent): Promise<'created' | 'already-there'> {
    const userId = event.userId;
    if (!userId) {
      this.logger.warn(
        `${event.name} ${event.eventId} carries no userId; nothing to bootstrap`,
      );
      return 'already-there';
    }

    const existing = await this.states.find(userId);
    if (existing) return 'already-there';

    const at = event.occurredAt;
    const state = RhythmState.create({ userId, at });

    const [schedule] = await this.schedules.forUsers([userId]);
    if (schedule) {
      const today = localDate(at, schedule.timezone);
      const hhmm = localHhMm(at, schedule.timezone);

      // `HH:mm` against `HH:mm` as strings, the same comparison the tick makes
      // — deliberately the same and not coincidentally so. Two different ways
      // of deciding "has this time passed" is how a touch comes to be
      // suppressed here and considered owed there, or the reverse.
      const passed: TouchKind[] = [];
      if (hhmm >= schedule.planTomorrowTime) passed.push('plan');
      if (hhmm >= schedule.endOfDayTime) passed.push('end_of_day');
      if (hhmm >= schedule.morningBriefingTime) passed.push('morning');

      if (passed.length > 0) {
        state.suppressToday(today, passed, at);
        this.logger.log(
          `${userId} registered at ${hhmm} ${schedule.timezone}; ` +
            `suppressed ${passed.join(', ')} for ${today}`,
        );
      }
    } else {
      // Unreachable: the adapter answers for every id asked for, falling back
      // to the installation defaults for a member whose profile has not landed
      // yet. Checked anyway, because the alternative is reading
      // `undefined.timezone` and leaving the member with no row at all — which
      // the tick would then never see, and which no later event would repair.
      this.logger.warn(
        `no schedule for ${userId}; created the row with nothing suppressed`,
      );
    }

    await this.uow.run(() => this.states.save(state));
    return 'created';
  }
}

import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { HeartbeatService } from '../../../../shared/health/heartbeat.service.js';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import { wallClockToUtc } from '../../../../shared/time/time.js';
import type {
  AthleteProfile,
  TrainingSlot,
} from '../../domain/athlete-profile.aggregate.js';
import { Program } from '../../domain/program.aggregate.js';
import { Session } from '../../domain/session.aggregate.js';
import {
  addDays,
  isoWeekday,
  localToday,
  programWeekIndex,
  slotOccurrencesWithin,
  type SlotOccurrence,
} from '../../domain/slot-calendar.js';
import {
  AthleteProfileRepository,
  ProgramRepository,
  SessionRepository,
} from '../../domain/training.repositories.js';

/** The heartbeat key `/health` and the admin overview report staleness on. */
export const TRAINING_MATERIALISE_JOB = 'training.materialise';

/** Mints the ids the program's exercises get as they are copied onto a session. */
export type ExerciseIdFactory = () => string;

/** n8n logs this response, and it is the only record of what a pass did. */
export interface MaterialiseResult {
  members: number;
  created: number;
  filled: number;
  removed: number;
  ms: number;
}

/** What one member's pass did. */
export interface MemberMaterialiseResult {
  created: number;
  filled: number;
  removed: number;
}

/** Which fields of a member's context, when they move, change their calendar. */
const ZONE_FIELD = 'timezone';
const CUTOFF_FIELD = 'nextPracticeCutoff';

/**
 * Turns a weekly timetable into dated sessions, and keeps them in step.
 *
 * ## Why sessions are rows at all
 *
 * `Session`'s own note has the argument and it is worth the restatement,
 * because "derive the week from the slots on read" is the first idea anybody
 * has: a derived session has no id, so nothing can be reminded about it, the
 * phone cannot log it offline, and the rhythm has nothing to name in tomorrow's
 * proposal. The price of materialising is this file — the reconcile, and the
 * "future only, never the past" rules that live in it.
 *
 * ## Five triggers, one pass
 *
 * `SportsChanged`, `SlotsChanged`, `ProgramApplied`, a change to the member's
 * zone or cut-off, and the nightly sweep all run the same per-member pass. Only
 * the zone change asks for anything extra, and even that is additive. Five
 * entry points into one body rather than five bodies is what keeps a redelivered
 * event, a manual run and a catch-up after the gateway was down all converging
 * on the same set of rows.
 *
 * ## Idempotence is the id, not a query
 *
 * `slotSessionId(userId, slotId, localDate)` is derived, so creating a session
 * is an upsert on its primary key: two deliveries collapse, two concurrent
 * passes collapse, and there is no lookup-then-insert to race. `slot-calendar.ts`
 * carries the full argument. This file's contribution is the one read that
 * makes the pass cheap — `findMany` over the fortnight's computed ids, once,
 * rather than a query per slot per day.
 *
 * A second run therefore writes **nothing at all**: every occurrence is already
 * held, the recompute finds every instant already right (`edit` returns an
 * empty list and nothing is saved), and the reconcile finds no orphans. The
 * spec asserts the absence of writes rather than a repeated count, because a
 * count is equally consistent with deleting and re-creating the whole week.
 *
 * ## Where the events go
 *
 * `Session.plan` raises `training.SessionScheduled` itself, so this saga never
 * raises it — and a tombstone raises `SessionDeleted`, a moved instant raises
 * `SessionRescheduled`. All of them reach the outbox because every write here
 * happens inside `uow.run`, which is what the alert pipeline hangs off: a
 * session that appears without its event is a session nobody is reminded about,
 * which is the shape of a defect this codebase shipped in P2.
 */
@Injectable()
export class SessionMaterialiserSaga {
  private readonly logger = new Logger(SessionMaterialiserSaga.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly profiles: AthleteProfileRepository,
    private readonly sessions: SessionRepository,
    private readonly programs: ProgramRepository,
    private readonly member: MemberContextPort,
    private readonly settings: SettingsService,
    private readonly heartbeats: HeartbeatService,
    private readonly nextId: ExerciseIdFactory,
  ) {}

  // --------------------------------------------------------------- triggers

  /**
   * `training.SportsChanged`, `training.SlotsChanged`, `training.ProgramApplied`.
   *
   * One method for three names because they ask the same question — "here is
   * what this member's fortnight should be now" — and the pass is idempotent,
   * so distinguishing them would buy a narrower write and cost a second code
   * path to keep in step. A sports change genuinely changes no dates; it is
   * accepted anyway because a slot referring to a dropped sport may go next and
   * a pass that changes nothing writes nothing.
   */
  async onTrainingChanged(event: DomainEvent): Promise<void> {
    if (!event.userId) return;
    const one = await this.forMember(event.userId, {}, event.occurredAt);
    this.logger.log(
      `${event.name} for ${event.userId}: created ${one.created}, ` +
        `filled ${one.filled}, removed ${one.removed}`,
    );
  }

  /**
   * `profile.ProfileUpdated` and `profile.PreferencesChanged`.
   *
   * ## The zone does not arrive on `PreferencesChanged`, and the plan says it does
   *
   * This phase's plan and its task list both say "`profile.PreferencesChanged`
   * whose `changed[]` names the time zone or `nextPracticeCutoff`". Half of that
   * is unreachable: `timezone` lives on the **profile**, not in
   * `PREFERENCE_FIELDS`, so a member who moves zones raises
   * `profile.ProfileUpdated`. Had this handler been written to the plan it would
   * have been a subscriber to a field that never comes — the zone recompute
   * below would never once have run, and a member who flew would have kept a
   * fortnight of sessions on the old city's clock. Which is v1's three-hour bug
   * with a fortnight's blast radius.
   *
   * So both event names reach here and the *field* decides, which is also the
   * shape Rhythm's `preferences-changed` handler settled on for the same reason:
   * both halves of the member's wall clock — the zone, and the times read
   * against it — belong in one list rather than in one list and one reviewer's
   * memory. If `timezone` ever does move onto preferences, nothing here changes.
   *
   * ## The cut-off changes no session and still runs a pass
   *
   * `nextPracticeCutoff` is read by the `nextPractice` query and by nothing that
   * writes a row, so its pass is a no-op by construction. It is honoured because
   * the plan asks for it and because a pass that changes nothing writes nothing
   * — the cost is one read of a member's fortnight when they move a slider, and
   * the alternative is a reader wondering whether the omission was deliberate.
   */
  async onMemberContextChanged(event: DomainEvent): Promise<void> {
    const changed = (event.payload as { changed?: string[] })?.changed ?? [];
    if (!event.userId) return;

    const zoneMoved = changed.includes(ZONE_FIELD);
    if (!zoneMoved && !changed.includes(CUTOFF_FIELD)) return;

    const one = await this.forMember(
      event.userId,
      { recomputeZone: zoneMoved },
      event.occurredAt,
    );
    this.logger.log(
      `${event.name} (${changed.join(', ')}) for ${event.userId}: ` +
        `created ${one.created}, filled ${one.filled}, removed ${one.removed}`,
    );
  }

  /**
   * The nightly pass: every member who has a week.
   *
   * ## Why nightly and why its own workflow
   *
   * Nothing has to *happen* for tomorrow's edge of the horizon to need filling,
   * so the event branches alone would leave a member's fortnight frozen on a
   * quiet week — and week four of a four-week program would never land, because
   * the whole of FR-008's second half is the horizon advancing past the apply.
   * The existing ticks are no help: `rhythm_tick` and `notifications_sweep` fire
   * every five minutes and would need a claimed date to stop this repeating all
   * day, and `meeting_alerts_reconcile` is Notifications'. A nightly schedule of
   * its own needs no claim, because the work is idempotent.
   *
   * ## A member who throws is logged and skipped
   *
   * Deliberately, and it is the same call the rhythm's tick and the meeting
   * reconcile both make: one member with an unreadable zone or a program whose
   * week arithmetic surprises us must not stop the horizon advancing for
   * everybody else. Aborting would make the blast radius of one bad row the
   * whole installation — and the heartbeat would go green again on the next
   * night that member's slots happened to be materialised already, which is the
   * worst of both, a fault that hides itself and comes back later.
   *
   * The counters are incremented as each member returns, so a member who threw
   * leaves the totals short while whatever it saved before throwing stands.
   * Read the sessions, not this number, when asking what a 03:40 pass did.
   */
  async handle(now: Date = new Date()): Promise<MaterialiseResult> {
    const started = Date.now();
    const result: MaterialiseResult = {
      members: 0,
      created: 0,
      filled: 0,
      removed: 0,
      ms: 0,
    };

    try {
      const userIds = await this.profiles.memberIdsWithSlots();
      for (const userId of userIds) {
        result.members += 1;
        try {
          const one = await this.forMember(userId, {}, now);
          result.created += one.created;
          result.filled += one.filled;
          result.removed += one.removed;
        } catch (error) {
          this.logger.error(
            `materialising failed for ${userId}: ${(error as Error).message}`,
          );
        }
      }

      result.ms = Date.now() - started;
      await this.heartbeats.stamp(
        TRAINING_MATERIALISE_JOB,
        true,
        undefined,
        result.ms,
      );
      return result;
    } catch (error) {
      // Stamped on the way out either way. A scheduled job that stops arriving
      // has to be visible: `/health` reports this key stale after fifteen
      // minutes, and a silent 401 between n8n and the gateway once went
      // unnoticed for days.
      result.ms = Date.now() - started;
      await this.heartbeats.stamp(
        TRAINING_MATERIALISE_JOB,
        false,
        (error as Error).message,
        result.ms,
      );
      throw error;
    }
  }

  // ------------------------------------------------------------- one member

  /**
   * One member's fortnight: create what is missing, fill it, move it if they
   * have moved, and remove what their week no longer contains.
   *
   * Four reads before any write — profile, zone, horizon, existing sessions —
   * and then one transaction, so a crash part way leaves the member's week
   * either as it was or as it should be, never half re-timed.
   */
  async forMember(
    userId: string,
    options: { recomputeZone?: boolean } = {},
    now: Date = new Date(),
  ): Promise<MemberMaterialiseResult> {
    const result: MemberMaterialiseResult = {
      created: 0,
      filled: 0,
      removed: 0,
    };

    const profile = await this.profiles.find(userId);
    // Mid-bootstrap: the relay is eventual, so there is a window after
    // registration in which the profile does not exist. No slots, nothing to
    // materialise, and the `SlotsChanged` that follows their first save runs
    // this again.
    if (!profile) return result;

    const [{ timezone }, days] = await Promise.all([
      this.member.clock(userId),
      this.settings.get('training.materialiseDays'),
    ]);

    // The horizon is the member's own calendar, from their own today. Nothing
    // here reads the server's `TZ` — the API doing that once shifted every
    // extracted reminder in this product by three hours.
    const from = localToday(now, timezone);
    const occurrences = slotOccurrencesWithin(
      userId,
      profile.slots,
      from,
      days,
      timezone,
    );

    const existing = await this.sessions.findMany(
      userId,
      occurrences.map((occurrence) => occurrence.id),
    );
    const held = new Map(existing.map((session) => [session.id, session]));

    const program = await this.programs.activeFor(userId);
    // `isFilling` is active, live *and* applied. An archived program is no
    // longer consulted and the sessions it already filled keep their content
    // untouched — story 4 scenario 4, and the only path that replaces content
    // is applying another program, which warns first.
    const filling = program?.isFilling === true ? program : null;

    await this.uow.run(async () => {
      for (const occurrence of occurrences) {
        const current = held.get(occurrence.id);

        if (current && !current.isDeleted) {
          /*
           * The occurrence exists and is live. Nothing to create — but
           * possibly something to **fill**, and this used to be a bare
           * `continue`.
           *
           * That was the whole of the defect: a program filled a session only
           * at the moment the session was born, so applying one over a
           * fortnight that was already populated warned about five sessions it
           * would replace, took the member's `force`, and rewrote none of
           * them. Only the days beyond the horizon ever carried the plan.
           * `Session.fillFromProgram` carries the rest of the argument.
           *
           * Four reasons to leave a live session alone, and each is a
           * requirement rather than an optimisation:
           */
          const wanted = this.fill(profile, occurrence, filling);

          // No program, no template for this week, or an archived one: the
          // session keeps whatever it has. Story 4 scenario 4 — archiving
          // stops the filling *without rewriting what it already filled*.
          if (!wanted) continue;

          // A record is never overwritten (FR-008). The same predicate the
          // member's warning list was built from, which is what makes the
          // list and the action agree.
          if (!current.isUntouched) continue;

          // And the past is not filled, for the same agreement: `gather`
          // drops an occurrence whose moment has gone, so a program applied
          // from today promises nothing about this morning's session and must
          // therefore not rewrite it.
          if (occurrence.plannedAt.getTime() <= now.getTime()) continue;

          // Already carrying exactly this week of exactly this program. The
          // pass runs nightly and on every slot edit; without this the same
          // session would be rewritten every time, minting new exercise ids,
          // bumping `updatedAt` and pushing a pointless delta at every device
          // — and re-announcing an alert that had not changed.
          if (
            current.programId === wanted.programId &&
            current.weekIndex === wanted.weekIndex
          ) {
            continue;
          }

          current.fillFromProgram(
            {
              title: wanted.template.title,
              focus: wanted.template.focus,
              programId: wanted.programId,
              weekIndex: wanted.weekIndex,
              exercises: Program.exercisesFrom(wanted.template, this.nextId),
            },
            now,
          );
          await this.sessions.save(current);
          result.filled += 1;
          continue;
        }

        if (current) {
          /*
           * The occurrence exists and is tombstoned — the member removed this
           * slot, the reconcile below tombstoned its sessions, and now the slot
           * is back with the same id. Restoring rather than re-planning keeps
           * whatever content the session had and re-announces it, so the alerts
           * come back.
           *
           * Without this branch a member who edited their week and put a slot
           * back would silently have no sessions for that slot for the whole
           * horizon: the id is derived, so `findMany` keeps finding the deleted
           * row and the create is skipped for ever.
           */
          current.restore(now);
          await this.sessions.save(current);
          result.created += 1;
          continue;
        }

        const filled = this.fill(profile, occurrence, filling);
        await this.sessions.save(
          Session.plan({
            id: occurrence.id,
            userId,
            plannedAt: occurrence.plannedAt,
            durationMin: occurrence.slot.durationMin,
            sport: occurrence.slot.sport,
            // The slot's sport is the title of an unfilled session, and that is
            // not a default anybody could want configured: it is the member's
            // own word for what they are doing that evening. A program template
            // overrides it with something they wrote themselves.
            title: filled?.template.title ?? occurrence.slot.sport,
            focus: filled?.template.focus ?? null,
            programId: filled ? filled.programId : null,
            weekIndex: filled ? filled.weekIndex : null,
            slotId: occurrence.slot.id,
            suggestionId: null,
            exercises: filled
              ? Program.exercisesFrom(filled.template, this.nextId)
              : [],
            notes: null,
            createdAt: now,
          }),
        );
        result.created += 1;
        if (filled) result.filled += 1;
      }

      if (options.recomputeZone === true) {
        // Logged rather than returned: the summary's shape is the one
        // `contracts/internal.md` names for this endpoint, and a moved instant
        // is not a created or a removed session. It is visible in the log and
        // in `SessionRescheduled`, which is the reader that acts on it.
        const moved = await this.recompute(profile, timezone, now);
        if (moved > 0) {
          this.logger.log(
            `${profile.userId} changed zone to ${timezone}: re-timed ${moved} session(s)`,
          );
        }
      }

      result.removed += await this.reconcile(profile, now);
    });

    return result;
  }

  // ------------------------------------------------------- the program's part

  /**
   * The template this occurrence should be born with, if any (FR-008).
   *
   * ## `slotOrdinal` is the slot's position among that day's slots, in the
   * member's own slot order
   *
   * A template with no weekday fills **by position** — that is what makes one
   * four-week plan work for a member who trains Monday/Wednesday/Friday and one
   * who trains Tuesday/Thursday/Saturday — so somebody has to say what position
   * means, and `Program.templateFor` explicitly declines to: "the caller knows
   * how the member's week is ordered and this does not".
   *
   * So the ordinal is the index of this slot within `profile.slots` filtered to
   * the same weekday, in the order the profile stores them. Two consequences
   * worth stating, because both are choices:
   *
   * - It is the **member's order**, not the clock's. The editor's list is the
   *   order they arranged, and `setSlots` preserves it; a member with a 07:00
   *   swim and an 18:00 gym on the same Monday gets the first and second
   *   floating templates in the order their own screen shows, not in the order
   *   the hours happen to fall. Sorting by time here would silently re-pair
   *   every template the moment they dragged a row.
   * - It is **stable across the horizon**. The index comes from the profile,
   *   which does not change between one day of the fortnight and the next, so
   *   Monday's second slot is template two in week one and in week four. Taking
   *   the position from the occurrence list instead would be wrong twice over:
   *   that list is sorted by instant and spans every day, so the index would
   *   count the whole fortnight rather than the day.
   */
  private fill(
    profile: AthleteProfile,
    occurrence: SlotOccurrence,
    filling: Program | null,
  ): {
    template: NonNullable<ReturnType<Program['templateFor']>>;
    programId: string;
    weekIndex: number;
  } | null {
    if (!filling?.appliedStartDate) return null;

    const weekIndex = programWeekIndex(
      filling.appliedStartDate,
      occurrence.date,
    );
    // Null means this date is before the program starts, which is not an error:
    // the horizon begins today and a program may have been applied tomorrow.
    if (weekIndex === null) return null;

    const template = filling.templateFor(
      weekIndex,
      isoWeekday(occurrence.date),
      slotOrdinal(profile.slots, occurrence.slot),
    );
    // A program shorter than the weeks remaining simply ends: the slots
    // continue, empty, until another is applied. That is the spec's edge case
    // and it needs no branch of its own — `templateFor` answers null.
    if (!template) return null;

    return { template, programId: filling.id, weekIndex };
  }

  // --------------------------------------------------------- the zone change

  /**
   * Every future `planned` session put back on the slot's wall clock.
   *
   * ## Why anything has to happen at all
   *
   * A slot is a wall-clock time in the member's zone and `plannedAt` is an
   * instant resolved against it. The instant that was 18:00 in Cairo is 17:00
   * in Berlin, and **nothing re-reads the slot at alert time** — the phone's
   * alarm and the server sweep both read the stored instant. So a member who
   * flies keeps training an hour early for a fortnight unless this runs.
   *
   * `edit({ plannedAt })` rather than a repository update, because it raises
   * `SessionRescheduled` and that is what moves the alerts. A silent field
   * write would move the session and leave the reminder where it was, which is
   * worse than not moving either.
   *
   * ## Recovering which date a session belongs to
   *
   * The session stores an instant, not the digits the member typed, and the new
   * zone can read that instant as a different local date. The date is recovered
   * from the *slot* instead: a slot has a fixed weekday, and among three
   * consecutive dates exactly one has any given weekday — so the candidate
   * within a day of the session's local date whose weekday matches the slot is
   * the date the session was created for. A zone change moves a local date by at
   * most one day, so those three candidates are exhaustive.
   *
   * That is also why the derived id stays valid: the id is keyed on the local
   * *date*, which this preserves, so nothing is orphaned and a later pass finds
   * the same session rather than creating a second copy.
   *
   * ## What is deliberately left alone
   *
   * A session with **no `slotId`** — one the member made by hand. They chose an
   * instant and no wall clock was stored, so there is nothing to re-resolve;
   * guessing would move an appointment the member never described in wall-clock
   * terms. A session whose slot is **gone** is left to the reconcile, which is
   * about to tombstone it. And the past and anything logged, completed,
   * cancelled or skipped never reach here — `futurePlanned` is the whole rule.
   */
  private async recompute(
    profile: AthleteProfile,
    timezone: string,
    now: Date,
  ): Promise<number> {
    const sessions = await this.sessions.futurePlanned(profile.userId, now);
    let moved = 0;

    for (const session of sessions) {
      if (!session.slotId) continue;
      const slot = profile.slot(session.slotId);
      if (!slot) continue;

      const date = occurrenceDateOf(session.localDateIn(timezone), slot);
      if (!date) continue;

      const plannedAt = wallClockToUtc(`${date}T${slot.start}`, timezone);
      // Null means the zone itself is unreadable, which is a profile problem
      // rather than a calendar one — and the same skip `slotOccurrencesWithin`
      // makes, for the same reason.
      if (!plannedAt) continue;

      // `edit` compares before it writes and returns an empty list when the
      // instant already matches, so a member whose zone "changed" to the same
      // one — or a second delivery of the same event — saves nothing and raises
      // nothing.
      if (session.edit({ plannedAt }, now).length === 0) continue;
      await this.sessions.save(session);
      moved += 1;
    }

    return moved;
  }

  // ----------------------------------------------------------- the reconcile

  /**
   * Future `planned` sessions whose slot is gone, tombstoned.
   *
   * ## Tombstoned rather than removed, and this is the decision
   *
   * A hard delete is unreachable by the phone. Sessions sync, the pull is a
   * delta by cursor, and the client's delete sweep runs **only** against a full
   * snapshot — so a row removed on the server stays on every device for ever,
   * with an alarm the device will duly fire. Deletions reach a client as
   * tombstones or they do not reach it at all. `tombstone()` also raises
   * `SessionDeleted`, which is what drops the alerts; `remove` announces
   * nothing.
   *
   * And it keeps the status, which is the rule this codebase states three times:
   * deleting a thing must not touch the record of whether it was completed,
   * cancelled or never dealt with. These were never dealt with, and the Deleted
   * view exists to show exactly that — the member did not delete these
   * sessions, their *slot* went, so leaving them recoverable is the honest
   * outcome rather than a tidy one. `reminders.tombstoneDays` reaps them later,
   * through the purge every synced collection already has.
   *
   * ## What the port's signature guarantees
   *
   * `orphanedPlanned(userId, after, keepSlotIds)` is the rule rather than a
   * filter this method applies: `after` keeps it out of the past, `planned`
   * keeps it away from anything logged, completed, cancelled or skipped, and
   * `keepSlotIds` is what the profile still holds — so a session with no
   * `slotId` can never match it, which is what keeps a hand-made session safe.
   * The belt-and-braces checks below cost two comparisons and would catch an
   * adapter that got the query wrong; the Mongo and in-memory adapters are two
   * implementations of one promise and this is the caller that would be silently
   * destroyed by a disagreement.
   */
  private async reconcile(profile: AthleteProfile, now: Date): Promise<number> {
    const keep = profile.slots.map((slot) => slot.id);
    const orphans = await this.sessions.orphanedPlanned(
      profile.userId,
      now,
      keep,
    );

    let removed = 0;
    for (const session of orphans) {
      if (session.isDeleted) continue;
      if (session.status !== 'planned') continue;
      if (!session.slotId || keep.includes(session.slotId)) continue;
      if (session.plannedAt <= now) continue;

      session.tombstone(now);
      await this.sessions.save(session);
      removed += 1;
    }

    return removed;
  }
}

/**
 * A slot's position among the slots that share its weekday, in the order the
 * member's profile holds them. See `fill` for why that order and not the clock.
 *
 * Exported for the spec: the ordinal is what pairs a floating template with a
 * slot, so an off-by-one here gives a member somebody else's Wednesday.
 */
export function slotOrdinal(slots: TrainingSlot[], slot: TrainingSlot): number {
  const sameDay = slots.filter((entry) => entry.weekday === slot.weekday);
  const index = sameDay.findIndex((entry) => entry.id === slot.id);
  // -1 is unreachable — the slot came from this list — and 0 is the safe
  // reading if it ever were: the first template rather than none.
  return index < 0 ? 0 : index;
}

/**
 * The local date a slot's session was created for, given how the *new* zone
 * reads its instant.
 *
 * Three consecutive dates have three different weekdays, so exactly one
 * candidate matches the slot's; a zone change shifts a local date by at most one
 * day, so the three are exhaustive. Null is therefore unreachable for a valid
 * slot and is returned rather than thrown, because a weekday that matches
 * nothing means the session does not belong to this slot and the safe action is
 * to leave its instant alone.
 */
function occurrenceDateOf(
  localDate: string,
  slot: TrainingSlot,
): string | null {
  for (const offset of [0, -1, 1]) {
    const candidate = addDays(localDate, offset);
    if (isoWeekday(candidate) === slot.weekday) return candidate;
  }
  return null;
}

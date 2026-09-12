import { Injectable } from '@nestjs/common';
import { isUuid } from '../../../../shared/cqrs/ids.js';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import {
  Meeting,
  type MeetingSource,
} from '../../domain/meeting.aggregate.js';
import type {
  MeetingLocation,
  MeetingRecurrence,
} from '../../domain/recurrence-expander.js';
import { MeetingDefaultsPort } from '../../domain/meetings.ports.js';
import { MeetingRepository } from '../../domain/meetings.repositories.js';

export class InvalidMeetingId extends Error {
  constructor(id: string) {
    super(
      `"${id}" is not a UUID. The client mints the id, and it has to be a UUIDv7.`,
    );
  }
}

export interface CreateMeetingCommand {
  /** Minted by the client. See the class comment for why the server does not. */
  id: string;
  title: string;
  description?: string | null;
  startAt: Date;
  /** Absent means the member's own default length (FR-001). */
  durationMin?: number | null;
  location: MeetingLocation;
  prepNotes?: string | null;
  prepMinutes?: number | null;
  /** Absent means the member's own advance warnings (FR-003). */
  reminderOffsets?: number[] | null;
  recurrence?: MeetingRecurrence | null;
  lockTimezone?: string | null;
  source?: MeetingSource;
}

export interface CreateMeetingResult {
  id: string;
  updatedAt: Date;
  /** True when this call created nothing because the meeting was already there. */
  replayed: boolean;
}

/** `1h`, `30m`, `1d`. The shape the settings registry validates. */
const LEAD_TIME = /^(\d{1,3})([mhd])$/;

/**
 * One of the member's lead times as minutes before the occurrence, or null for
 * anything unreadable.
 *
 * Null rather than a throw, because a lead time arrives from a member's stored
 * preferences and one bad entry must not stop the other warnings being set up.
 *
 * ## Why the conversion happens once, here, at creation
 *
 * `MeetingState.reminderOffsets` carries the long version of this: the offsets
 * are *stored on the meeting* rather than resolved from the preference on every
 * read, so a member who sets up a standing call and later changes their global
 * warning does not find that call's warnings silently moved with it. Resolving
 * on read would make every existing meeting's reminders a function of a
 * preference the member was editing for the next meeting they create.
 *
 * That also means the two representations do not have to agree for ever. The
 * preference speaks in durations because that is how a member says it (`1h`);
 * a meeting speaks in minutes because that is what the alert saga subtracts
 * from an instant. The translation belongs at the boundary between them, which
 * is exactly this call.
 *
 * ## Why this is a copy of Notifications' `leadMinutes` and not an import
 *
 * Because Meetings may not import Notifications' `domain/` (constitution IX,
 * and `no-restricted-imports` refuses it). This is the second copy, which the
 * constitution prices as cheaper than a shared abstraction; the third copy is
 * the one that moves to `shared/`.
 */
export function leadTimeMinutes(lead: string): number | null {
  const match = LEAD_TIME.exec(lead.trim().toLowerCase());
  if (!match) return null;
  const count = Number(match[1]);
  switch (match[2]) {
    case 'd':
      return count * 1440;
    case 'h':
      return count * 60;
    default:
      return count;
  }
}

/**
 * A new meeting, or a series (FR-001).
 *
 * **The client supplies the id, and a repeat of it is not an error.** The phone
 * creates meetings with no network and needs a stable reference before the
 * server has ever heard of the row, so the id is minted there. That makes a
 * retry after a dropped connection indistinguishable from a genuine second
 * create — unless the id decides it, which is what happens here: an id that
 * already exists is answered as the create that already happened, with no
 * second `MeetingScheduled` for the alert saga to reconcile twice.
 *
 * The check is a read followed by a write and therefore racy in principle. Two
 * simultaneous creates of one id cannot both *win*, because `_id` is the
 * primary key — the second write fails on it — and the loser is a retry of a
 * create that succeeded, which is the case this handler already answers.
 *
 * ## The two defaults this handler resolves, and where each comes from
 *
 * A member who names no length gets their default meeting length, and a member
 * who names no warnings gets their own advance warnings (FR-001, FR-003).
 * `defaults.leadTimes` reaches this handler through `MemberContextPort`, which
 * answers with the member's stored preference and falls back to the registry
 * for a member whose profile row has not been written yet.
 *
 * `defaults.meetingDurationMin` reaches it through `MeetingDefaultsPort`,
 * which is bound in this context's own `infrastructure/` to Profile's
 * published `preferencesFor` read and falls back to the registry for a member
 * whose preferences row the bootstrap has not written yet.
 *
 * It was the settings registry directly for one draft of this handler, which
 * would have been a quiet constitution XII violation: `meetingDurationMin` is a
 * `user_preferences` field seeded from `settings.defaults.*`, so reading the
 * installation value means the editor silently ignores what the member set.
 * The two agree for anybody who has not changed it, which is exactly what makes
 * the bug invisible — and the port's own comment says why it is a third port
 * rather than a fourth field on the shared scheduling one.
 */
@Injectable()
export class CreateMeetingHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly meetings: MeetingRepository,
    private readonly member: MemberContextPort,
    private readonly defaults: MeetingDefaultsPort,
  ) {}

  async handle(
    userId: string,
    command: CreateMeetingCommand,
  ): Promise<CreateMeetingResult> {
    if (!isUuid(command.id)) throw new InvalidMeetingId(command.id);

    const existing = await this.meetings.findById(userId, command.id);
    if (existing) {
      return { id: existing.id, updatedAt: existing.updatedAt, replayed: true };
    }

    // The member's zone right now. It validates the rule and is kept as
    // `authoredTimezone` — the clock the member was reading when they chose
    // "18:00" — which is what lets the expander recover those digits later
    // wherever the member happens to be (FR-007). No resolved instant is
    // stored against a zone, and the server's own `TZ` is never consulted.
    const { timezone } = await this.member.clock(userId);

    const durationMin =
      command.durationMin ?? (await this.defaults.durationMinFor(userId));

    const reminderOffsets =
      command.reminderOffsets ?? (await this.defaultOffsets(userId));

    const now = new Date();
    const meeting = Meeting.schedule({
      id: command.id,
      userId,
      title: command.title,
      description: command.description ?? null,
      startAt: command.startAt,
      durationMin,
      lockTimezone: command.lockTimezone ?? null,
      location: command.location,
      prepNotes: command.prepNotes ?? null,
      prepMinutes: command.prepMinutes ?? 0,
      reminderOffsets,
      recurrence: command.recurrence ?? null,
      source: command.source ?? 'app',
      createdAt: now,
      timezone,
    });

    await this.uow.run(() => this.meetings.save(meeting));
    return { id: meeting.id, updatedAt: meeting.updatedAt, replayed: false };
  }

  /**
   * The member's advance warnings as minute offsets.
   *
   * Unreadable entries are dropped rather than refused: the member asked for a
   * meeting, not for a lecture about a preference they may never have typed.
   * The aggregate then sorts and de-duplicates what is left.
   */
  private async defaultOffsets(userId: string): Promise<number[]> {
    const { leadTimes } = await this.member.alertPreferences(userId);
    return leadTimes
      .map((lead) => leadTimeMinutes(lead))
      .filter((minutes): minutes is number => minutes !== null);
  }
}

import {
  Args,
  Field,
  ID,
  Int,
  ObjectType,
  Query,
  Resolver,
  registerEnumType,
} from '@nestjs/graphql';
import {
  CurrentPrincipal,
  UsersOnly,
} from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { DateScalar, DateTimeScalar } from '../../../../graphql/scalars.js';
import { MeetingQueryHandler } from '../meeting/meeting.query.js';
import { MeetingsQueryHandler } from '../meetings/meetings.query.js';
import { MeetingOccurrencesQueryHandler } from '../meeting-occurrences/meeting-occurrences.query.js';
import { MonthOverviewQueryHandler } from '../month-overview/month-overview.query.js';
import { AgendaQueryHandler } from './agenda.query.js';

/**
 * Where the meeting is. Both halves nullable and never both null — the write
 * refuses a meeting with neither (FR-001) — which the schema cannot express
 * and the aggregate can, so the aggregate does.
 */
@ObjectType('Location')
export class LocationType {
  @Field(() => String, { nullable: true })
  onlineLink!: string | null;

  @Field(() => String, { nullable: true })
  address!: string | null;
}

/**
 * One occurrence the member moved.
 *
 * `originalStart` is the key and is never null: an override is attached to the
 * moment the *rule* produced, which is what lets a series edit still find it
 * and what makes moving the same occurrence twice one override rather than two.
 *
 * The SDL declares a `cancelled: Boolean` here and this type does not carry
 * it, deliberately. A skipped occurrence is an **exdate**, not an override —
 * a skip has nothing left to say about the occurrence, and keeping a row alive
 * to describe an absence would give the expander two places to look for the
 * same fact. `location` is here and is not in the SDL, because an override may
 * move where a meeting is as well as when, and the day view has to be able to
 * show the room that changed.
 */
@ObjectType('Override')
export class OverrideType {
  @Field(() => DateTimeScalar)
  originalStart!: Date;

  @Field(() => DateTimeScalar, { nullable: true })
  startAt!: Date | null;

  @Field(() => Int, { nullable: true })
  durationMin!: number | null;

  @Field(() => String, { nullable: true })
  title!: string | null;

  @Field(() => LocationType, { nullable: true })
  location!: { onlineLink: string | null; address: string | null } | null;
}

/**
 * The repeat: the rule, its exceptions, and a sentence.
 *
 * `humanText` is rendered server-side — "every 2 weeks on Tuesday" — so the
 * web app, the extension and any future surface need not each carry an RRULE
 * parser. `rrule` is sent as well, because the phone expands the series itself
 * to keep the calendar working offline (FR-010) and no client can expand a
 * sentence. Both, for two different readers.
 */
@ObjectType('MeetingRecurrence')
export class MeetingRecurrenceType {
  @Field(() => DateTimeScalar)
  dtstart!: Date;

  @Field(() => String)
  rrule!: string;

  @Field(() => String)
  humanText!: string;

  @Field(() => [DateTimeScalar])
  exdates!: Date[];

  @Field(() => [OverrideType])
  overrides!: OverrideType[];
}

/**
 * `scheduled | completed | cancelled`, as an enum rather than a string.
 *
 * GraphQL refusing `status: "canceled"` at the edge is worth more than the
 * type safety: the three states mean different things to the Deleted view and
 * to the alert saga, and a typo falling through a client's `switch` to its
 * default would show a cancelled meeting as one that is still on.
 */
export enum MeetingStatusName {
  scheduled = 'scheduled',
  completed = 'completed',
  cancelled = 'cancelled',
}

registerEnumType(MeetingStatusName, {
  name: 'MeetingStatus',
  description:
    'In the diary, it happened, or it is off. Deleting never changes it — the status is the only record of which, and the Deleted view exists to show exactly that.',
});

/**
 * A meeting, as a screen reads it.
 *
 * `nextOccurrence` is computed rather than stored (FR-006), which is what puts
 * "next: Tuesday" on a list row without materialising a single occurrence. It
 * is null for a series that has run out, and for a completed, cancelled or
 * deleted meeting.
 *
 * `lockTimezone` is here and is not in the blueprint's SDL. It earns its
 * place: it is the state of the editor's "keep this meeting on <place>'s
 * clock" toggle (FR-007), and a flag a member can set and never read back is
 * a setting they cannot confirm.
 */
@ObjectType('Meeting')
export class MeetingType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => DateTimeScalar)
  startAt!: Date;

  @Field(() => Int)
  durationMin!: number;

  /**
   * On the row because the blueprint's document carries it, and **always
   * false** in this phase: a whole-day entry is a personal event (FR-001).
   */
  @Field(() => Boolean)
  allDay!: boolean;

  @Field(() => String, { nullable: true })
  lockTimezone!: string | null;

  @Field(() => LocationType)
  location!: LocationType;

  @Field(() => String, { nullable: true })
  prepNotes!: string | null;

  @Field(() => Int)
  prepMinutes!: number;

  /** Minutes before the occurrence, furthest first. Fixed at creation. */
  @Field(() => [Int])
  reminderOffsets!: number[];

  @Field(() => MeetingRecurrenceType, { nullable: true })
  recurrence!: MeetingRecurrenceType | null;

  @Field(() => MeetingStatusName)
  status!: MeetingStatusName;

  @Field(() => DateTimeScalar, { nullable: true })
  nextOccurrence!: Date | null;
}

/**
 * A birthday, a holiday, a block of focus time (FR-011).
 *
 * Reachable only through `AgendaItem.event`, and that is why the field exists:
 * this phase has no `event(id)` query, so without it the type is unreferenced
 * — and code-first drops an unreferenced type from the SDL entirely, which
 * would leave the blueprint promising a `CalendarEvent` no client could ever
 * name. "A read that a client cannot reach is a read that does not exist"
 * applies to a type in a contract exactly as it applies to a query handler
 * with no resolver.
 *
 * `startAt` and `endAt` are the **series'** own. The occurrence is already on
 * the row as `occurrenceAt` and `endAt`; this is the thing the member opens.
 */
@ObjectType('CalendarEvent')
export class CalendarEventType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  @Field(() => DateTimeScalar)
  startAt!: Date;

  @Field(() => DateTimeScalar)
  endAt!: Date;

  @Field(() => Boolean)
  allDay!: boolean;

  @Field(() => String, { nullable: true })
  color!: string | null;

  /**
   * The same type a meeting's repeat uses, because FR-011 says a repeating
   * event skips, moves and ends exactly as a repeating meeting does — one
   * recurrence shape, one expander, one fixture table. The blueprint's SDL
   * wrote `recurrence: Recurrence`, a type it never defines; `MeetingRecurrence`
   * is what it meant.
   */
  @Field(() => MeetingRecurrenceType, { nullable: true })
  recurrence!: MeetingRecurrenceType | null;
}

/**
 * One occurrence with its scheduling facts, for a client that plans its own
 * alarms.
 *
 * Not in the blueprint's SDL — the SDL has the agenda and the month, both of
 * which are *screens*. This one is the shape Notifications' saga and P3's
 * rhythm read in process, exposed over GraphQL as well because the extension's
 * side panel wants the next seven days of meetings with a join button and
 * nothing else: asking for `agenda` would hand it tasks, sessions and
 * preparation blocks to filter back out.
 */
@ObjectType('MeetingOccurrence')
export class MeetingOccurrenceType {
  @Field(() => ID)
  meetingId!: string;

  @Field(() => String)
  title!: string;

  /** The rule's own moment: what a skip or a move names when sent back. */
  @Field(() => DateTimeScalar)
  originalStart!: Date;

  @Field(() => DateTimeScalar)
  startAt!: Date;

  @Field(() => DateTimeScalar)
  endAt!: Date;

  @Field(() => Int)
  durationMin!: number;

  @Field(() => LocationType)
  location!: LocationType;

  @Field(() => Int)
  prepMinutes!: number;

  @Field(() => [Int])
  reminderOffsets!: number[];

  /** An override moved it, so a client can mark it as changed. */
  @Field(() => Boolean)
  moved!: boolean;
}

export enum AgendaKindName {
  meeting = 'meeting',
  prep = 'prep',
  task = 'task',
  session = 'session',
  event = 'event',
}

registerEnumType(AgendaKindName, {
  name: 'AgendaKind',
  description:
    'What a row on the agenda is. `prep` is its own kind rather than an attribute of a meeting, because half an hour of preparation is half an hour that is not free (FR-002).',
});

/**
 * One row on the day.
 *
 * ## Two of the five kinds carry their object; three carry `(kind, id)`
 *
 * The blueprint writes `AgendaItem { …, meeting: Meeting, task: Task,
 * session: Session, event: CalendarEvent }`. Two of those four are here and
 * two are not, and the split is architectural rather than an oversight.
 *
 * `Meeting` and `CalendarEvent` are **this context's own** aggregates, so
 * nesting them costs nothing but bytes — and `CalendarEvent` has no other way
 * into the schema at all in this phase, since there is no `event(id)` query
 * and code-first drops an unreferenced type. `Task` belongs to Planning and
 * `Session` to Training, and a `features/` file importing another context's
 * GraphQL type is precisely what constitution IX forbids and what
 * `no-restricted-imports` refuses in both directions. Declaring a local
 * lookalike would be worse than the gap: a second copy of somebody else's
 * shape, free to drift, with nothing in either repository saying they are
 * meant to match.
 *
 * So a `task` or `session` row carries `(kind, id)` and the client asks the
 * context that owns it — `task(id)` on Planning's resolver, Training's
 * equivalent from P6. Every row carries `title`, `subtitle` and `color`
 * regardless, so the agenda renders completely from the row alone; the nested
 * object is for a client that wants the *detail* without a second round trip,
 * never for the row to be legible.
 *
 * ## Identity is the triple, not the id
 *
 * A row is `(kind, id, occurrenceAt)`. **A preparation row deliberately shares
 * its meeting's id** — and its `meeting` object — so tapping either opens the
 * meeting it is preparation for; a synthesised composite id would be unique
 * and would have nothing to open. A series contributes one row per occurrence.
 */
@ObjectType('AgendaItem')
export class AgendaItemType {
  @Field(() => AgendaKindName)
  kind!: AgendaKindName;

  @Field(() => ID)
  id!: string;

  @Field(() => DateTimeScalar)
  occurrenceAt!: Date;

  /** Null for a timed task: it has a moment and no length. */
  @Field(() => DateTimeScalar, { nullable: true })
  endAt!: Date | null;

  @Field(() => String)
  title!: string;

  @Field(() => String, { nullable: true })
  subtitle!: string | null;

  @Field(() => String, { nullable: true })
  color!: string | null;

  /**
   * A whole-day personal event, to be shown apart from the timed items
   * (FR-011 scenario 1). Not in the SDL, and the scenario cannot be satisfied
   * without it: the row is grouped into its day like everything else, so the
   * client has no other way to know it does not belong on the hour grid.
   */
  @Field(() => Boolean)
  allDay!: boolean;

  /** Populated on a `meeting` row and on its `prep` row. Null otherwise. */
  @Field(() => MeetingType, { nullable: true })
  meeting!: MeetingType | null;

  /** Populated on an `event` row. Null otherwise. */
  @Field(() => CalendarEventType, { nullable: true })
  event!: CalendarEventType | null;
}

/**
 * One day of the agenda.
 *
 * `date` is a `Date` scalar — `YYYY-MM-DD` in the **member's** zone — and not
 * a `DateTime`. "Which day was this" and "which instant was this" are
 * different questions, and answering the first with the second is how a
 * meeting at 23:30 in Cairo shows up on the following day. Days with nothing
 * on them are absent rather than present and empty; `monthOverview` is the
 * read that returns a row per day.
 */
@ObjectType('AgendaDay')
export class AgendaDayType {
  @Field(() => DateScalar)
  date!: string;

  @Field(() => [AgendaItemType])
  items!: AgendaItemType[];
}

@ObjectType('AgendaKindCounts')
export class AgendaKindCountsType {
  @Field(() => Int)
  meeting!: number;

  @Field(() => Int)
  prep!: number;

  @Field(() => Int)
  task!: number;

  @Field(() => Int)
  session!: number;

  @Field(() => Int)
  event!: number;
}

/**
 * One cell of the month grid. Not in the blueprint's SDL, which names the
 * `monthOverview` query without giving it a shape.
 *
 * `byKind` as well as `total` because the marker is a dot per kind on the
 * design, and `total` alone would make the client fetch the whole month's
 * agenda to colour it.
 */
@ObjectType('MonthDay')
export class MonthDayType {
  @Field(() => DateScalar)
  date!: string;

  @Field(() => Int)
  total!: number;

  @Field(() => AgendaKindCountsType)
  byKind!: AgendaKindCountsType;

  /** At least one item of any kind (FR-009). See `MonthDay.busy`. */
  @Field(() => Boolean)
  busy!: boolean;
}

/**
 * Meetings & Calendar's read surface — all five reads, in one resolver.
 *
 * This file is not optional polish, and the comment is here because the
 * project has learned it twice. Constitution X puts reads on GraphQL, and a
 * query handler with a spec and no resolver is a read no client can reach: it
 * happened to the whole of Planning's read side in P2 and again to P4's
 * `quickQuestions`, and both times the handlers had passing specs, which is
 * exactly why nobody noticed. So every handler this phase writes appears
 * below, this class goes in `RESOLVERS` in `graphql/graphql.module.ts`, and
 * the five queries are checked into the regenerated
 * `packages/contracts/schema.graphql` — that file is the proof.
 *
 * Every query takes the member from the principal and never from an argument.
 * A `userId` parameter on `agenda` would be a way to read somebody else's
 * diary that no amount of scoping inside a handler could close.
 *
 * The windows, on the other hand, come from the client, because the client
 * drew the calendar: it knows which month it is showing. The one thing it does
 * *not* decide is which day an instant belongs to — every handler behind this
 * resolves that against the member's own zone through `MemberContextPort`.
 */
@Resolver()
@UsersOnly()
export class CalendarResolver {
  constructor(
    private readonly meeting: MeetingQueryHandler,
    private readonly meetings: MeetingsQueryHandler,
    private readonly occurrences: MeetingOccurrencesQueryHandler,
    private readonly agendaQuery: AgendaQueryHandler,
    private readonly monthOverview: MonthOverviewQueryHandler,
  ) {}

  @Query(() => MeetingType, { name: 'meeting', nullable: true })
  async byId(
    @CurrentPrincipal() principal: Principal,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<MeetingType | null> {
    const view = await this.meeting.byId(principal.id, id);
    return (view as unknown as MeetingType) ?? null;
  }

  /**
   * The member's meetings, soonest occurrence first.
   *
   * `includeCompleted` defaults to false: a completed meeting is history the
   * member asks for, and a cancelled one stays in the list because a cancelled
   * meeting is a fact about a date they may still be looking for.
   */
  @Query(() => [MeetingType], { name: 'meetings' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Args('includeCompleted', { type: () => Boolean, nullable: true })
    includeCompleted?: boolean,
  ): Promise<MeetingType[]> {
    const views = await this.meetings.list(
      principal.id,
      includeCompleted ?? false,
    );
    return views as unknown as MeetingType[];
  }

  /** Meetings, preparation blocks, timed tasks, training and events, by day. */
  @Query(() => [AgendaDayType], { name: 'agenda' })
  async agenda(
    @CurrentPrincipal() principal: Principal,
    @Args('from', { type: () => DateTimeScalar }) from: Date,
    @Args('to', { type: () => DateTimeScalar }) to: Date,
  ): Promise<AgendaDayType[]> {
    const days = await this.agendaQuery.between(principal.id, from, to);
    return days as unknown as AgendaDayType[];
  }

  /**
   * One row per day of the month, empty days included, so the grid knows what
   * to leave unmarked.
   *
   * `month` is 1–12 as a member says it. Zero-based across a boundary nobody
   * can put a comment on is a whole month of markers on the wrong screen.
   */
  @Query(() => [MonthDayType], { name: 'monthOverview' })
  async month(
    @CurrentPrincipal() principal: Principal,
    @Args('year', { type: () => Int }) year: number,
    @Args('month', { type: () => Int }) month: number,
  ): Promise<MonthDayType[]> {
    const days = await this.monthOverview.forMonth(principal.id, year, month);
    return days as unknown as MonthDayType[];
  }

  /**
   * Just the meeting occurrences, with their scheduling facts.
   *
   * The same handler Notifications' saga and P3's rhythm call in process. It
   * is exposed here for the extension's side panel — the next seven days of
   * meetings with a join button — which would otherwise have to ask for
   * `agenda` and filter four other kinds back out.
   */
  @Query(() => [MeetingOccurrenceType], { name: 'meetingOccurrences' })
  async occurrencesBetween(
    @CurrentPrincipal() principal: Principal,
    @Args('from', { type: () => DateTimeScalar }) from: Date,
    @Args('to', { type: () => DateTimeScalar }) to: Date,
  ): Promise<MeetingOccurrenceType[]> {
    const views = await this.occurrences.forMember(principal.id, from, to);
    return views as unknown as MeetingOccurrenceType[];
  }
}

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
import { CheckinsQueryHandler } from '../checkins/checkins.query.js';
import { PlansQueryHandler } from '../plans/plans.query.js';
import { StreakQueryHandler } from '../streak/streak.query.js';
import { TomorrowDraftQueryHandler } from '../tomorrow-draft/tomorrow-draft.query.js';
import { TodayPlanQueryHandler } from './today-plan.query.js';

/**
 * What the member decided about a day.
 *
 * An enum rather than a string, so `status: "confimed"` is refused at the edge
 * instead of falling through a client's `switch` to whatever its default draws.
 * The three values are exactly the aggregate's `PlanStatus`, and a plan for a
 * day nobody has planned reports `draft` — see `emptyPlanView`.
 */
export enum PlanStatusName {
  draft = 'draft',
  confirmed = 'confirmed',
  skipped = 'skipped',
}

registerEnumType(PlanStatusName, {
  name: 'PlanStatus',
  description:
    'What the member decided about a day: proposed and unanswered, agreed, or declined. A day with no plan at all reads as `draft` with no `promptedAt`.',
});

/**
 * A task, as the plan recorded it.
 *
 * ## `status` is in the SDL and is not here, deliberately
 *
 * `contracts/graphql.schema.graphql` declares
 * `PlanTask { …, status: TaskStatus! }`, and this type does not carry it. The
 * blueprint wrote that field expecting the plan to be able to ask Planning how
 * each task stands now; nothing in this phase can answer.
 *
 * The plan stores a **snapshot** — id, title, priority, `dueAt`, `deferCount`
 * — because it is the record of what the member was shown and agreed to, and
 * `PlannedTasksPort` (the only door this context has onto Planning, declared
 * in `domain/rhythm.ports.ts`) returns that same `PlanTask` shape from both
 * its methods. There is no live status behind it to read. Resolving one would
 * take a new method on that port, a new query handler on Planning's side to
 * bind it to, and a per-task fan-out on every Home render.
 *
 * So the honest options were to omit the field or to invent it, and inventing
 * it is the worse failure: `status: 'open'` hard-coded, or derived from
 * `dueAt < now`, would be a value that looked authoritative and told a member
 * their completed task was still outstanding. A field a client cannot request
 * is a gap somebody notices; a field that lies is a gap nobody does. Recorded
 * for whoever reconciles the SDL — the same divergence applies to
 * `PlanTraining.status`, whose `NextSessionPort` is a null-returning stub
 * until P6 and so cannot report a session status either.
 *
 * `deferCount` is here and is *not* in the SDL, and it earns its place: the
 * confirm sheet renders "carried over ×3" beside a task, and that count is the
 * only thing that makes the badge true.
 */
@ObjectType('PlanTask')
export class PlanTaskType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  title!: string;

  @Field(() => Int)
  priority!: number;

  @Field(() => DateTimeScalar, { nullable: true })
  dueAt!: Date | null;

  @Field(() => Int)
  deferCount!: number;
}

/** The training slot. Null until P6 binds `NextSessionPort` to Training. */
@ObjectType('PlanTraining')
export class PlanTrainingType {
  @Field(() => ID)
  sessionId!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  sport!: string;

  @Field(() => DateTimeScalar)
  startAt!: Date;
}

/**
 * One day, as the member and Botvy agreed it.
 *
 * `date` is a `Date` scalar — `YYYY-MM-DD` — and not a `DateTime`, and the
 * distinction is the one constitution XI is about. "Which day was this" and
 * "which instant was this" are different questions, and answering the first
 * with the second is how a plan for Tuesday appears on Monday evening for
 * everyone west of the server. The four timestamps below *are* instants,
 * because "when did the summary go out" genuinely is one.
 *
 * All four are nullable together with no combined status, because they are
 * four separate claims and three of them can be true independently:
 * "summarised without having been prompted" is the state of a member who
 * registered at 21:30, and it is a state the tick decides on.
 */
@ObjectType('DailyPlan')
export class DailyPlanType {
  @Field(() => DateScalar)
  date!: string;

  @Field(() => PlanStatusName)
  status!: PlanStatusName;

  @Field(() => Boolean)
  autoConfirmed!: boolean;

  @Field(() => [PlanTaskType])
  tasks!: PlanTaskType[];

  @Field(() => PlanTrainingType, { nullable: true })
  training!: PlanTrainingType | null;

  @Field(() => String, { nullable: true })
  workoutLine!: string | null;

  @Field(() => String, { nullable: true })
  mealLine!: string | null;

  /**
   * `allergen` | `empty_library` | `model_unavailable`, or null.
   *
   * A `String` rather than Nutrition's enum: this type belongs to Rhythm, and a
   * resolver importing another context's enum is the cross-context import
   * `no-restricted-imports` refuses. The enum itself is published on
   * `TodayMeals`, where the context that owns the vocabulary defines it.
   */
  @Field(() => String, { nullable: true })
  mealReason!: string | null;

  /** The two halves joined (FR-008). English; clients may build their own. */
  @Field(() => String)
  dayLine!: string;

  @Field(() => DateTimeScalar, { nullable: true })
  promptedAt!: Date | null;

  @Field(() => DateTimeScalar, { nullable: true })
  confirmedAt!: Date | null;

  @Field(() => DateTimeScalar, { nullable: true })
  summarisedAt!: Date | null;

  @Field(() => DateTimeScalar, { nullable: true })
  briefedAt!: Date | null;
}

/**
 * How one day went, by the member's own account.
 *
 * Every field but the date is nullable on purpose. A mood of 0 is a member
 * having a terrible day and `null` is a member who did not answer that half,
 * and the schema has to be able to say both — a non-null `mood` would force
 * the write side to invent a number for a chat reply that only carried a
 * verdict.
 */
@ObjectType('Checkin')
export class CheckinType {
  @Field(() => DateScalar)
  date!: string;

  @Field(() => Int, { nullable: true })
  mood!: number | null;

  @Field(() => Boolean, { nullable: true })
  adhered!: boolean | null;

  @Field(() => String, { nullable: true })
  note!: string | null;
}

/**
 * The streak, and the week's dots.
 *
 * `weekAdherence` is `[Boolean]` — nullable *items* inside a non-null list,
 * exactly as the SDL writes it, and that is the whole reason this type is
 * worth a comment. There are always seven entries, so the list itself is
 * never null; each entry is `true`, `false` or `null`, because a day was
 * adhered, missed, or **not answered**.
 *
 * `[Boolean!]!` would have been the instinct and would have been wrong: it
 * forces the resolver to coerce the third state into one of the other two, and
 * rendering an unanswered day as a miss tells a member they broke a streak
 * they did not break. Do not "tidy" the bang back in.
 */
@ObjectType('Streak')
export class StreakType {
  @Field(() => Int)
  current!: number;

  @Field(() => Int)
  best!: number;

  @Field(() => DateScalar, { nullable: true })
  lastAdheredDate!: string | null;

  @Field(() => [Boolean], { nullable: 'items' })
  weekAdherence!: (boolean | null)[];
}

/**
 * The rhythm's read surface.
 *
 * Constitution X splits the transports by what they do — commands are REST,
 * reads are GraphQL — and P2 shipped only half of that: the query handlers
 * were written, specced and provided, and no resolver existed, so six views
 * the member's screens are built from were unreachable over the transport the
 * constitution designates for reads. The handlers having specs is exactly why
 * the gap was invisible; a resolver is not optional polish. This file exists
 * so that does not happen twice.
 *
 * Every query takes the member from the principal and never from an argument.
 * A `userId` parameter on `streak` would be a way to read somebody else's
 * adherence history that no amount of scoping inside the handler could close.
 *
 * `plans` and `checkins` take their range from the client because the client
 * drew the calendar; `todayPlan`, `tomorrowDraft` and `streak` resolve the
 * member's own day server-side, through `MemberSchedulePort`, because a
 * handset's idea of midnight is not something to trust with a history screen.
 */
@Resolver()
@UsersOnly()
export class RhythmResolver {
  constructor(
    private readonly todayPlan: TodayPlanQueryHandler,
    private readonly tomorrowDraft: TomorrowDraftQueryHandler,
    private readonly plans: PlansQueryHandler,
    private readonly checkins: CheckinsQueryHandler,
    private readonly streak: StreakQueryHandler,
  ) {}

  /**
   * `date` is optional and defaults to today *in the member's zone*.
   *
   * Optional rather than required with the client passing its own date,
   * because a client that computed the date would compute it from the
   * handset's clock — and a phone in Cairo with its zone set to London would
   * ask for the wrong day and be answered correctly, which is the worst of
   * both. Passing it is for the plans screen, which means a specific day the
   * member tapped.
   */
  @Query(() => DailyPlanType, { name: 'todayPlan' })
  async plan(
    @CurrentPrincipal() principal: Principal,
    @Args('date', { type: () => DateScalar, nullable: true }) date?: string,
  ): Promise<DailyPlanType> {
    const view = await this.todayPlan.handle(principal.id, date ?? undefined);
    return view as unknown as DailyPlanType;
  }

  @Query(() => DailyPlanType, { name: 'tomorrowDraft' })
  async draft(
    @CurrentPrincipal() principal: Principal,
  ): Promise<DailyPlanType> {
    const view = await this.tomorrowDraft.handle(principal.id);
    return view as unknown as DailyPlanType;
  }

  /** Inclusive at both ends. Days with no plan are simply absent. */
  @Query(() => [DailyPlanType], { name: 'plans' })
  async range(
    @CurrentPrincipal() principal: Principal,
    @Args('from', { type: () => DateScalar }) from: string,
    @Args('to', { type: () => DateScalar }) to: string,
  ): Promise<DailyPlanType[]> {
    const views = await this.plans.handle(principal.id, from, to);
    return views as unknown as DailyPlanType[];
  }

  /** Inclusive at both ends. Unanswered days are absent, not all-null rows. */
  @Query(() => [CheckinType], { name: 'checkins' })
  async history(
    @CurrentPrincipal() principal: Principal,
    @Args('from', { type: () => DateScalar }) from: string,
    @Args('to', { type: () => DateScalar }) to: string,
  ): Promise<CheckinType[]> {
    const views = await this.checkins.handle(principal.id, from, to);
    return views as unknown as CheckinType[];
  }

  @Query(() => StreakType, { name: 'streak' })
  async adherence(
    @CurrentPrincipal() principal: Principal,
  ): Promise<StreakType> {
    const view = await this.streak.handle(principal.id);
    return view as unknown as StreakType;
  }
}

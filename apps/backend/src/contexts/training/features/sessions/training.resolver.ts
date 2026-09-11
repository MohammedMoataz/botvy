import {
  Args,
  Field,
  Float,
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
import { DateTimeScalar } from '../../../../graphql/scalars.js';
import { AthleteProfileQueryHandler } from '../athlete-profile/athlete-profile.query.js';
import { NextPracticeQueryHandler } from '../next-practice/next-practice.query.js';
import { ProgramQueryHandler } from '../program/program.query.js';
import { ProgramsQueryHandler } from '../programs/programs.query.js';
import { SessionQueryHandler } from '../session/session.query.js';
import { WorkoutsQueryHandler } from '../workouts/workouts.query.js';
import { SessionsQueryHandler } from './sessions.query.js';

/**
 * One weekly slot: a day, a wall-clock time, a length, a sport.
 *
 * `start` is `HH:mm` in the member's own zone and is a `String` rather than any
 * kind of time scalar, because it is **not an instant** — "gym at 18:00 on
 * Mondays" is a statement about the member's clock, so a member who flies still
 * trains at 18:00. Serialising it as a DateTime would resolve it against
 * *somebody's* zone and bake the answer into the wire format.
 *
 * `weekday` is 1 (Monday) to 7 (Sunday), ISO 8601 rather than JavaScript's
 * 0-is-Sunday. The conversion happens once, in `slotDatesWithin`, so nothing
 * else has to remember which convention it is holding.
 */
@ObjectType('Slot')
export class SlotType {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  weekday!: number;

  @Field(() => String)
  start!: string;

  @Field(() => Int)
  durationMin!: number;

  @Field(() => String)
  sport!: string;

  @Field(() => String, { nullable: true })
  location!: string | null;
}

/**
 * What the member practises and when — never null.
 *
 * `AthleteProfile.empty`'s comment carries the argument: a nullable profile puts
 * a "have they set this up yet" branch into four callers, and four copies of one
 * question is how they come to disagree. Empty lists answer "no sports, no
 * slots", and story 1 scenario 3 asks for exactly that — an invitation to set
 * them, not an empty grid.
 */
@ObjectType('AthleteProfile')
export class AthleteProfileType {
  @Field(() => [String])
  sports!: string[];

  @Field(() => [SlotType])
  slots!: SlotType[];
}

/**
 * One set, in every sport this product knows about.
 *
 * Every measure is nullable and `done` is not, which is the shape `set-entry.ts`
 * argues for at length: one row per set with optional fields, rather than a type
 * per sport that would multiply the model, the editor and every query by the
 * number of sports — and would give a member who lifts *and* swims two histories
 * that cannot be read together.
 *
 * Weights are `Float` (62.5 kg is a real plate combination); reps, seconds and
 * metres are `Int`.
 */
@ObjectType('SetEntry')
export class SetEntryType {
  @Field(() => Int, { nullable: true })
  targetReps!: number | null;

  @Field(() => Float, { nullable: true })
  targetWeightKg!: number | null;

  @Field(() => Int, { nullable: true })
  targetDurationSec!: number | null;

  @Field(() => Int, { nullable: true })
  targetDistanceM!: number | null;

  @Field(() => Int, { nullable: true })
  actualReps!: number | null;

  @Field(() => Float, { nullable: true })
  actualWeightKg!: number | null;

  @Field(() => Int, { nullable: true })
  actualDurationSec!: number | null;

  @Field(() => Int, { nullable: true })
  actualDistanceM!: number | null;

  /**
   * Separate from having an actual value, on purpose. A member can tick a set
   * off without typing numbers, and a set with a weight typed and not ticked is
   * one they are part way through — inferring this from a filled field would
   * collapse those two into one.
   */
  @Field(() => Boolean)
  done!: boolean;
}

/** A picture or a clip an exercise refers to. Nothing fetches it in this phase. */
@ObjectType('MediaRef')
export class MediaRefType {
  @Field(() => String)
  type!: string;

  @Field(() => String)
  url!: string;

  @Field(() => String, { nullable: true })
  caption!: string | null;
}

/**
 * One exercise with its sets in order.
 *
 * `id` is minted by whoever created the exercise, and it is on the wire because
 * the logger has to name *which* exercise it is writing sets for: an array index
 * is not a name, and reordering while a set is being typed would move the
 * numbers under the member's fingers.
 */
@ObjectType('Exercise')
export class ExerciseType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  @Field(() => [SetEntryType])
  sets!: SetEntryType[];

  @Field(() => [MediaRefType])
  mediaRefs!: MediaRefType[];
}

/**
 * `planned | completed | cancelled | skipped`, as an enum rather than a string.
 *
 * Four states and **no `missed`** — see `Session.isMissed` and the field below.
 * GraphQL refusing `status: "skiped"` at the edge is worth more than the type
 * safety, because a typo falling through a client's `switch` to its default
 * would show a session the member skipped as one they still owe.
 */
export enum SessionStatusName {
  planned = 'planned',
  completed = 'completed',
  cancelled = 'cancelled',
  skipped = 'skipped',
}

registerEnumType(SessionStatusName, {
  name: 'SessionStatus',
  description:
    'Planned, done, called off, or deliberately not done. A skipped session stays in the week so the record is honest, and deleting one never changes its status.',
});

/**
 * A session, as a screen reads it.
 *
 * `isMissed` is **not in the blueprint's SDL** and it earns its place: it is a
 * reading of the clock (`planned`, and finished, in the member's own zone)
 * answered by the session itself, so the next-practice card, the week view and
 * Today all ask one question and cannot disagree (FR-018). The alternative — a
 * fifth status — would need a sweep to write it and to *un*-write it when the
 * member logs the session late, which FR-018 explicitly allows.
 *
 * `slotId` is absent, as it is from the SDL: which slot produced a session is
 * this context's own bookkeeping, and a client that could read it would
 * eventually branch on it.
 */
@ObjectType('Session')
export class SessionType {
  @Field(() => ID)
  id!: string;

  @Field(() => DateTimeScalar)
  plannedAt!: Date;

  @Field(() => Int)
  durationMin!: number;

  @Field(() => String)
  sport!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String, { nullable: true })
  focus!: string | null;

  @Field(() => ID, { nullable: true })
  programId!: string | null;

  @Field(() => Int, { nullable: true })
  weekIndex!: number | null;

  /** P7 fills this when a suggestion becomes a session. Null throughout P6. */
  @Field(() => ID, { nullable: true })
  suggestionId!: string | null;

  @Field(() => [ExerciseType])
  exercises!: ExerciseType[];

  @Field(() => SessionStatusName)
  status!: SessionStatusName;

  @Field(() => DateTimeScalar, { nullable: true })
  completedAt!: Date | null;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  /** Derived on every read, never stored. See the type note. */
  @Field(() => Boolean)
  isMissed!: boolean;
}

/**
 * The next-practice card's whole answer (FR-006).
 *
 * `reason` is returned rather than left to the client to work out, because the
 * three sentences are genuinely different — "here is today's", "today is done,
 * here is the next one", "you have nothing scheduled" — and a client guessing
 * from a null `session` gets the third when it means the second. It is a
 * `String` and not an enum because the SDL fixes it as one, and the three values
 * are documented on the field.
 *
 * `isToday` is `reason === 'today'`, derived at the edge of the read. It is in
 * the published SDL, so it stays; two independent booleans saying one thing
 * would be two things that can disagree, which is why nothing stores it.
 */
@ObjectType('NextPractice')
export class NextPracticeType {
  @Field(() => SessionType, { nullable: true })
  session!: SessionType | null;

  @Field(() => Boolean)
  isToday!: boolean;

  @Field(() => String, {
    description: "'today' | 'after-cutoff' | 'none-scheduled'",
  })
  reason!: string;
}

/**
 * One set as a *template* describes it: targets, and nothing else.
 *
 * Its own type rather than `SetEntry`, because `TemplateExercise`'s comment says
 * why the domain keeps them apart — `actual*` and `done` on a template are
 * fields that can only ever be empty, and a field that can only be empty is a
 * field somebody will one day fill. The SDL types a template's exercises as
 * `[Exercise!]!`, which cannot be served: a template exercise has no `id` and no
 * actuals, so serving `Exercise` would mean inventing an id per read and
 * publishing four fields that are always null.
 */
@ObjectType('TemplateSet')
export class TemplateSetType {
  @Field(() => Int, { nullable: true })
  targetReps!: number | null;

  @Field(() => Float, { nullable: true })
  targetWeightKg!: number | null;

  @Field(() => Int, { nullable: true })
  targetDurationSec!: number | null;

  @Field(() => Int, { nullable: true })
  targetDistanceM!: number | null;
}

/** An exercise in a program week. Targets only — see `TemplateSetType`. */
@ObjectType('TemplateExercise')
export class TemplateExerciseType {
  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  @Field(() => [TemplateSetType])
  sets!: TemplateSetType[];

  @Field(() => [MediaRefType])
  mediaRefs!: MediaRefType[];
}

/**
 * One session as a program describes it.
 *
 * `weekday` is nullable and the null is what makes a program portable: a
 * template with no weekday fills whichever slot comes next in order, so one
 * four-week plan works for a member who trains Monday/Wednesday/Friday and for
 * one who trains Tuesday/Thursday/Saturday.
 */
@ObjectType('ProgramSessionTemplate')
export class ProgramSessionTemplateType {
  @Field(() => ID)
  templateId!: string;

  @Field(() => Int, { nullable: true })
  weekday!: number | null;

  @Field(() => String)
  title!: string;

  @Field(() => String, { nullable: true })
  focus!: string | null;

  @Field(() => [TemplateExerciseType])
  exercises!: TemplateExerciseType[];
}

@ObjectType('ProgramWeek')
export class ProgramWeekType {
  @Field(() => Int)
  index!: number;

  @Field(() => [ProgramSessionTemplateType])
  sessions!: ProgramSessionTemplateType[];
}

/**
 * A program: weeks of session templates the materialiser fills slots from.
 *
 * `sourceLinkIds` where the SDL writes `sourceLinks: [Link!]!`, and the reason
 * is the one P5's `AgendaItem` gives for carrying `(kind, id)` instead of a
 * `Task` or a `Session`: **`Link` is Knowledge's type**, it does not exist until
 * P7, and a Training `features/` file declaring a lookalike is precisely what
 * constitution IX forbids and what `no-restricted-imports` refuses in both
 * directions. A local copy of somebody else's shape, free to drift, with nothing
 * in either place saying they are meant to match, is worse than the ids. When P7
 * lands, the resolver that owns `Link` can resolve them and nothing here
 * changes.
 *
 * `status` and `appliedStartDate` are both published because a client needs
 * them: archived against active is what story 4 scenario 3 turns on, and the
 * apply screen has to be able to say which day the plan was started from.
 */
@ObjectType('Program')
export class ProgramType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  sport!: string;

  @Field(() => String)
  source!: string;

  /** Knowledge's `Link` ids. See the type note for why not the documents. */
  @Field(() => [ID])
  sourceLinkIds!: string[];

  @Field(() => String)
  status!: string;

  /** `YYYY-MM-DD` in the member's zone, or null while never applied. */
  @Field(() => String, { nullable: true })
  appliedStartDate!: string | null;

  @Field(() => [ProgramWeekType])
  weeks!: ProgramWeekType[];
}

/** A library entry the member drops into a session (FR-009). */
@ObjectType('Workout')
export class WorkoutType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  sport!: string;

  @Field(() => [ExerciseType])
  exercises!: ExerciseType[];

  @Field(() => [String])
  tags!: string[];
}

/**
 * Training's read surface.
 *
 * This file is not optional polish, and the comment is here because the project
 * has learned it twice: constitution X puts reads on GraphQL, and **a query
 * handler with a spec and no resolver is a read no client can reach.** It
 * happened to the whole of Planning's read side in P2 and again to P4's
 * `quickQuestions`, and both times the handlers had passing specs, which is
 * exactly why nobody noticed. So every read this slice writes appears below,
 * this class goes in `RESOLVERS` in `graphql/graphql.module.ts`, and the queries
 * are checked into the regenerated `packages/contracts/schema.graphql` — that
 * file is the proof.
 *
 * `SessionsInRangeQueryHandler` is the one read in this context with no query
 * here, and deliberately: it is the *cross-context* surface P5's agenda and P3's
 * rhythm call in process, and its answer is already reachable by a client as
 * `sessions(from, to)`. Exposing the same rows twice under two names would leave
 * two shapes free to drift.
 *
 * Every query takes the member from the principal and never from an argument. A
 * `userId` parameter on `nextPractice` would be a way to read somebody else's
 * training week that no amount of scoping inside a handler could close. The
 * *window*, on the other hand, comes from the client, because the client drew
 * the week — the one thing it does not decide is which day an instant belongs
 * to, which every handler behind this resolves against the member's own zone.
 */
@Resolver()
@UsersOnly()
export class TrainingResolver {
  constructor(
    private readonly profile: AthleteProfileQueryHandler,
    private readonly nextPracticeQuery: NextPracticeQueryHandler,
    private readonly sessionsQuery: SessionsQueryHandler,
    private readonly sessionQuery: SessionQueryHandler,
    private readonly programsQuery: ProgramsQueryHandler,
    private readonly programQuery: ProgramQueryHandler,
    private readonly workoutsQuery: WorkoutsQueryHandler,
  ) {}

  /** Never null. See `AthleteProfileType`. */
  @Query(() => AthleteProfileType, { name: 'athleteProfile' })
  async athleteProfile(
    @CurrentPrincipal() principal: Principal,
  ): Promise<AthleteProfileType> {
    const view = await this.profile.handle(principal.id);
    return view as unknown as AthleteProfileType;
  }

  /**
   * The practice happening now or next, and why that one (FR-006, FR-007).
   *
   * No arguments: the cut-off is the member's own preference and "now" is the
   * server's clock read in the member's zone, so there is nothing here for a
   * client to pass — and a `now` argument would let one send a time that makes
   * the card say what it wants.
   */
  @Query(() => NextPracticeType, { name: 'nextPractice' })
  async nextPractice(
    @CurrentPrincipal() principal: Principal,
  ): Promise<NextPracticeType> {
    const view = await this.nextPracticeQuery.handle(principal.id);
    return view as unknown as NextPracticeType;
  }

  /**
   * The week view: every live session in the window, whatever its status.
   *
   * Skipped and cancelled sessions are included because the record has to be
   * honest (FR-005) — the client tells them apart by `status`, and a past
   * unlogged one by `isMissed`.
   */
  @Query(() => [SessionType], { name: 'sessions' })
  async sessions(
    @CurrentPrincipal() principal: Principal,
    @Args('from', { type: () => DateTimeScalar }) from: Date,
    @Args('to', { type: () => DateTimeScalar }) to: Date,
  ): Promise<SessionType[]> {
    const views = await this.sessionsQuery.between(principal.id, from, to);
    return views as unknown as SessionType[];
  }

  /** One session, for the detail screen and the logger. Null when not theirs. */
  @Query(() => SessionType, { name: 'session', nullable: true })
  async session(
    @CurrentPrincipal() principal: Principal,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<SessionType | null> {
    const view = await this.sessionQuery.byId(principal.id, id);
    return (view as unknown as SessionType) ?? null;
  }

  /**
   * The member's programs (story 4).
   *
   * `includeArchived` defaults to false, because the archive is a thing the
   * member asks for: an archived block stops filling weeks and stays readable,
   * and putting last spring's plan in the default list would bury the one they
   * are following.
   */
  @Query(() => [ProgramType], { name: 'programs' })
  async programs(
    @CurrentPrincipal() principal: Principal,
    @Args('includeArchived', { type: () => Boolean, nullable: true })
    includeArchived?: boolean,
  ): Promise<ProgramType[]> {
    const views = await this.programsQuery.list(
      principal.id,
      includeArchived ?? false,
    );
    return views as unknown as ProgramType[];
  }

  @Query(() => ProgramType, { name: 'program', nullable: true })
  async program(
    @CurrentPrincipal() principal: Principal,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ProgramType | null> {
    const view = await this.programQuery.byId(principal.id, id);
    return (view as unknown as ProgramType) ?? null;
  }

  /**
   * The workout library, optionally for one sport (FR-009).
   *
   * The filter exists for the apply sheet inside a session: a member logging a
   * swim wants their swimming workouts, and making them scroll past every gym
   * entry is how a feature meant to save typing stops saving anything.
   */
  @Query(() => [WorkoutType], { name: 'workouts' })
  async workouts(
    @CurrentPrincipal() principal: Principal,
    @Args('sport', { type: () => String, nullable: true }) sport?: string,
  ): Promise<WorkoutType[]> {
    const views = await this.workoutsQuery.list(principal.id, sport);
    return views as unknown as WorkoutType[];
  }
}

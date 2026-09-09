import { NotFoundException } from '@nestjs/common';
import { Args, Field, Float, ID, Int, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { CurrentPrincipal, UsersOnly } from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { DateTimeScalar } from '../../../../graphql/scalars.js';
import { ProfileQueryHandler } from './profile.query.js';

/**
 * One reading.
 *
 * `recordedAt`, not the blueprint schema's `at`. The aggregate, the REST read
 * and both clients already call it `recordedAt`, and giving this transport a
 * different name for the same field is how a member's weight chart works on one
 * surface and is empty on another. The blueprint is the document to correct.
 */
@ObjectType('BodyMetric')
export class BodyMetricType {
  @Field(() => DateTimeScalar)
  recordedAt!: Date;

  @Field(() => Float, { nullable: true })
  weightKg?: number;

  @Field(() => Float, { nullable: true })
  heightCm?: number;

  @Field(() => Float, { nullable: true })
  bodyFatPct?: number;

  @Field(() => String, { nullable: true })
  note?: string;
}

/**
 * The member's own profile.
 *
 * Fields the member has never filled in are `null`, and the ones that are lists
 * are `null` rather than `[]` for the same reason the view omits them: an empty
 * array is a claim ("no allergies") where absence is a gap ("never asked"), and
 * P4's coach prompt reads this and would state the claim out loud.
 *
 * `photoUrl` and not `photoPath`. The path is where the file sits on the media
 * volume, which is the server's business; the client needs something it can put
 * in an `img` tag.
 */
@ObjectType('Profile')
export class ProfileType {
  @Field(() => ID)
  userId!: string;

  @Field(() => String, { nullable: true })
  displayName?: string;

  @Field(() => String, { nullable: true })
  photoUrl?: string;

  @Field()
  timezone!: string;

  @Field()
  locale!: string;

  @Field(() => Float, { nullable: true })
  latestWeightKg?: number;

  @Field(() => Float, { nullable: true })
  latestHeightCm?: number;

  @Field(() => Float, { nullable: true })
  bmi?: number;

  @Field(() => [BodyMetricType])
  bodyMetrics!: BodyMetricType[];

  @Field(() => [String], { nullable: true })
  foodLikes?: string[];

  @Field(() => [String], { nullable: true })
  foodDislikes?: string[];

  @Field(() => [String], { nullable: true })
  allergies?: string[];

  @Field(() => [String], { nullable: true })
  symptoms?: string[];

  @Field(() => DateTimeScalar, { nullable: true })
  onboardingCompletedAt?: Date;
}

@ObjectType('QuietHours')
export class QuietHoursType {
  @Field()
  from!: string;

  @Field()
  to!: string;
}

@ObjectType('Preferences')
export class PreferencesType {
  @Field(() => ID)
  userId!: string;

  @Field()
  planTomorrowTime!: string;

  @Field()
  endOfDayTime!: string;

  @Field()
  morningBriefingTime!: string;

  @Field()
  nextPracticeCutoff!: string;

  @Field(() => [String])
  leadTimes!: string[];

  @Field(() => QuietHoursType, { nullable: true })
  quietHours?: QuietHoursType;

  @Field()
  weekStartsOn!: string;

  @Field()
  checkinEnabled!: boolean;

  @Field(() => Int)
  meetingDurationMin!: number;

  @Field()
  mealMode!: string;

  @Field()
  aiSuggestions!: boolean;
}

/**
 * Profile and preferences, read.
 *
 * Both resolve from the caller's own principal and take no user argument. There
 * is no administrator variant on purpose: an operator manages accounts, devices
 * and settings, and a member's allergies and body metrics are not an operator's
 * business. The Users table shows what `users` returns and no more.
 */
@Resolver(() => ProfileType)
export class ProfileResolver {
  constructor(private readonly profiles: ProfileQueryHandler) {}

  @Query(() => ProfileType, { description: "The caller's own profile." })
  @UsersOnly()
  async profile(@CurrentPrincipal() principal: Principal): Promise<ProfileType> {
    const view = await this.profiles.profile(principal.id);
    // Bootstrapped from `identity.UserRegistered`, so its absence means the
    // relay has not delivered yet rather than that the member is unknown. A
    // 404 is the honest answer either way, and the client retries.
    if (!view) throw new NotFoundException('no profile yet');

    return {
      ...view,
      photoUrl: view.photoPath ? '/api/v1/profile/photo' : undefined,
      bodyMetrics: view.metrics as unknown as BodyMetricType[],
      onboardingCompletedAt: view.onboardingCompletedAt
        ? new Date(view.onboardingCompletedAt)
        : undefined,
    } as ProfileType;
  }

  /**
   * A window of the member's readings, newest last.
   *
   * Argued rather than always-all: a member weighing in daily for two years is
   * seven hundred rows, and a chart shows thirty.
   */
  @Query(() => [BodyMetricType], { description: "The caller's body metric history." })
  @UsersOnly()
  async bodyMetrics(
    @CurrentPrincipal() principal: Principal,
    @Args('last', { type: () => Int, nullable: true, defaultValue: 30 }) last?: number,
  ): Promise<BodyMetricType[]> {
    const view = await this.profiles.profile(principal.id);
    if (!view) throw new NotFoundException('no profile yet');

    const window = Math.min(Math.max(last ?? 30, 1), 365);
    return view.metrics.slice(-window) as unknown as BodyMetricType[];
  }

  @Query(() => PreferencesType, { description: "The caller's own preferences." })
  @UsersOnly()
  async preferences(@CurrentPrincipal() principal: Principal): Promise<PreferencesType> {
    const view = await this.profiles.preferencesFor(principal.id);
    if (!view) throw new NotFoundException('no preferences yet');
    return view as PreferencesType;
  }
}

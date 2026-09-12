import {
  Args,
  Field,
  ID,
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
import type { MealKind } from '../../domain/meal.aggregate.js';
import { RegenerateTodayHandler } from '../regenerate-today/regenerate-today.handler.js';
import { MealsQueryHandler } from './meals.query.js';

/**
 * The three enums this context publishes.
 *
 * String unions in the domain and GraphQL enums here, the split every context
 * in this codebase makes: the union is checked by the compiler, the enum at the
 * edge, and a client asking for `MealKind.brunch` gets a validation error
 * rather than an empty list.
 */
export enum MealKindEnum {
  breakfast = 'breakfast',
  lunch = 'lunch',
  dinner = 'dinner',
  snack = 'snack',
  any = 'any',
}
registerEnumType(MealKindEnum, { name: 'MealKind' });

export enum MealModeEnum {
  library = 'library',
  llm = 'llm',
}
registerEnumType(MealModeEnum, { name: 'MealMode' });

/**
 * Why a day has no meals — a **code**, never a sentence.
 *
 * The member's language is a preference and every surface owns its own strings.
 * A schema field typed `String` here would invite the server to fill it with
 * English, which is exactly the shape `daily_plans.mealLine` was written into
 * in P3 and is corrected in this phase.
 */
export enum WithheldReasonEnum {
  allergen = 'allergen',
  empty_library = 'empty_library',
  model_unavailable = 'model_unavailable',
}
registerEnumType(WithheldReasonEnum, { name: 'WithheldReason' });

@ObjectType('Meal')
export class MealType {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => MealKindEnum)
  kind!: MealKind;

  @Field(() => [String])
  ingredients!: string[];

  @Field(() => [String])
  tags!: string[];

  @Field(() => DateTimeScalar)
  updatedAt!: Date;
}

/** One meal on a day, as it was chosen. */
@ObjectType('ChosenMeal')
export class ChosenMealType {
  @Field(() => MealKindEnum)
  kind!: MealKind;

  @Field(() => String)
  name!: string;

  /**
   * The library row it came from, or null.
   *
   * Null in suggestion mode, where nothing in the library was used — and null
   * again once the member deletes that meal, which is why the **name** is a
   * field of its own rather than something the client resolves through this id.
   */
  @Field(() => ID, { nullable: true })
  mealId!: string | null;
}

@ObjectType('TodayMeals')
export class TodayMealsType {
  @Field(() => DateScalar)
  date!: string;

  @Field(() => MealModeEnum)
  mode!: string;

  @Field(() => [ChosenMealType])
  meals!: ChosenMealType[];

  @Field(() => String, { nullable: true })
  line!: string | null;

  @Field(() => WithheldReasonEnum, { nullable: true })
  withheldReason!: string | null;
}

/**
 * The member's meals, and their day.
 *
 * Reads only — a read a client cannot reach is a read that does not exist, and
 * the pair of them are here rather than discovered later. Regenerating and
 * swapping are commands and live on the REST controller, which is principle X.
 */
@Resolver()
@UsersOnly()
export class NutritionResolver {
  constructor(
    private readonly meals: MealsQueryHandler,
    private readonly days: RegenerateTodayHandler,
  ) {}

  @Query(() => [MealType], {
    name: 'meals',
    description: 'The member’s own meals, by name.',
  })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Args('kind', { type: () => MealKindEnum, nullable: true })
    kind?: MealKindEnum,
  ): Promise<MealType[]> {
    return (await this.meals.list(
      principal.id,
      kind as MealKind | undefined,
    )) as unknown as MealType[];
  }

  /**
   * One of the member's own days — today unless a date is given.
   *
   * The default is resolved against the member's **own** zone rather than the
   * server's, because a member in Cairo asking at one in the morning means the
   * day they are having, and the API reading its own `TZ` for this is the
   * mistake principle XI exists to stop.
   */
  @Query(() => TodayMealsType, {
    name: 'todayMeals',
    nullable: true,
    description:
      'The meals chosen for one of the member’s days, or null when none have been.',
  })
  async today(
    @CurrentPrincipal() principal: Principal,
    @Args('date', { type: () => DateScalar, nullable: true }) date?: string,
  ): Promise<TodayMealsType | null> {
    const day = date ?? (await this.days.todayFor(principal.id));
    return (await this.meals.forDate(
      principal.id,
      day,
    )) as unknown as TodayMealsType | null;
  }
}

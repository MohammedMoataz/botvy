import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  CurrentPrincipal,
  UsersOnly,
} from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import {
  MAX_INGREDIENTS,
  MAX_MEAL_NAME,
  MAX_TAGS,
  MEAL_KINDS,
  MealRuleError,
  type MealKind,
} from '../../domain/meal.aggregate.js';
import {
  NoMealsOnThatDay,
  NoSuchSlot,
  ReplaceTodayMealHandler,
} from '../replace-today-meal/replace-today-meal.handler.js';
import {
  PastDayIsSettled,
  RegenerateTodayHandler,
} from '../regenerate-today/regenerate-today.handler.js';
import {
  AddMealHandler,
  DeleteMealHandler,
  InvalidMealId,
  MealNotFound,
  PurgeMealHandler,
  RestoreMealHandler,
  UpdateMealHandler,
} from './add-meal.handler.js';

export class AddMealDto {
  /** The client's, so a meal added offline has a reference at once. */
  @IsString()
  id!: string;

  @IsString()
  @MaxLength(MAX_MEAL_NAME)
  name!: string;

  @IsOptional()
  @IsIn(MEAL_KINDS as unknown as string[])
  kind?: MealKind;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_INGREDIENTS)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  ingredients?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TAGS)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}

/** Every field optional, because a patch is what changed. */
export class UpdateMealDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_MEAL_NAME)
  name?: string;

  @IsOptional()
  @IsIn(MEAL_KINDS as unknown as string[])
  kind?: MealKind;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_INGREDIENTS)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  ingredients?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TAGS)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}

export class ReplaceTodayMealDto {
  /** Which of the member's own meals goes in. */
  @IsString()
  mealId!: string;
}

/**
 * Meals, and the member's own day.
 *
 * Reads are GraphQL and the sync pull; nothing here returns a view, only an
 * acknowledgement, an id or the half that changed — principle X as a rule about
 * what a controller may return. The half comes back from the two day commands
 * because the caller has just changed what the member is looking at and would
 * otherwise have to ask again for it.
 *
 * Domain errors are translated here and only here. The aggregate throws
 * `MealRuleError`; a domain object that threw `ConflictException` would have
 * imported a web framework to express a rule about food.
 */
@Controller('api/v1')
@UsersOnly()
@ApiBearerAuth()
export class MealsController {
  constructor(
    private readonly add: AddMealHandler,
    private readonly edit: UpdateMealHandler,
    private readonly remove: DeleteMealHandler,
    private readonly restore: RestoreMealHandler,
    private readonly purge: PurgeMealHandler,
    private readonly days: RegenerateTodayHandler,
    private readonly swap: ReplaceTodayMealHandler,
  ) {}

  /**
   * 200 rather than 201: a replay of a save the client already made is a
   * success, not an error — the phone minted the id before the server had heard
   * of the meal, so a retry after a dropped connection and a genuine second add
   * are only told apart by that id.
   */
  @Post('meals')
  @HttpCode(200)
  async addMeal(
    @CurrentPrincipal() principal: Principal,
    @Body() body: AddMealDto,
  ) {
    return this.translate(() =>
      this.add.handle(principal.id, {
        id: body.id,
        name: body.name,
        kind: body.kind,
        ingredients: body.ingredients,
        tags: body.tags,
      }),
    );
  }

  @Patch('meals/:id')
  async updateMeal(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: UpdateMealDto,
  ) {
    return this.translate(() => this.edit.handle(principal.id, id, body));
  }

  @Delete('meals/:id')
  async deleteMeal(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(async () => {
      await this.remove.handle(principal.id, id);
      return { id };
    });
  }

  @Post('meals/:id/restore')
  @HttpCode(200)
  async restoreMeal(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(async () => {
      await this.restore.handle(principal.id, id);
      return { id };
    });
  }

  @Delete('meals/:id/purge')
  @HttpCode(204)
  async purgeMeal(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    await this.translate(() => this.purge.handle(principal.id, id));
  }

  /**
   * "Give me different meals for today" (FR-010).
   *
   * A `POST` with no body and no date: the day is the member's own today,
   * resolved against their zone. A client that could name a date could
   * regenerate a past one, and FR-011 says past days keep what they were given.
   */
  @Post('nutrition/today/regenerate')
  @HttpCode(200)
  async regenerateToday(@CurrentPrincipal() principal: Principal) {
    return this.translate(async () => {
      const today = await this.days.todayFor(principal.id);
      return this.days.regenerate(principal.id, today);
    });
  }

  /**
   * "Use one of mine instead" — one slot, by position (FR-010).
   *
   * By position rather than by kind, because two `any` meals can share a kind
   * and the member tapped a row rather than a category.
   */
  @Post('nutrition/today/meals/:index/replace')
  @HttpCode(200)
  async replaceTodayMeal(
    @CurrentPrincipal() principal: Principal,
    @Param('index', ParseIntPipe) index: number,
    @Body() body: ReplaceTodayMealDto,
    @Query('date') date?: string,
  ) {
    return this.translate(async () => {
      const day = date ?? (await this.days.todayFor(principal.id));
      return this.swap.handle(principal.id, {
        date: day,
        index,
        mealId: body.mealId,
      });
    });
  }

  /**
   * Domain vocabulary to HTTP, in one place.
   *
   * A past day is a **409** rather than a 400: the request is well formed and
   * the state is wrong, which is the same call `not_deleted` gets on a purge.
   * Telling a client it sent a bad request sends it looking for a fault in its
   * own payload.
   */
  private async translate<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof MealNotFound || error instanceof NoMealsOnThatDay) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof PastDayIsSettled) {
        throw new ConflictException({
          code: 'past_day',
          message: error.message,
        });
      }
      if (error instanceof NoSuchSlot) {
        throw new BadRequestException({
          code: 'no_such_slot',
          message: error.message,
        });
      }
      if (error instanceof InvalidMealId) {
        throw new BadRequestException({
          code: 'invalid_id',
          message: error.message,
        });
      }
      if (error instanceof MealRuleError) {
        if (error.code === 'not_deleted') {
          throw new ConflictException({
            code: error.code,
            message: error.message,
          });
        }
        throw new BadRequestException({
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }
  }
}

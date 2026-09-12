import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CurrentPrincipal,
  UsersOnly,
} from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { MOOD_MAX, MOOD_MIN } from '../../domain/checkin.aggregate.js';
import { RecordCheckinHandler } from '../record-checkin/record-checkin.handler.js';
import { SkipPlanHandler } from '../skip-plan/skip-plan.handler.js';
import { ConfirmPlanHandler, PlanNotFound } from './confirm-plan.handler.js';

/**
 * `YYYY-MM-DD`, the member's own local date.
 *
 * Checked here rather than parsed into a `Date`, and that is the whole point:
 * the moment this becomes a `Date` the server has decided whose midnight it
 * meant, which is the mistake constitution XI exists to forbid. It stays a
 * string all the way to the document id.
 */
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ConfirmPlanDto {
  @IsArray()
  @IsString({ each: true })
  taskIds!: string[];

  /**
   * `false` clears the training slot the draft proposed; omitted leaves it.
   *
   * Which is why it is `@IsOptional() @IsBoolean()` and not defaulted: a
   * default of `true` or `false` here would erase the distinction the aggregate
   * is built around, and a member who sent only task ids would be silently
   * answering a question about training that nobody asked them.
   */
  @IsOptional()
  @IsBoolean()
  training?: boolean;
}

export class RecordCheckinDto {
  @IsOptional()
  @Matches(LOCAL_DATE, { message: 'date must look like 2026-09-12' })
  date?: string;

  /**
   * Nought to a hundred. Validated at the boundary — this is where a nonsense
   * body earns a 400 — while the aggregate clamps instead, because a mood
   * arriving from a notification action or a replayed row is a number nobody
   * can re-enter and throwing away the whole check-in over a 101 would lose
   * the answer and the streak day with it.
   *
   * `@IsInt` rather than `@IsNumber`: the slider sends whole numbers and a
   * stored 63.5 would render differently in every client that formats it.
   */
  @IsOptional()
  @IsInt()
  @Min(MOOD_MIN)
  @Max(MOOD_MAX)
  mood?: number | null;

  @IsOptional()
  @IsBoolean()
  adhered?: boolean | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

/**
 * The three commands a member sends to their own rhythm.
 *
 * `@HttpCode(200)` on all three, not 201. None of them creates a resource at a
 * new address: two act on a plan that already exists at
 * `/rhythm/plans/:date` and the third patches the one check-in row that
 * `"<userId>:<date>"` names, creating it only as an implementation detail of
 * "record today's answer". Fifteen routes in the previous phase had to be
 * corrected for exactly this, so it is stated rather than left to Nest's
 * default for `@Post`.
 *
 * The prefix and the shape both come from `contracts/rest-commands.md` and
 * match `RemindersController`: one `api/v1` controller per slice group, with
 * the resource in the route rather than in the controller path.
 *
 * Every route reads `principal.id` and ignores any user id in the body. A
 * member's own token is the only statement of whose plan this is — a `userId`
 * accepted from a request body is how one member confirms another's evening.
 */
@Controller('api/v1')
@UsersOnly()
@ApiBearerAuth()
export class RhythmController {
  constructor(
    private readonly confirm: ConfirmPlanHandler,
    private readonly skip: SkipPlanHandler,
    private readonly checkins: RecordCheckinHandler,
  ) {}

  @Post('rhythm/plans/:date/confirm')
  @HttpCode(200)
  async confirmPlan(
    @CurrentPrincipal() principal: Principal,
    @Param('date') date: string,
    @Body() body: ConfirmPlanDto,
  ) {
    return this.translate(() =>
      this.confirm.handle({
        userId: principal.id,
        date: assertLocalDate(date),
        taskIds: body.taskIds,
        training: body.training,
      }),
    );
  }

  @Post('rhythm/plans/:date/skip')
  @HttpCode(200)
  async skipPlan(
    @CurrentPrincipal() principal: Principal,
    @Param('date') date: string,
  ) {
    return this.translate(() =>
      this.skip.handle({
        userId: principal.id,
        date: assertLocalDate(date),
      }),
    );
  }

  /**
   * The permanent path for the check-in card and for the notification action.
   *
   * `date` is optional and defaults to the member's own local today, resolved
   * in the handler against their zone. A client that sent the server's date
   * would file an answer typed at 01:00 in Cairo against yesterday.
   */
  @Post('rhythm/checkins')
  @HttpCode(200)
  async recordCheckin(
    @CurrentPrincipal() principal: Principal,
    @Body() body: RecordCheckinDto,
  ) {
    return this.checkins.handle({
      userId: principal.id,
      date: body.date,
      mood: body.mood,
      adhered: body.adhered,
      note: body.note,
      // The route is the source. A client-declared source would let the app
      // claim an answer came from the chat, and `source` is what a later
      // question about where members actually answer is asked of.
      source: 'app',
    });
  }

  /**
   * Domain vocabulary to HTTP.
   *
   * `PlanNotFound` is a 404 rather than a 400: the request is well formed and
   * the member is asking about a date that has no plan, which is a missing
   * resource. A 400 would send the client looking for a fault in its own body.
   */
  private async translate<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof PlanNotFound) {
        throw new NotFoundException({
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }
  }
}

/**
 * A path parameter cannot carry a `class-validator` decorator, so the check is
 * made explicitly rather than left out. Without it `POST
 * /rhythm/plans/yesterday/confirm` is a 404 from the repository — a plausible
 * answer to a nonsense request, which is the kind that gets debugged as a data
 * problem for an afternoon.
 */
function assertLocalDate(date: string): string {
  if (!LOCAL_DATE.test(date)) {
    throw new BadRequestException({
      code: 'invalid_date',
      message: 'The date in the path must look like 2026-09-12.',
    });
  }
  return date;
}

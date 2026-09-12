import {
  BadRequestException,
  Body,
  Controller,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CurrentPrincipal,
  UsersOnly,
} from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import {
  AthleteProfileRuleError,
  MAX_LOCATION,
  MAX_SESSION_MIN,
  MAX_SLOTS,
  MAX_SPORTS,
  MAX_SPORT_NAME,
} from '../../domain/athlete-profile.aggregate.js';
import { SetSlotsHandler } from '../set-slots/set-slots.handler.js';
import { ChooseSportsHandler } from './choose-sports.handler.js';

export class ChooseSportsDto {
  @IsArray()
  @ArrayMaxSize(MAX_SPORTS)
  @IsString({ each: true })
  @MaxLength(MAX_SPORT_NAME, { each: true })
  sports!: string[];
}

export class SlotDto {
  /** The client's id, and it is load-bearing: a slot that keeps it keeps its
   * sessions, because a session's derived id is built from it. */
  @IsString()
  @MaxLength(64)
  id!: string;

  @IsInt()
  @Min(1)
  @Max(7)
  weekday!: number;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'start is a wall-clock time like "18:00"',
  })
  start!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_SESSION_MIN)
  durationMin!: number;

  @IsString()
  @MaxLength(MAX_SPORT_NAME)
  sport!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_LOCATION)
  location?: string | null;
}

export class SetSlotsDto {
  @IsArray()
  @ArrayMaxSize(MAX_SLOTS)
  @ValidateNested({ each: true })
  @Type(() => SlotDto)
  slots!: SlotDto[];
}

/**
 * The athlete profile's two commands. Reads are GraphQL and the sync pull.
 *
 * ## Both replace wholesale
 *
 * `PUT` rather than `PATCH`, and that is the aggregate's rule surfacing at the
 * edge: `setSlots`'s own comment explains it — a slot's *identity* is what
 * future sessions are keyed to, so a partial update would need its own
 * vocabulary for "this one, changed" versus "this one, gone", and the editor
 * sends the whole week anyway. `chooseSports` is the same shape for the same
 * reason: the picker is a set of toggles.
 *
 * A wholesale replace is also idempotent, which matters here more than it looks
 * like it should: both aggregates compare before they raise, so a member who
 * saves the editor without changing anything raises no event — and an event
 * here wakes the materialiser, which walks their next fortnight. A no-op save
 * is the commonest thing a form does.
 *
 * ## Nothing here touches a session
 *
 * The re-materialisation `rest-commands.md` promises for `PUT /athlete/slots`
 * happens through `SlotsChanged` and the materialiser, not in this request. So
 * the response says what the profile did and nothing about sessions: a count of
 * created rows would be a promise this controller cannot keep, because the
 * relay is eventual and the pass may not have run when the member reads it.
 *
 * Domain errors are translated here and only here — an aggregate that threw
 * `BadRequestException` would have imported a web framework to express a rule
 * about training.
 */
@Controller('api/v1')
@UsersOnly()
@ApiBearerAuth()
export class AthleteController {
  constructor(
    private readonly sports: ChooseSportsHandler,
    private readonly slots: SetSlotsHandler,
  ) {}

  @Put('athlete/sports')
  async setSports(
    @CurrentPrincipal() principal: Principal,
    @Body() body: ChooseSportsDto,
  ): Promise<{ changed: boolean }> {
    return translate(() => this.sports.handle(principal.id, body.sports));
  }

  @Put('athlete/slots')
  async setSlots(
    @CurrentPrincipal() principal: Principal,
    @Body() body: SetSlotsDto,
  ): Promise<{ changed: boolean }> {
    return translate(() =>
      this.slots.handle(
        principal.id,
        body.slots.map((slot) => ({
          id: slot.id,
          weekday: slot.weekday,
          start: slot.start,
          durationMin: slot.durationMin,
          sport: slot.sport,
          location: slot.location ?? null,
        })),
      ),
    );
  }
}

/**
 * Every `AthleteProfileRuleError` is a 400 with its code.
 *
 * All seven of them are statements about a malformed week — a weekday outside
 * 1..7, a time that is not a wall clock, forty-one slots — so there is no
 * conflict case to distinguish and no state the member could change to make the
 * same request succeed. The code goes in the body because the client renders the
 * field, and the message because a human reads the log.
 */
async function translate<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AthleteProfileRuleError) {
      throw new BadRequestException({
        code: error.code,
        message: error.message,
      });
    }
    throw error;
  }
}

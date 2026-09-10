import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  CurrentPrincipal,
  UsersOnly,
} from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { SyncHandler, type SyncResponse } from './sync.handler.js';

export class SyncDto {
  @IsString()
  installId!: string;

  /**
   * The `now` from the previous response, echoed verbatim. Null on a first
   * sync — and null is also how a client asks for a full snapshot after
   * anything has gone wrong locally, which is why it is optional rather than
   * required with a sentinel.
   */
  @IsOptional()
  @IsDateString()
  since?: string | null;

  /**
   * The highest message `seq` this client holds, or null on a first sync.
   *
   * A separate cursor from `since` because messages are immutable and have no
   * `updatedAt` — `SyncableEntity.pull` carries the argument. `@Min(0)` rather
   * than a bare integer: a negative cursor would ask for messages before the
   * first one, which is harmless against the store and is a client bug worth
   * telling somebody about rather than quietly clamping at the edge.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  lastSeq?: number | null;

  @IsArray()
  @IsString({ each: true })
  entities!: string[];

  /**
   * Left as an untyped object on purpose.
   *
   * Each entity's rows are shaped by the context that owns them, and a
   * `class-validator` DTO here would be a fourth place the shape of a task is
   * written down — one that would have to be edited every time an aggregate
   * gains a field, and that would refuse a whole sync from a newer client over
   * a field this build has never heard of. The adapters validate their own rows
   * and reject them individually, which is what the protocol's per-row
   * rejection list is *for*.
   */
  @IsOptional()
  @IsObject()
  push?: Record<string, unknown>;
}

/**
 * `POST /api/v1/sync` — the whole offline contract, in one round trip.
 *
 * One route rather than one per entity, and that is the point of it: the phone
 * needs its pushes and its pulls to land together, because the cursor is only
 * safe to store once the entire apply has committed locally. Ten routes would
 * be ten chances to be offline halfway through.
 */
@Controller('api/v1')
@UsersOnly()
@ApiBearerAuth()
export class SyncController {
  constructor(private readonly sync: SyncHandler) {}

  @Post('sync')
  @HttpCode(200)
  async round(
    @CurrentPrincipal() principal: Principal,
    @Body() body: SyncDto,
  ): Promise<SyncResponse> {
    return this.sync.handle(principal.id, {
      installId: body.installId,
      since: body.since ? new Date(body.since) : null,
      lastSeq: body.lastSeq ?? null,
      entities: body.entities,
      push: body.push,
    });
  }
}

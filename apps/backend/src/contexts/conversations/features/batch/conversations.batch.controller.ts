import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsISO8601,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentPrincipal } from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { BatchHandler, MAX_BATCH, type BatchResult } from './batch.handler.js';

export class BatchMessageDto {
  /** The client's own id, so a retried flush is not a second message. */
  @IsUUID()
  clientId!: string;

  @IsUUID()
  conversationId!: string;

  @IsString()
  @MinLength(1)
  /**
   * Long enough for a pasted paragraph, bounded because this is an unbounded
   * write from a client: twenty of these is one request, and the model's
   * context is finite whatever the limit says.
   */
  @MaxLength(4_000)
  text!: string;

  /**
   * When the member typed it, not when it arrived.
   *
   * Required rather than optional, and that is the point of this endpoint: a
   * flush with no composition time is a flush that cannot be understood as of
   * the moment it was written, which is FR-007. A client with nothing to put
   * here should be using the socket.
   */
  @IsISO8601()
  composedAt!: string;
}

export class BatchDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BATCH)
  @ValidateNested({ each: true })
  @Type(() => BatchMessageDto)
  messages!: BatchMessageDto[];
}

/**
 * The offline path: messages typed with no network, replayed on reconnection.
 *
 * REST rather than the socket because a client that has just come back online
 * has a queue to hand over and wants one round trip with one answer, not a
 * stream per message — and because the phone's outbox already flushes over
 * REST for every other entity.
 *
 * It runs the same `TurnRunner` the socket does. v1 had two entry points that
 * each reimplemented the turn's tail and the offline one quietly stopped doing
 * things the live one did; there is one implementation here and this endpoint
 * only collects its events instead of emitting them.
 */
@Controller('api/v1/conversations')
export class ConversationsBatchController {
  constructor(private readonly batch: BatchHandler) {}

  /**
   * `200`, not `201`.
   *
   * It creates messages, so `201` is arguable — and it is wrong, because the
   * response is the *answers*, not a location for something created. Fifteen
   * routes in P2 had to be corrected for reflexively returning 201 from an
   * action, and this is the same reflex.
   */
  @Post('batch')
  @HttpCode(200)
  async flush(
    @CurrentPrincipal() principal: Principal,
    @Body() body: BatchDto,
  ): Promise<BatchResult> {
    return this.batch.handle(
      principal.id,
      body.messages.map((message) => ({
        clientId: message.clientId,
        conversationId: message.conversationId,
        text: message.text,
        composedAt: new Date(message.composedAt),
      })),
    );
  }
}

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
  CurrentPrincipal,
  UsersOnly,
} from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { SuggestionRuleError } from '../../domain/suggestion.aggregate.js';
import {
  AcceptSuggestionHandler,
  DismissSuggestionHandler,
  SuggestionNotFound,
} from './accept-suggestion.handler.js';

/**
 * `rest-commands.md`: `{ sessionId? }` → creates/fills a session.
 *
 * Optional, and omitting it means "the session this was suggested for" rather
 * than "make me a new one" — see the handler for why the creating half of that
 * contract line turns out to be unreachable, and is corrected rather than
 * built.
 */
export class AcceptSuggestionDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;
}

/**
 * The two things a member does with a suggestion (FR-010).
 *
 * Both are commands, so both are REST. The inbox itself is the `suggestions`
 * GraphQL query — constitution X, and the reason the accept returns an id
 * rather than the filled session: the session is Training's, and a controller
 * in this context returning one would be reading across a boundary to decorate
 * a response the client is about to re-fetch anyway.
 */
@Controller('api/v1')
@UsersOnly()
@ApiBearerAuth()
export class SuggestionsController {
  constructor(
    private readonly accept: AcceptSuggestionHandler,
    private readonly dismiss: DismissSuggestionHandler,
  ) {}

  @Post('suggestions/:id/accept')
  @HttpCode(200)
  async acceptSuggestion(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: AcceptSuggestionDto,
  ) {
    return this.translate(() =>
      this.accept.handle(principal.id, id, body.sessionId ?? null),
    );
  }

  @Post('suggestions/:id/dismiss')
  @HttpCode(200)
  async dismissSuggestion(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(async () => {
      await this.dismiss.handle(principal.id, id);
      return { id };
    });
  }

  /**
   * `not_pending` is a **409**: accepting a suggestion twice is a well-formed
   * request against a row in the wrong state, usually because the member tapped
   * twice or two devices raced. A 400 would send the client looking for a fault
   * in its own payload.
   */
  private async translate<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof SuggestionNotFound) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof SuggestionRuleError) {
        if (error.code === 'not_pending') {
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

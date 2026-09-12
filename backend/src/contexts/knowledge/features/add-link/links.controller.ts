import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  HttpCode,
  NotFoundException,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  CurrentPrincipal,
  UsersOnly,
} from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { LinkRuleError } from '../../domain/link.aggregate.js';
import { LinkUrlError, MAX_URL } from '../../domain/url-kind.js';
import {
  PurgeLinkHandler,
  RemoveLinkHandler,
  RestoreLinkHandler,
  LinkNotFound,
} from '../remove-link/remove-link.handler.js';
import { RetryLinkHandler } from '../retry-link/retry-link.handler.js';
import {
  AddLinkHandler,
  DailyLinkQuotaReached,
  InvalidLinkId,
} from './add-link.handler.js';

/**
 * `rest-commands.md`: `{ id, url, tags? }` → `{ id, kind, status: 'queued' }`.
 *
 * `id` is the client's, because the phone can save a link with no network and
 * needs a reference before the server has heard of it — which is also what
 * makes a retried save a no-op rather than a duplicate.
 *
 * There is no `kind` and no `parentLinkId`. The kind is *recognised*, not
 * declared: a member pasting a YouTube URL should not have to tell Botvy it is
 * a video, and a client that could declare one could declare the wrong one. The
 * parent belongs to the playlist expander alone.
 */
export class AddLinkDto {
  @IsString()
  id!: string;

  @IsString()
  @MaxLength(MAX_URL)
  url!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}

/**
 * Saving, retrying and removing a link.
 *
 * Reads are GraphQL and the sync pull; nothing here returns a view, only an
 * acknowledgement or an id, which is principle X as a rule about what a
 * controller may return.
 *
 * Domain errors are translated here and only here. The handlers and the
 * aggregate throw `LinkRuleError`, `LinkUrlError` and the rest, because a
 * domain object that threw `ConflictException` would have imported a web
 * framework to express a rule about reading articles.
 */
@Controller('api/v1')
@UsersOnly()
@ApiBearerAuth()
export class LinksController {
  constructor(
    private readonly add: AddLinkHandler,
    private readonly retrying: RetryLinkHandler,
    private readonly remove: RemoveLinkHandler,
    private readonly restore: RestoreLinkHandler,
    private readonly purge: PurgeLinkHandler,
  ) {}

  /**
   * 200 rather than 201, for both of the reasons this codebase already has one.
   *
   * A replay of a save the client already made is a success, not an error — the
   * phone minted the id before the server had heard of the link. And a *second
   * URL* that normalises to one already saved is also a success: the member is
   * handed the entry they have, with `duplicate: true`, so the client can open
   * it rather than showing them a failure for doing something reasonable.
   */
  @Post('links')
  @HttpCode(200)
  async addLink(
    @CurrentPrincipal() principal: Principal,
    @Body() body: AddLinkDto,
  ) {
    return this.translate(() =>
      this.add.handle(principal.id, {
        id: body.id,
        url: body.url,
        tags: body.tags ?? [],
      }),
    );
  }

  @Post('links/:id/retry')
  @HttpCode(200)
  async retryLink(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.retrying.handle(principal.id, id));
  }

  @Delete('links/:id')
  async deleteLink(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.remove.handle(principal.id, id));
  }

  @Post('links/:id/restore')
  @HttpCode(200)
  async restoreLink(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(async () => {
      await this.restore.handle(principal.id, id);
      return { id };
    });
  }

  @Delete('links/:id/purge')
  @HttpCode(204)
  async purgeLink(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    await this.translate(() => this.purge.handle(principal.id, id));
  }

  /**
   * Domain vocabulary to HTTP, in one place.
   *
   * The quota is a **429** rather than a 400, and that is the split worth
   * arguing for: a malformed URL is a request the client should stop sending,
   * where "you have saved twenty links today" is a well-formed request that
   * will succeed tomorrow. Telling a client the second is a bad request sends
   * it looking for a fault in its own payload, and a phone with a retry queue
   * would keep resending it.
   *
   * `not_deleted` on a purge is a 409 for the same reason: well-formed, wrong
   * state, will succeed once the link is deleted.
   */
  private async translate<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof LinkNotFound) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof DailyLinkQuotaReached) {
        // Nest ships no `TooManyRequestsException`, so the status is named
        // rather than wrapped. Checked rather than assumed: the package's
        // `exceptions/` directory has no 429 class.
        throw new HttpException(
          { code: 'daily_quota', message: error.message, limit: error.limit },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (error instanceof LinkUrlError) {
        throw new BadRequestException({
          code: error.code,
          message: error.message,
        });
      }
      if (error instanceof InvalidLinkId) {
        throw new BadRequestException({
          code: 'invalid_id',
          message: error.message,
        });
      }
      if (error instanceof LinkRuleError) {
        if (error.code === 'not_deleted' || error.code === 'attempts_exhausted') {
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

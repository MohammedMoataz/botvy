import {
  Body,
  ConflictException,
  Controller,
  Delete,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
  CurrentPrincipal,
  Roles,
  UsersOnly,
} from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { LinkRepository } from '../../domain/knowledge.repositories.js';
import { LinkRuleError } from '../../domain/link.aggregate.js';
import { LinkNotFound } from '../remove-link/remove-link.handler.js';
import { RetryLinkHandler } from '../retry-link/retry-link.handler.js';
import { AdminClearLinkHandler } from './admin-clear-link.handler.js';

export class ClearLinkDto {
  /** Why. Optional, and recorded in the audit row when it is given. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * The Owner's half of the ingestion queue (FR-014).
 *
 * `UsersOnly` **and** `Roles('admin')`, which is the pair every administrative
 * route in this platform carries: the first refuses a service token — n8n has
 * no business clearing a member's link — and the second refuses an ordinary
 * member. The internal pipeline routes make the opposite choice, and the two
 * together are constitution VI's three principal kinds doing their job.
 *
 * The queue *list* is the `ingestionQueue` GraphQL query rather than a route
 * here, because it is a read.
 */
@Controller('api/v1/admin/knowledge')
@UsersOnly()
@Roles('admin')
@ApiBearerAuth()
export class AdminKnowledgeController {
  constructor(
    private readonly links: LinkRepository,
    private readonly retrying: RetryLinkHandler,
    private readonly clear: AdminClearLinkHandler,
  ) {}

  /**
   * Retry somebody else's link.
   *
   * The owning member is looked up first and the ordinary handler is called
   * with *their* id, rather than adding an unscoped path to the handler. So the
   * Owner's retry is the member's retry — same attempt ceiling, same refusal
   * when it is exhausted — and there is exactly one place where "may this be
   * tried again" is decided.
   */
  @Post(':linkId/retry')
  @HttpCode(200)
  async retry(@Param('linkId') linkId: string) {
    const link = await this.links.findAnyById(linkId);
    if (!link) throw new NotFoundException(`No link ${linkId}.`);

    try {
      return await this.retrying.handle(link.userId, linkId);
    } catch (error) {
      if (error instanceof LinkRuleError) {
        throw new ConflictException({
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }
  }

  @Delete(':linkId')
  @HttpCode(200)
  async clearLink(
    @CurrentPrincipal() principal: Principal,
    @Param('linkId') linkId: string,
    @Body() body: ClearLinkDto,
  ) {
    try {
      return await this.clear.handle(principal, linkId, body.reason ?? null);
    } catch (error) {
      if (error instanceof LinkNotFound) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}

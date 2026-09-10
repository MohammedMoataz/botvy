import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  CurrentPrincipal,
  UsersOnly,
} from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import type { Conversation } from '../../domain/conversation.aggregate.js';
import { ProtectedConversationError } from '../../domain/conversation.aggregate.js';
import {
  ConversationForbidden,
  ConversationStale,
} from '../../domain/conversation-access.js';
import { ArchiveConversationHandler } from '../archive/archive-conversation.handler.js';
import { ClearConversationHandler } from '../clear/clear-conversation.handler.js';
import {
  toConversationView,
  type ConversationView,
} from '../conversations/conversations.query.js';
import { CreateConversationHandler } from '../create-conversation/create-conversation.handler.js';
import { DeleteConversationHandler } from '../delete/delete-conversation.handler.js';
import { PinConversationHandler } from '../pin/pin-conversation.handler.js';
import { RenameConversationHandler } from '../rename/rename-conversation.handler.js';

/** The aggregate's own cap, restated so a 500-character title is a 400. */
const TITLE_LIMIT = 60;

export class CreateConversationDto {
  /**
   * The client's own id, and a uuid is enforced rather than assumed.
   *
   * The phone mints a uuidv7 before the row exists locally, which is what makes
   * a retried create a no-op instead of a duplicate chat. Accepting any string
   * would let a client choose `coach` as an id, or reuse one id for two chats
   * on two devices, and the second case is unrecoverable: the create is
   * idempotent by id, so the two devices would silently share one conversation.
   */
  @IsUUID()
  id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(TITLE_LIMIT)
  title?: string;
}

/**
 * `{ title?, pinned?, archived?, baseUpdatedAt }` exactly as
 * `contracts/rest-commands.md` has it — one PATCH for the three edits rather
 * than three action routes, because they are three fields of one row and a
 * client that changes two of them means one request.
 */
export class PatchConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(TITLE_LIMIT)
  title?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  /**
   * The `updatedAt` of the version the client is editing, if it holds one.
   *
   * Declared because the contract carries it and the global `ValidationPipe`
   * runs with `forbidNonWhitelisted`, so an undeclared field is a 400 for the
   * whole request — a contract-following client would have been refused
   * outright. And *used*, because declaring it and ignoring it is worse than
   * either: the field reads as implemented lost-update protection to whoever
   * writes the client.
   *
   * Optional, and its absence consults no clock at all. That is the same shape
   * as the sync conflict rule: only a client that says which version it held
   * has the claim checked, and one that does not is taking the last-write-wins
   * it asked for.
   */
  @IsOptional()
  @IsDateString()
  baseUpdatedAt?: string;
}

/**
 * The member's chats: create, rename, pin, archive, clear, delete.
 *
 * `api/v1` and `@UsersOnly()`, matching `reminders.controller.ts` exactly —
 * one prefix for every command surface, and the routes below spell out
 * `conversations` because Nest's `@Controller` prefix is the version and not
 * the resource in this codebase.
 *
 * ## One controller, six handlers
 *
 * Each command is its own slice and this is the one HTTP surface over them,
 * which is `manage-reminder`'s shape: the transport concerns — the status code,
 * the DTO, the vocabulary translation — are the same for all six and would
 * otherwise be written six times, while the six *writes* have nothing in common
 * beyond the row they touch.
 *
 * ## Why the action routes answer 200
 *
 * `POST /conversations/:id/clear` creates nothing. 201 means "a new resource
 * exists at a location", and fifteen routes in P2 had to be corrected for
 * answering it to an action — a client that branches on the status code (the
 * SDK does) reads 201 as "created" and looks for something new.
 *
 * `POST /conversations` is 200 as well, and that one is not the same argument:
 * the id comes from the client, so a retried create returns the conversation
 * that is already there and 201 would be a claim that something was just made.
 * `POST /reminders` answers 200 for exactly this reason.
 */
@Controller('api/v1')
@UsersOnly()
@ApiBearerAuth()
export class ConversationsController {
  constructor(
    private readonly creates: CreateConversationHandler,
    private readonly renames: RenameConversationHandler,
    private readonly pins: PinConversationHandler,
    private readonly archives: ArchiveConversationHandler,
    private readonly clears: ClearConversationHandler,
    private readonly deletes: DeleteConversationHandler,
  ) {}

  @Post('conversations')
  @HttpCode(200)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateConversationDto,
  ): Promise<ConversationView> {
    return this.translate(async () =>
      toConversationView(
        await this.creates.handle(principal.id, {
          id: body.id,
          title: body.title,
        }),
      ),
    );
  }

  /**
   * Title, pinned and archived in one request.
   *
   * The three writes happen in sequence and each is its own transaction, which
   * is honest about what the store does rather than pretending the PATCH is
   * atomic across them. A crash between two of them leaves the row with one
   * field changed and the client's next pull tells it so.
   *
   * `baseUpdatedAt` is checked against the **first** write only, and then
   * dropped. Once one field from the version the client held has been accepted,
   * the row's `updatedAt` is this request's own — carrying the original base
   * into the second write would compare the client's version against a row this
   * same request had just moved, and every two-field PATCH would answer 409 to
   * itself.
   */
  @Patch('conversations/:id')
  async patch(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: PatchConversationDto,
  ): Promise<ConversationView> {
    if (
      body.title === undefined &&
      body.pinned === undefined &&
      body.archived === undefined
    ) {
      throw new BadRequestException({
        code: 'invalid',
        message: 'Send at least one of title, pinned or archived.',
      });
    }

    return this.translate(async () => {
      let base = body.baseUpdatedAt ? new Date(body.baseUpdatedAt) : undefined;
      let conversation: Conversation | null = null;
      const at = new Date();

      if (body.title !== undefined) {
        conversation = await this.renames.handle(
          principal.id,
          id,
          body.title,
          at,
          base,
        );
        base = undefined;
      }
      if (body.pinned !== undefined) {
        conversation = await this.pins.handle(
          principal.id,
          id,
          body.pinned,
          at,
          base,
        );
        base = undefined;
      }
      if (body.archived !== undefined) {
        conversation = await this.archives.handle(
          principal.id,
          id,
          body.archived,
          at,
          base,
        );
      }

      // Unreachable: the guard above refuses a body with none of the three, so
      // at least one branch has run. Written as a throw rather than a `!` so
      // that a fourth field added to the DTO without a branch here fails loudly
      // instead of returning `null` as a conversation.
      if (!conversation) {
        throw new BadRequestException({
          code: 'invalid',
          message: 'Nothing to change.',
        });
      }
      return toConversationView(conversation);
    });
  }

  @Post('conversations/:id/clear')
  @HttpCode(200)
  async clear(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<ConversationView> {
    return this.translate(async () =>
      toConversationView(await this.clears.handle(principal.id, id)),
    );
  }

  @Delete('conversations/:id')
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<ConversationView> {
    return this.translate(async () =>
      toConversationView(await this.deletes.handle(principal.id, id)),
    );
  }

  /**
   * Domain vocabulary to HTTP, and the two 403s are the interesting part.
   *
   * **`forbidden`** is what a conversation belonging to somebody else answers,
   * and also what one that does not exist answers — FR-020. The two must not be
   * distinguishable: a 404 for a missing id beside a 403 for a foreign one is
   * an oracle that tells an attacker walking a list of ids which ones are real.
   * `ConversationForbidden` carries no id and its message names nothing.
   *
   * **`protected`** is the other one: a `delete`, `unpin` or `archive` of the
   * coach or planner chat. Also a 403 — the request is well-formed and the
   * member is who they say they are, they are simply not allowed this on this
   * row — and the error's own message already offers clearing instead, so it is
   * passed through rather than replaced. A client branches on the code, not the
   * sentence, which is why both codes are in the body and not only in the
   * status.
   *
   * `stale` is a 409, matching the sync protocol's word for the same verdict.
   * It is never used for a protected row: a stale verdict tells a client to
   * take the server's copy and retry, and against a row it will never be
   * allowed to change it would retry for ever.
   */
  private async translate<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ConversationForbidden) {
        throw new ForbiddenException({
          code: 'forbidden',
          message: error.message,
        });
      }
      if (error instanceof ProtectedConversationError) {
        throw new ForbiddenException({
          code: 'protected',
          message: error.message,
          // Which of the three was refused, so a client can word its own
          // message without parsing the sentence.
          operation: error.operation,
        });
      }
      if (error instanceof ConversationStale) {
        throw new ConflictException({
          code: 'stale',
          message: error.message,
          serverUpdatedAt: error.serverUpdatedAt,
        });
      }
      throw error;
    }
  }
}

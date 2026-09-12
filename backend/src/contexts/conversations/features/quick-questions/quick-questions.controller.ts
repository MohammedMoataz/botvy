import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CurrentPrincipal } from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import type { ConversationKind } from '../../domain/conversation.aggregate.js';
import {
  ManageQuickQuestionHandler,
  MAX_QUESTION,
} from './manage-quick-question.handler.js';

export class AddQuickQuestionDto {
  /**
   * Minted by the client, so a retried add writes the same row over itself.
   *
   * Same rule as every other thing the phone can create: the server accepting
   * the client's id is what makes a retry a no-op rather than a duplicate, and
   * a member on a train tapping "add" twice is the ordinary case.
   */
  @IsUUID()
  id!: string;

  @IsIn(['coach', 'planner', 'free'])
  scope!: ConversationKind;

  @IsString()
  @MinLength(1)
  @MaxLength(MAX_QUESTION)
  text!: string;
}

/**
 * A member's own quick questions.
 *
 * The *list* is a GraphQL query — reads are GraphQL, constitution X — and these
 * two are commands, so they are REST. Both answer 200: adding returns the row
 * rather than a location, and removing creates nothing.
 *
 * There is no `PATCH`. Editing a chip is deleting one and adding another, and
 * a route for it would be a route whose only job is saving a member one tap.
 */
@Controller('api/v1/quick-questions')
export class QuickQuestionsController {
  constructor(private readonly questions: ManageQuickQuestionHandler) {}

  @Post()
  @HttpCode(200)
  async add(
    @CurrentPrincipal() principal: Principal,
    @Body() body: AddQuickQuestionDto,
  ): Promise<{ id: string; scope: string; text: string }> {
    const question = await this.questions.add({
      userId: principal.id,
      id: body.id,
      scope: body.scope,
      text: body.text,
    });
    return {
      id: question.id,
      scope: question.scope,
      text: question.text.en,
    };
  }

  /**
   * `204`, because there is nothing to say.
   *
   * The one route in this phase that is not a 200: a delete with no body is
   * exactly what 204 means, and the member's client already knows which id it
   * asked about.
   */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<void> {
    await this.questions.remove(principal.id, id);
  }
}

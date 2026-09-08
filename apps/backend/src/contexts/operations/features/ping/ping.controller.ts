import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { CurrentPrincipal, UsersOnly } from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import type { CommandAck } from '../../../../shared/cqrs/result.js';
import { PingHandler } from './ping.handler.js';

export class PingDto {
  /**
   * Minted by the client before the request is sent, so a retry after a dropped
   * connection is recognisably the same ping rather than a second one.
   */
  @IsUUID()
  clientId!: string;
}

/**
 * The one command P0 ships.
 *
 * `@UsersOnly` because a machine caller has `/internal/*` and no business
 * acting as a member. The answer is an ack, never a view: reads go through
 * GraphQL or the sync pull, and a command that returned a view would invite a
 * client to treat it as one.
 */
@Controller('api/v1/ping')
// So the generated contract says a credential is required. Without it the
// operation publishes as open, and the SDK, the phone and the extension all
// generate their clients from that document.
@ApiBearerAuth()
export class PingController {
  constructor(private readonly handler: PingHandler) {}

  @Post()
  @UsersOnly()
  async ping(
    @Body() body: PingDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<CommandAck> {
    return this.handler.handle({ principal, clientId: body.clientId });
  }
}

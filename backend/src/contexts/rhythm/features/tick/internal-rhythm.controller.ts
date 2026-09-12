import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { Scopes, ServiceOnly } from '../../../../shared/auth/decorators.js';
import type { TouchKind } from '../../domain/rhythm-state.aggregate.js';
import { PromptNowHandler } from '../prompt-now/prompt-now.handler.js';
import { TickHandler, type TickResult } from './tick.handler.js';

export class PromptNowDto {
  /** Whose touch to run. Omitted means every member. */
  @IsOptional()
  @IsString()
  userId?: string;

  @IsIn(['plan', 'end_of_day', 'morning'])
  kind!: TouchKind;
}

/**
 * The two routes only a machine may call.
 *
 * `ServiceOnly` rather than a role check, and the distinction is constitution
 * VI: this is not "an administrator's endpoint", it is an endpoint no *person*
 * has any business calling. n8n's pulse hits the tick every five minutes with a
 * service token; a member's JWT is refused on it whatever their role, because a
 * member being able to trigger a pass over everybody's evening is a different
 * thing from a member being an administrator.
 */
@Controller('internal/rhythm')
@ServiceOnly()
// The scope `contracts/internal.md` names for this surface. A service token is
// not a master key: n8n holds exactly the scopes for the jobs it runs, so a
// leaked automation credential cannot also read a member's chat.
@Scopes('internal:tick')
export class InternalRhythmController {
  constructor(
    private readonly tick: TickHandler,
    private readonly prompt: PromptNowHandler,
  ) {}

  /**
   * One pass of the per-member clock.
   *
   * Returns the counts rather than an ack, because n8n's workflow logs the
   * response and that log is the only record of what a 22:00 pass did. A bare
   * `{ ok: true }` would make "the tick ran and nobody was due" and "the tick
   * ran and sent four hundred summaries" the same line.
   */
  @Post('tick')
  @HttpCode(200)
  async run(): Promise<TickResult> {
    return this.tick.handle();
  }

  /**
   * A touch, sent now, for one member or for everybody.
   *
   * The operator's "Run" button. It ignores the time of day and the claim date
   * on purpose — see `PromptNowHandler` for why a conditional Run would be a
   * button that works only when nobody needs it.
   */
  @Post('prompt')
  @HttpCode(200)
  async promptNow(@Body() body: PromptNowDto): Promise<{ sent: number }> {
    return this.prompt.handle({ userId: body.userId, kind: body.kind });
  }
}

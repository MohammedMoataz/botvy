import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CurrentPrincipal, Roles, UsersOnly } from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import {
  InvalidSettingError,
  SettingReadOnlyError,
  SettingsService,
  UnknownSettingError,
} from '../../../../shared/settings/settings.service.js';

export class PatchSettingDto {
  /**
   * Deliberately `unknown`. Each key validates against its own zod schema in
   * the registry, so a DTO here would be a second copy of forty-one rules that
   * drifts from the first — and the useful error message is the one the schema
   * produces, naming the key and what it wanted.
   */
  value!: unknown;
}

/**
 * The settings registry, as the portal reads and writes it.
 *
 * These two routes are what P0's T029 claimed and did not build, and the
 * absence was not quiet: `AdminStore.settings()` calls `GET`, the Overview page
 * awaits it inside a `Promise.all`, and a 404 there rejected the whole thing —
 * so the store tiles, the job list *and* the default-password warning all
 * failed to render, which made T118 pointless as well.
 *
 * It also meant `SettingsService.set` was never called from production code at
 * all. Every registry key was a de-facto hard-coded default, which is precisely
 * what principle XII exists to prevent.
 *
 * `readOnly` is enforced by the service on the entry's own flag, never by a key
 * prefix — refusing `ops.*` wholesale froze `ops.staleAfterMinutes`, which is
 * exactly the number an operator retunes.
 */
@Controller('api/v1/admin/settings')
@UsersOnly()
@Roles('admin')
@ApiBearerAuth()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** The whole registry: every key, its current value, its default and whether
   * an operator may touch it. One request, because the portal renders a table. */
  @Get()
  async describe(): Promise<
    Array<{ key: string; value: unknown; default: unknown; description: string; readOnly: boolean }>
  > {
    return this.settings.describe();
  }

  @Patch(':key')
  @HttpCode(200)
  async patch(
    @Param('key') key: string,
    @Body() body: PatchSettingDto,
    @CurrentPrincipal() actor: Principal,
  ): Promise<{ key: string; value: unknown }> {
    try {
      const value = await this.settings.set(key, body.value, actor);
      return { key, value };
    } catch (error) {
      if (error instanceof UnknownSettingError) throw new NotFoundException(error.message);
      // 403 rather than 400: the value may be perfectly valid, and the reason
      // it is refused is who is asking rather than what they asked for.
      if (error instanceof SettingReadOnlyError) throw new ForbiddenException(error.message);
      // The schema's own message, which names the key and the rule. A generic
      // "invalid value" would throw away the only useful part.
      if (error instanceof InvalidSettingError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import {
  CurrentPrincipal,
  Roles,
  UsersOnly,
} from '../../../../shared/auth/decorators.js';
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
   *
   * ## `@Allow()` is not decoration, and leaving it off broke the endpoint
   *
   * The global pipe runs `whitelist: true` with `forbidNonWhitelisted: true`,
   * and *whitelisted* means "carries at least one class-validator decorator".
   * A property with none is not a property the pipe can see, so this endpoint
   * answered every single request — the portal's, the gate's, an operator's —
   * with `400 property value should not exist`. The one write path to the
   * settings registry, refusing the only field it takes.
   *
   * That is the exact failure the file's own comment below says these routes
   * exist to prevent: with `SettingsService.set` unreachable, every registry
   * key is a de-facto hard-coded default, and principle XII says a hard-coded
   * default is a bug. It survived because the whole suite binds handlers
   * directly and the gates that touch settings write them through the store —
   * neither goes through the HTTP pipe, which is the only place this rule
   * lives.
   *
   * `@Allow()` says "this property is declared" and validates nothing, which
   * is precisely the intent: the zod schema in the registry is the validator.
   */
  @Allow()
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
  // GET /admin/settings was here. It is a read, and constitution X puts reads on GraphQL:
  // `settings` at /graphql answers it. Removed rather than left beside the
  // resolver, because two paths to one answer is the drift this rewrite exists
  // to remove - and the REST one leaked nothing, but drifted anyway.

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
      if (error instanceof UnknownSettingError)
        throw new NotFoundException(error.message);
      // 403 rather than 400: the value may be perfectly valid, and the reason
      // it is refused is who is asking rather than what they asked for.
      if (error instanceof SettingReadOnlyError)
        throw new ForbiddenException(error.message);
      // The schema's own message, which names the key and the rule. A generic
      // "invalid value" would throw away the only useful part.
      if (error instanceof InvalidSettingError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }
}

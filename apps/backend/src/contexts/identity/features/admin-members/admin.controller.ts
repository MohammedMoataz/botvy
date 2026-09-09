import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentPrincipal, Roles, UsersOnly } from '../../../../shared/auth/decorators.js';
import type { Principal, Role } from '../../../../shared/auth/principal.js';
import type { MemberPage } from '../../domain/user.repository.js';
import {
  AdminServiceClientsHandler,
  ServiceClientNameTaken,
  ServiceClientNotFound,
  type CreatedServiceClient,
} from '../admin-service-clients/admin-service-clients.handler.js';
import {
  AdminMembersHandler,
  CannotActOnSelf,
  LastAdminProtected,
  MemberNotFound,
} from './admin-members.handler.js';
import { MembersQueryHandler } from './members.query.js';

export class SetRoleDto {
  @IsIn(['user', 'admin'])
  role!: Role;
}

export class BanDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CreateServiceClientDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsArray()
  @IsString({ each: true })
  scopes!: string[];
}

/**
 * The administrator's surface.
 *
 * `@Roles('admin')` on the class, not per route: a route added here later
 * inherits the restriction rather than needing someone to remember it, which is
 * the failure mode a per-route decorator has. `@UsersOnly` as well, because a
 * service token must never be able to promote an account — n8n holds one and
 * n8n runs workflows the Owner wrote, not decisions the Owner made.
 */
@Controller('api/v1/admin')
@UsersOnly()
@Roles('admin')
@ApiBearerAuth()
export class AdminController {
  constructor(
    private readonly members: AdminMembersHandler,
    private readonly memberList: MembersQueryHandler,
    private readonly serviceClients: AdminServiceClientsHandler,
  ) {}

  @Get('users')
  async users(
    @Query('q') q?: string,
    @Query('status') status?: 'active' | 'banned',
    @Query('role') role?: Role,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<MemberPage> {
    return this.memberList.search({
      ...(q ? { query: q } : {}),
      ...(status ? { status } : {}),
      ...(role ? { role } : {}),
      ...(cursor ? { cursor } : {}),
      limit: clampLimit(limit),
    });
  }

  @Patch('users/:id/role')
  @HttpCode(200)
  async setRole(
    @Param('id') id: string,
    @Body() body: SetRoleDto,
    @CurrentPrincipal() actor: Principal,
  ): Promise<{ userId: string; role: Role }> {
    return this.guard(() => this.members.setRole(actor, id, body.role));
  }

  @Post('users/:id/ban')
  @HttpCode(200)
  async ban(
    @Param('id') id: string,
    @Body() body: BanDto,
    @CurrentPrincipal() actor: Principal,
  ): Promise<{ userId: string; sessionsEnded: number }> {
    return this.guard(() => this.members.ban(actor, id, body.reason ?? null));
  }

  @Post('users/:id/unban')
  @HttpCode(200)
  async unban(
    @Param('id') id: string,
    @CurrentPrincipal() actor: Principal,
  ): Promise<{ userId: string }> {
    return this.guard(() => this.members.unban(actor, id));
  }

  @Get('service-clients')
  async listServiceClients(): Promise<unknown[]> {
    return this.serviceClients.list();
  }

  /** The response carries the secret. It is the only time it ever will. */
  @Post('service-clients')
  async createServiceClient(
    @Body() body: CreateServiceClientDto,
    @CurrentPrincipal() actor: Principal,
  ): Promise<CreatedServiceClient> {
    try {
      return await this.serviceClients.create(actor, body.name, body.scopes);
    } catch (error) {
      if (error instanceof ServiceClientNameTaken) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Delete('service-clients/:name')
  @HttpCode(200)
  async revokeServiceClient(
    @Param('name') name: string,
    @CurrentPrincipal() actor: Principal,
  ): Promise<{ id: string; revoked: true }> {
    try {
      return await this.serviceClients.revoke(actor, name);
    } catch (error) {
      if (error instanceof ServiceClientNotFound) throw new NotFoundException(error.message);
      throw error;
    }
  }

  /**
   * The three refusals the member handlers raise, mapped once.
   *
   * `LastAdminProtected` and `CannotActOnSelf` are 409 rather than 403: the
   * caller is permitted to do this, the *state* forbids it, and a 403 would
   * send an Owner looking at their own permissions instead of at the account.
   */
  private async guard<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof MemberNotFound) throw new NotFoundException(error.message);
      if (error instanceof LastAdminProtected || error instanceof CannotActOnSelf) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}

/** A page size a caller cannot use to read the whole table in one request. */
function clampLimit(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 25;
  return Math.min(parsed, 100);
}

import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { Roles } from '../auth/roles.decorator.js';

export class UpdateSettingDto {
  @ApiProperty({
    description: 'New value, validated against that key\'s schema',
    example: 200,
  })
  value!: unknown;
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
// Under /api/, not /admin/: the admin SPA is served at /admin, and an API
// route sharing that prefix would be shadowed by (or shadow) static file
// handling depending on middleware order. Keeping them disjoint removes
// the ambiguity rather than relying on exclude patterns to referee it.
@Controller('api/admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly settings: SettingsService,
  ) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('users')
  users() {
    return this.admin.listUsers();
  }

  @Get('devices')
  devices() {
    return this.admin.listDevices();
  }

  /** Every tunable with its effective value, plus what the gateway last did. */
  @Get('settings')
  listSettings() {
    return this.settings.list();
  }

  /**
   * The one mutating route on the admin API. Values are validated per key and
   * take effect without a restart; secrets are not in the registry, so this
   * cannot reach them.
   */
  @Patch('settings/:key')
  updateSetting(@Param('key') key: string, @Body() dto: UpdateSettingDto) {
    return this.settings.set(key, dto.value);
  }
}

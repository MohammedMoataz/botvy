import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service.js';
import { Roles } from '../auth/roles.decorator.js';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
// Under /api/, not /admin/: the admin SPA is served at /admin, and an API
// route sharing that prefix would be shadowed by (or shadow) static file
// handling depending on middleware order. Keeping them disjoint removes
// the ambiguity rather than relying on exclude patterns to referee it.
@Controller('api/admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

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

  @Get('settings')
  settings() {
    return this.admin.listSettings();
  }
}

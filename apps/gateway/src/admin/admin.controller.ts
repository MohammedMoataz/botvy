import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service.js';
import { Roles } from '../auth/roles.decorator.js';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin')
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

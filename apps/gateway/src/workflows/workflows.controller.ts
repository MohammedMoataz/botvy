import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { N8nService } from './n8n.service.js';
import { Roles } from '../auth/roles.decorator.js';

@ApiTags('workflows')
@ApiBearerAuth()
@Roles('admin')
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly n8n: N8nService) {}

  @Get()
  list() {
    return this.n8n.list();
  }

  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.n8n.activate(id);
  }

  @Post(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.n8n.deactivate(id);
  }

  @Post(':id/run')
  run(@Param('id') id: string) {
    return this.n8n.trigger(id);
  }
}

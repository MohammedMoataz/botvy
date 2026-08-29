import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller.js';
import { N8nService } from './n8n.service.js';

@Module({
  controllers: [WorkflowsController],
  providers: [N8nService],
})
export class WorkflowsModule {}

import {
  BadGatewayException,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AuditPort } from '../../../../shared/audit/audit.port.js';
import {
  CurrentPrincipal,
  Roles,
  UsersOnly,
} from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import {
  AutomationNotConfigured,
  AutomationUnreachable,
  WorkflowsPort,
  type WorkflowSummary,
} from '../../domain/workflows.port.js';

/**
 * The automation, as the Owner drives it (P10, FR-008, T1023).
 *
 * Commands are REST and this is a controller; the *list* is here too rather
 * than on GraphQL, and that is the one deliberate exception in this codebase to
 * constitution X. The reason is that it is not a read of this platform's data
 * at all — it is a question asked of another system over the network, which can
 * be down, and whose answer is never stored. Putting it in the GraphQL schema
 * would type a foreign system's rows as though they were ours and would make
 * "the automation tool is not answering" a GraphQL error in the middle of a
 * query that also asked for something real.
 *
 * Every act writes an audit row (FR-005). Running a job by hand is exactly the
 * sort of thing somebody is asked about a week later.
 */
@Controller('api/v1/admin/workflows')
@UsersOnly()
@Roles('admin')
@ApiBearerAuth()
export class AdminWorkflowsController {
  constructor(
    private readonly workflows: WorkflowsPort,
    private readonly audit: AuditPort,
  ) {}

  @Get()
  async list(): Promise<{ workflows: WorkflowSummary[] }> {
    return this.translate(async () => ({ workflows: await this.workflows.list() }));
  }

  @Post(':id/activate')
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<{ id: string; active: boolean }> {
    return this.translate(async () => {
      await this.workflows.activate(id);
      await this.record(principal, 'workflow.activate', id);
      return { id, active: true };
    });
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  async deactivate(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<{ id: string; active: boolean }> {
    return this.translate(async () => {
      await this.workflows.deactivate(id);
      await this.record(principal, 'workflow.deactivate', id);
      return { id, active: false };
    });
  }

  @Post(':id/run')
  @HttpCode(200)
  async run(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<{ id: string; executionId: string | null }> {
    return this.translate(async () => {
      const { executionId } = await this.workflows.run(id);
      await this.record(principal, 'workflow.run', id, { executionId });
      return { id, executionId };
    });
  }

  private async record(
    actor: Principal,
    action: string,
    id: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      actor,
      action,
      target: { type: 'workflow', id },
      at: new Date(),
      ...(meta ? { meta } : {}),
    });
  }

  /**
   * The two failures, told apart, because the screen says different things.
   *
   * **503** for an installation with no automation key: nothing is wrong, the
   * feature was never set up, and the page should invite the Owner to set it up
   * rather than report a fault.
   *
   * **502** for a tool that is not answering: something *is* wrong, and it is
   * not this platform. Both are better than an empty list, which is a false
   * statement of fact — the Owner would go looking for workflows they imported
   * months ago.
   */
  private async translate<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof AutomationNotConfigured) {
        throw new ServiceUnavailableException({
          code: 'automation_not_configured',
          message: error.message,
        });
      }
      if (error instanceof AutomationUnreachable) {
        throw new BadGatewayException({
          code: 'automation_unreachable',
          message: error.message,
        });
      }
      throw error;
    }
  }
}

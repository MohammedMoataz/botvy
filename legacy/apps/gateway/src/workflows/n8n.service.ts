import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { computeNextRun, findWebhookPath, type WorkflowNode } from './next-run.js';

interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  nodes: WorkflowNode[];
  tags?: { name: string }[];
}

interface N8nExecution {
  id: string;
  workflowId: string;
  status: string;
  startedAt: string;
  stoppedAt?: string;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  active: boolean;
  /** Null when the workflow has no schedule, or uses a cron expression we do not evaluate. */
  nextRun: string | null;
  lastExecution: { status: string; startedAt: string } | null;
  canTrigger: boolean;
}

@Injectable()
export class N8nService {
  private readonly logger = new Logger(N8nService.name);
  private readonly baseUrl: string;
  private readonly webhookBaseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('N8N_URL') ?? 'http://n8n:5678').replace(/\/$/, '');
    this.webhookBaseUrl = this.baseUrl;
    this.apiKey = config.get<string>('N8N_API_KEY');
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'n8n API key is not configured; workflow management is unavailable',
      );
    }
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/v1${path}`, {
        ...init,
        headers: { 'X-N8N-API-KEY': this.apiKey, 'Content-Type': 'application/json', ...init.headers },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      // Distinguishable from "there are no workflows" — an empty list must
      // never be the way an outage presents itself.
      this.logger.error(`n8n unreachable at ${this.baseUrl}: ${String(err)}`);
      throw new ServiceUnavailableException(`Cannot reach n8n at ${this.baseUrl}`);
    }
    if (!response.ok) {
      const body = await response.text();
      throw new ServiceUnavailableException(`n8n returned ${response.status}: ${body.slice(0, 200)}`);
    }
    return (await response.json()) as T;
  }

  async list(): Promise<WorkflowSummary[]> {
    const [workflows, executions] = await Promise.all([
      this.call<{ data: N8nWorkflow[] }>('/workflows?limit=250'),
      this.call<{ data: N8nExecution[] }>('/executions?limit=250').catch(() => ({
        data: [] as N8nExecution[],
      })),
    ]);

    const latestByWorkflow = new Map<string, N8nExecution>();
    for (const execution of executions.data) {
      const seen = latestByWorkflow.get(execution.workflowId);
      if (!seen || execution.startedAt > seen.startedAt) {
        latestByWorkflow.set(execution.workflowId, execution);
      }
    }

    const now = new Date();
    return workflows.data.map((workflow) => {
      const nextRun = computeNextRun(workflow.nodes ?? [], now);
      const last = latestByWorkflow.get(workflow.id);
      return {
        id: workflow.id,
        name: workflow.name,
        active: workflow.active,
        nextRun: workflow.active && nextRun ? nextRun.toISOString() : null,
        lastExecution: last ? { status: last.status, startedAt: last.startedAt } : null,
        canTrigger: findWebhookPath(workflow.nodes ?? []) !== null,
      };
    });
  }

  activate(id: string) {
    return this.call(`/workflows/${id}/activate`, { method: 'POST' });
  }

  deactivate(id: string) {
    return this.call(`/workflows/${id}/deactivate`, { method: 'POST' });
  }

  /**
   * n8n's public API cannot execute a workflow, so each botvy workflow
   * carries a companion webhook trigger and we call that instead.
   */
  async trigger(id: string) {
    const workflow = await this.call<N8nWorkflow>(`/workflows/${id}`);
    const path = findWebhookPath(workflow.nodes ?? []);
    if (!path) {
      throw new ServiceUnavailableException(
        `Workflow "${workflow.name}" has no webhook trigger, so it cannot be run on demand`,
      );
    }
    const response = await fetch(`${this.webhookBaseUrl}/webhook/${path}`, {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
    });
    return { triggered: response.ok, status: response.status, webhook: path };
  }
}

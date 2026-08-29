import { api } from './client';

export interface WorkflowSummary {
  id: string;
  name: string;
  active: boolean;
  /** Null when the workflow has no schedule, or uses a cron expression the gateway does not evaluate. */
  nextRun: string | null;
  lastExecution: { status: string; startedAt: string } | null;
  /** False when the workflow has no companion webhook, so it cannot be run on demand. */
  canTrigger: boolean;
}

export const listWorkflows = (): Promise<WorkflowSummary[]> =>
  api<WorkflowSummary[]>('/workflows');

export const activateWorkflow = (id: string): Promise<unknown> =>
  api(`/workflows/${id}/activate`, { method: 'POST' });

export const deactivateWorkflow = (id: string): Promise<unknown> =>
  api(`/workflows/${id}/deactivate`, { method: 'POST' });

export const runWorkflow = (id: string): Promise<{ triggered: boolean; status: number }> =>
  api(`/workflows/${id}/run`, { method: 'POST' });

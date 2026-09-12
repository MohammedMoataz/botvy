import { Injectable } from '@nestjs/common';
import type { Env } from '../../../shared/config/env.schema.js';
import {
  AutomationNotConfigured,
  AutomationUnreachable,
  WorkflowsPort,
  type WorkflowSummary,
} from '../domain/workflows.port.js';

/**
 * n8n's public API, behind the port (P10, FR-008).
 *
 * ## The credential never leaves this process
 *
 * `N8N_API_KEY` is an environment variable the backend holds, and the portal
 * reaches automation *through* this adapter rather than talking to n8n
 * directly. That is constitution V doing its job: n8n is not on the edge — Caddy
 * does not route it — and a browser that could reach it would need the key,
 * which would then be in a bundle.
 *
 * ## Every failure is one of two, and the difference reaches the screen
 *
 * No key configured is an installation that never set automation up, and the
 * screen says so. A key that cannot reach n8n is a tool that is down, and the
 * screen says *that* — because the alternative, an empty list, is a false
 * statement of fact that sends the Owner looking for workflows they imported
 * months ago.
 */
@Injectable()
export class N8nWorkflowsAdapter extends WorkflowsPort {
  /**
   * Assigned rather than taken as a constructor parameter.
   *
   * A parameter typed `typeof fetch` emits `Function` as its design type, which
   * Nest tries to resolve and cannot — an `UnknownDependenciesException` at boot
   * that no typecheck sees. A property is substitutable by a spec and invisible
   * to the injector, which is the same call `MediaController` makes.
   */
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis);

  constructor(private readonly env: Env) {
    super();
  }

  async list(): Promise<WorkflowSummary[]> {
    const workflows = await this.call<{ data?: unknown[] }>('GET', '/workflows');
    const rows = Array.isArray(workflows.data) ? workflows.data : [];

    /*
     * The last execution per workflow comes from a second call, not from the
     * workflow row — n8n does not put it there.
     *
     * One call for the lot rather than one per workflow: this installation has
     * a handful of workflows and the executions list is already ordered newest
     * first, so the first row seen for an id is its last run.
     */
    const executions = await this.call<{ data?: unknown[] }>(
      'GET',
      '/executions?limit=100',
    ).catch(() => ({ data: [] as unknown[] }));

    const lastRun = new Map<string, { at: string | null; status: string | null }>();
    for (const raw of Array.isArray(executions.data) ? executions.data : []) {
      const execution = raw as {
        workflowId?: unknown;
        startedAt?: unknown;
        status?: unknown;
      };
      const id = String(execution.workflowId ?? '');
      if (!id || lastRun.has(id)) continue;
      lastRun.set(id, {
        at: typeof execution.startedAt === 'string' ? execution.startedAt : null,
        status: typeof execution.status === 'string' ? execution.status : null,
      });
    }

    return rows.map((raw) => {
      const workflow = raw as { id?: unknown; name?: unknown; active?: unknown };
      const id = String(workflow.id ?? '');
      const run = lastRun.get(id);
      return {
        id,
        name: typeof workflow.name === 'string' ? workflow.name : id,
        active: workflow.active === true,
        lastRunAt: run?.at ?? null,
        lastStatus: run?.status ?? null,
      };
    });
  }

  async activate(id: string): Promise<void> {
    await this.call('POST', `/workflows/${encodeURIComponent(id)}/activate`);
  }

  async deactivate(id: string): Promise<void> {
    await this.call('POST', `/workflows/${encodeURIComponent(id)}/deactivate`);
  }

  /**
   * Run it now.
   *
   * n8n's public API has no "execute this workflow" route — running one is a
   * thing the editor does over its internal endpoints — so this asks the
   * workflow's own **webhook** the way the schedule would, and reports that it
   * cannot when the workflow has none. Saying so is better than a button that
   * appears to work: the Owner presses Run to prove a job still functions, and a
   * silent no-op would prove the opposite of what they concluded.
   */
  async run(id: string): Promise<{ executionId: string | null }> {
    const detail = await this.call<{ nodes?: unknown[] }>(
      'GET',
      `/workflows/${encodeURIComponent(id)}`,
    );

    const nodes = Array.isArray(detail.nodes) ? detail.nodes : [];
    const webhook = nodes
      .map((raw) => raw as { type?: unknown; parameters?: { path?: unknown } })
      .find((node) => String(node.type ?? '').includes('webhook'));

    const path = webhook?.parameters?.path;
    if (typeof path !== 'string' || path === '') {
      throw new AutomationUnreachable(
        'this workflow has no webhook, so it can only be run from its schedule or the editor',
      );
    }

    const response = await this.fetchImpl(
      `${this.env.N8N_URL.replace(/\/$/, '')}/webhook/${path}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    ).catch((error: unknown) => {
      throw new AutomationUnreachable(String((error as Error)?.message ?? error));
    });

    if (!response.ok) {
      throw new AutomationUnreachable(`the workflow answered ${response.status}`);
    }
    return { executionId: null };
  }

  private async call<T>(method: string, path: string): Promise<T> {
    if (!this.env.N8N_API_KEY) throw new AutomationNotConfigured();

    const url = `${this.env.N8N_URL.replace(/\/$/, '')}/api/v1${path}`;
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        'X-N8N-API-KEY': this.env.N8N_API_KEY,
        'content-type': 'application/json',
      },
    }).catch((error: unknown) => {
      throw new AutomationUnreachable(String((error as Error)?.message ?? error));
    });

    if (!response.ok) {
      throw new AutomationUnreachable(`${method} ${path} answered ${response.status}`);
    }

    return (await response.json()) as T;
  }
}

/**
 * Computes a workflow's next scheduled run from its n8n schedule-trigger
 * node definition.
 *
 * n8n's public API exposes neither "next run" nor "execute now", so the
 * gateway derives the former here and works around the latter with a
 * companion webhook per workflow.
 *
 * A schedule trigger's `parameters.rule.interval` is an array of rule
 * objects; a workflow may carry several triggers, and the next run is the
 * earliest across all of them. A workflow with no schedule trigger (the
 * error handler) has no next run — that is a normal state, not an error.
 */

export interface ScheduleInterval {
  field?: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'cronExpression';
  secondsInterval?: number;
  minutesInterval?: number;
  hoursInterval?: number;
  daysInterval?: number;
  triggerAtHour?: number;
  triggerAtMinute?: number;
  expression?: string;
}

export interface WorkflowNode {
  type: string;
  parameters?: { rule?: { interval?: ScheduleInterval[] } };
}

/**
 * Next occurrence of a daily trigger at a given hour/minute, in UTC.
 * Interval-based rules ("every 5 minutes") are anchored to `from` rather
 * than to a real schedule: n8n anchors them to when the workflow was
 * activated, which the API does not report, so this is an approximation
 * and is documented as such to callers.
 */
function nextForInterval(rule: ScheduleInterval, from: Date): Date | null {
  const field = rule.field ?? 'days';

  switch (field) {
    case 'seconds':
      return new Date(from.getTime() + (rule.secondsInterval ?? 1) * 1000);
    case 'minutes':
      return new Date(from.getTime() + (rule.minutesInterval ?? 1) * 60_000);
    case 'hours':
      return new Date(from.getTime() + (rule.hoursInterval ?? 1) * 3_600_000);
    case 'days': {
      const hour = rule.triggerAtHour ?? 0;
      const minute = rule.triggerAtMinute ?? 0;
      const next = new Date(from);
      next.setUTCHours(hour, minute, 0, 0);
      if (next <= from) next.setUTCDate(next.getUTCDate() + (rule.daysInterval ?? 1));
      return next;
    }
    case 'weeks': {
      const next = new Date(from);
      next.setUTCHours(rule.triggerAtHour ?? 0, rule.triggerAtMinute ?? 0, 0, 0);
      if (next <= from) next.setUTCDate(next.getUTCDate() + 7);
      return next;
    }
    case 'cronExpression':
      // Deliberately not evaluated here: a correct implementation needs a
      // real cron parser with timezone support. Reported as "unknown"
      // rather than guessed, so the UI never shows a wrong time.
      return null;
    default:
      return null;
  }
}

export function computeNextRun(nodes: WorkflowNode[], from: Date = new Date()): Date | null {
  const candidates: Date[] = [];

  for (const node of nodes) {
    if (!node.type?.endsWith('scheduleTrigger')) continue;
    for (const rule of node.parameters?.rule?.interval ?? []) {
      const next = nextForInterval(rule, from);
      if (next) candidates.push(next);
    }
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((earliest, d) => (d < earliest ? d : earliest));
}

/** The `botvy-<slug>` webhook path a workflow is triggered through, if it has one. */
export function findWebhookPath(nodes: WorkflowNode[]): string | null {
  for (const node of nodes) {
    if (!node.type?.endsWith('webhook')) continue;
    const path = (node.parameters as { path?: string } | undefined)?.path;
    if (path) return path;
  }
  return null;
}

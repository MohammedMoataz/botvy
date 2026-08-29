import { describe, expect, it } from 'vitest';
import { computeNextRun, findWebhookPath } from '../src/workflows/next-run.js';

const scheduleNode = (interval: Record<string, unknown>[]) => ({
  type: 'n8n-nodes-base.scheduleTrigger',
  parameters: { rule: { interval } },
});

const now = new Date('2026-08-30T12:00:00Z');

describe('computeNextRun', () => {
  it('returns null for a workflow with no schedule trigger (the error handler)', () => {
    const nodes = [{ type: 'n8n-nodes-base.errorTrigger' }];
    expect(computeNextRun(nodes, now)).toBeNull();
  });

  it('adds the interval for a minutes-based rule', () => {
    const nodes = [scheduleNode([{ field: 'minutes', minutesInterval: 5 }])];
    expect(computeNextRun(nodes, now)).toEqual(new Date('2026-08-30T12:05:00Z'));
  });

  it('adds the interval for an hours-based rule', () => {
    const nodes = [scheduleNode([{ field: 'hours', hoursInterval: 2 }])];
    expect(computeNextRun(nodes, now)).toEqual(new Date('2026-08-30T14:00:00Z'));
  });

  it('uses today for a daily trigger still ahead of us', () => {
    const nodes = [scheduleNode([{ field: 'days', triggerAtHour: 21, triggerAtMinute: 0 }])];
    expect(computeNextRun(nodes, now)).toEqual(new Date('2026-08-30T21:00:00Z'));
  });

  it('rolls a daily trigger to tomorrow once its time has passed', () => {
    const nodes = [scheduleNode([{ field: 'days', triggerAtHour: 9, triggerAtMinute: 30 }])];
    expect(computeNextRun(nodes, now)).toEqual(new Date('2026-08-31T09:30:00Z'));
  });

  it('takes the earliest across several rules on one trigger', () => {
    const nodes = [
      scheduleNode([
        { field: 'days', triggerAtHour: 22 },
        { field: 'days', triggerAtHour: 21 },
      ]),
    ];
    expect(computeNextRun(nodes, now)).toEqual(new Date('2026-08-30T21:00:00Z'));
  });

  it('takes the earliest across several schedule trigger nodes', () => {
    const nodes = [
      scheduleNode([{ field: 'days', triggerAtHour: 22 }]),
      scheduleNode([{ field: 'minutes', minutesInterval: 5 }]),
    ];
    expect(computeNextRun(nodes, now)).toEqual(new Date('2026-08-30T12:05:00Z'));
  });

  it('reports unknown rather than guessing for a cron expression', () => {
    const nodes = [scheduleNode([{ field: 'cronExpression', expression: '0 9 * * 1' }])];
    expect(computeNextRun(nodes, now)).toBeNull();
  });

  it('ignores non-schedule nodes when computing', () => {
    const nodes = [
      { type: 'n8n-nodes-base.httpRequest' },
      { type: 'n8n-nodes-base.webhook', parameters: { path: 'botvy-sweep' } },
      scheduleNode([{ field: 'minutes', minutesInterval: 5 }]),
    ];
    expect(computeNextRun(nodes, now)).toEqual(new Date('2026-08-30T12:05:00Z'));
  });
});

describe('findWebhookPath', () => {
  it('finds the companion webhook path used to trigger a run', () => {
    const nodes = [
      scheduleNode([{ field: 'minutes', minutesInterval: 5 }]),
      { type: 'n8n-nodes-base.webhook', parameters: { path: 'botvy-sweep' } },
    ];
    expect(findWebhookPath(nodes)).toBe('botvy-sweep');
  });

  it('returns null when a workflow has no webhook to trigger through', () => {
    const nodes = [{ type: 'n8n-nodes-base.errorTrigger' }];
    expect(findWebhookPath(nodes)).toBeNull();
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditAdapter } from '../../shared/audit/in-memory-audit.adapter.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import {
  ActorLabelPort,
  AuditQueryHandler,
} from './features/audit/audit.query.js';
import { UsageQueryHandler } from './features/usage/usage.query.js';
import { InMemoryAuditReadRepository } from './infrastructure/in-memory-audit-read.repository.js';
import { InMemoryUsageRepository } from './infrastructure/in-memory-usage.repository.js';

/**
 * The console's two reads, and the rule the settings screen depends on (P10).
 *
 * The Owner's page is arithmetic over rows nobody else reads, so the cases here
 * are about the arithmetic: a range that includes the day it names, a grouping
 * that adds up to the same total however it is sliced, and a page that shows
 * every act exactly once while more are arriving.
 */

const OWNER = 'owner-1';
const MEMBER = 'member-1';

class StubLabels extends ActorLabelPort {
  labels: Record<string, string> = {};
  asked: string[][] = [];

  async labelsFor(ids: string[]): Promise<Record<string, string>> {
    this.asked.push(ids);
    return Object.fromEntries(
      ids.filter((id) => this.labels[id]).map((id) => [id, this.labels[id]!]),
    );
  }
}

// ------------------------------------------------------------------- the trail

describe('the administrative trail (FR-005)', () => {
  let audit: InMemoryAuditReadRepository;
  let labels: StubLabels;
  let handler: AuditQueryHandler;

  const at = (iso: string) => new Date(iso);

  const record = (
    action: string,
    actorId = OWNER,
    when = '2026-09-10T09:00:00.000Z',
    targetType = 'user',
  ) =>
    audit.add({
      at: at(when),
      actorType: 'admin',
      actorId,
      action,
      targetType,
      targetId: MEMBER,
      meta: null,
    });

  beforeEach(() => {
    audit = new InMemoryAuditReadRepository();
    labels = new StubLabels();
    labels.labels = { [OWNER]: 'owner@example.test' };
    handler = new AuditQueryHandler(audit, labels);
  });

  it('names the actor from Identity rather than from the row', async () => {
    record('admin.setRole');

    const page = await handler.list({ first: 10 });

    // The row holds a principal id and nothing else, deliberately: a stored
    // name goes stale the moment somebody changes their address.
    expect(page.nodes[0]?.actorLabel).toBe('owner@example.test');
  });

  it('falls back to the id for an actor nobody can name', async () => {
    record('admin.ban', 'deleted-admin');

    const page = await handler.list({ first: 10 });

    // A deleted member's acts stay in the trail — that is what a trail is for —
    // and a row that named nobody would be a row the Owner cannot act on.
    expect(page.nodes[0]?.actorLabel).toBe('deleted-admin');
  });

  it('asks for every actor on the page in one call', async () => {
    record('admin.setRole', OWNER);
    record('admin.ban', 'second-admin');
    record('admin.setRole', OWNER);

    await handler.list({ first: 10 });

    // One lookup per page, not per row: an audit page is slow exactly when
    // somebody is investigating something.
    expect(labels.asked).toHaveLength(1);
    expect(labels.asked[0]!.sort()).toEqual(['owner-1', 'second-admin']);
  });

  it('shows the newest act first', async () => {
    record('first');
    record('second');
    record('third');

    const page = await handler.list({ first: 10 });
    expect(page.nodes.map((node) => node.action)).toEqual([
      'third',
      'second',
      'first',
    ]);
  });

  it('pages without repeating or skipping an act', async () => {
    for (let index = 1; index <= 5; index += 1) record(`act-${index}`);

    const first = await handler.list({ first: 2 });
    expect(first.hasNextPage).toBe(true);

    const second = await handler.list({ first: 2, after: first.endCursor });
    const third = await handler.list({ first: 2, after: second.endCursor });

    const seen = [...first.nodes, ...second.nodes, ...third.nodes].map(
      (node) => node.action,
    );
    expect(seen).toEqual(['act-5', 'act-4', 'act-3', 'act-2', 'act-1']);
    expect(third.hasNextPage).toBe(false);
  });

  it('keeps paging correct while new acts arrive', async () => {
    for (let index = 1; index <= 3; index += 1) record(`act-${index}`);

    const first = await handler.list({ first: 2 });
    // Somebody does something while the Owner is reading page one.
    record('act-4');
    const second = await handler.list({ first: 2, after: first.endCursor });

    // The cursor is an id, so the second page continues where the first ended
    // rather than shifting by one the way an offset would — which for an audit
    // trail is the failure that matters: the page that quietly omits an act.
    expect(second.nodes.map((node) => node.action)).toEqual(['act-1']);
  });

  it('filters by actor, action and target type', async () => {
    record('admin.setRole', OWNER, '2026-09-10T09:00:00.000Z', 'user');
    record('admin.ban', 'second-admin', '2026-09-10T10:00:00.000Z', 'user');
    record('settings.patch', OWNER, '2026-09-10T11:00:00.000Z', 'setting');

    expect(
      (await handler.list({ first: 10, actor: OWNER })).nodes.map((n) => n.action),
    ).toEqual(['settings.patch', 'admin.setRole']);

    expect(
      (await handler.list({ first: 10, action: 'admin.ban' })).nodes,
    ).toHaveLength(1);

    expect(
      (await handler.list({ first: 10, targetType: 'setting' })).nodes.map(
        (n) => n.action,
      ),
    ).toEqual(['settings.patch']);
  });

  it('treats the range as half-open, so a row on the boundary lands once', async () => {
    record('before', OWNER, '2026-09-09T23:59:59.999Z');
    record('boundary', OWNER, '2026-09-10T00:00:00.000Z');

    const window = await handler.list({
      first: 10,
      from: at('2026-09-10T00:00:00.000Z'),
      to: at('2026-09-11T00:00:00.000Z'),
    });

    expect(window.nodes.map((node) => node.action)).toEqual(['boundary']);
  });
});

// ------------------------------------------------------------------- the usage

describe('what the model has been asked to do (FR-011)', () => {
  let usage: InMemoryUsageRepository;
  let handler: UsageQueryHandler;

  const call = (
    userId: string,
    when: string,
    promptTokens: number,
    completionTokens: number,
    kind = 'chat',
  ) =>
    usage.append({
      userId,
      kind,
      model: 'qwen2.5:3b-instruct',
      promptTokens,
      completionTokens,
      ms: 100,
      eventId: `${userId}-${when}-${promptTokens}-${kind}`,
      createdAt: new Date(when),
    });

  beforeEach(() => {
    usage = new InMemoryUsageRepository();
    handler = new UsageQueryHandler(usage);
  });

  it('counts the last day of the range, which is what an operator means', async () => {
    await call(MEMBER, '2026-09-07T23:30:00.000Z', 10, 5);

    const rows = await handler.between({ from: '2026-09-01', to: '2026-09-07' });

    // `to` is inclusive on the screen and exclusive in the store, and the
    // handler is the one place that turns one into the other. Getting it wrong
    // silently drops the last day of every report, and the number still looks
    // plausible.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.promptTokens).toBe(10);
  });

  it('leaves out the day after the range', async () => {
    await call(MEMBER, '2026-09-08T00:00:00.000Z', 10, 5);
    expect(
      await handler.between({ from: '2026-09-01', to: '2026-09-07' }),
    ).toEqual([]);
  });

  it('totals the same however it is grouped', async () => {
    await call(MEMBER, '2026-09-05T09:00:00.000Z', 100, 50);
    await call('member-2', '2026-09-05T10:00:00.000Z', 200, 25);
    await call(MEMBER, '2026-09-06T09:00:00.000Z', 10, 5, 'intent');

    const whole = await handler.between({ from: '2026-09-01', to: '2026-09-30' });
    const perMember = await handler.between({
      from: '2026-09-01',
      to: '2026-09-30',
      byMember: true,
    });

    const sum = (rows: Array<{ promptTokens: number; completionTokens: number }>) =>
      rows.reduce(
        (total, row) => total + row.promptTokens + row.completionTokens,
        0,
      );

    // The per-member view is the same arithmetic sliced differently. If the two
    // disagreed, one of the two screens would be wrong and there would be no
    // way to tell which.
    expect(sum(perMember)).toBe(sum(whole));
    expect(sum(whole)).toBe(390);
  });

  it('names the member only when asked to group by member', async () => {
    await call(MEMBER, '2026-09-05T09:00:00.000Z', 100, 50);

    const whole = await handler.between({ from: '2026-09-01', to: '2026-09-30' });
    const perMember = await handler.between({
      from: '2026-09-01',
      to: '2026-09-30',
      byMember: true,
    });

    expect(whole[0]?.userId).toBeNull();
    expect(perMember[0]?.userId).toBe(MEMBER);
  });

  it('separates the kinds, which is what makes a runaway loop visible', async () => {
    await call(MEMBER, '2026-09-05T09:00:00.000Z', 100, 50, 'chat');
    await call(MEMBER, '2026-09-05T09:05:00.000Z', 10, 5, 'intent');

    const rows = await handler.between({ from: '2026-09-05', to: '2026-09-05' });

    expect(rows.map((row) => row.kind).sort()).toEqual(['chat', 'intent']);
  });

  it('narrows to one member when asked', async () => {
    await call(MEMBER, '2026-09-05T09:00:00.000Z', 100, 50);
    await call('member-2', '2026-09-05T09:00:00.000Z', 999, 999);

    const rows = await handler.between({
      from: '2026-09-05',
      to: '2026-09-05',
      userId: MEMBER,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.promptTokens).toBe(100);
  });
});

// ---------------------------------------------------------------- the registry

describe('a setting changed while the system is running (SC-003)', () => {
  let settings: SettingsService;
  let store: InMemorySettingsStore;

  beforeEach(() => {
    store = new InMemorySettingsStore();
    settings = new SettingsService(store, new InMemoryAuditAdapter());
  });

  it('is read at every invocation, not cached at boot', async () => {
    expect(await settings.get('rhythm.draftTopN')).toBe(5);

    await settings.set('rhythm.draftTopN', 9, {
      type: 'admin',
      id: OWNER,
      role: 'admin',
    });

    // No restart, and no wait: the next thing to ask gets the new value. This
    // is the whole of FR-006's "takes effect without restarting anything", and
    // it only holds because nothing memoises the registry at boot.
    expect(await settings.get('rhythm.draftTopN')).toBe(9);
  });

  it('leaves a job that is already running with the value it started with', async () => {
    /*
     * The spec's own edge case, and it needs no mechanism — which is the point
     * worth pinning.
     *
     * A job reads a key once at the top of its pass and then works with that
     * number. A change landing mid-pass cannot reach a local variable, so the
     * pass finishes as it began and the next one picks the new value up. A
     * `SettingsService` that pushed changes into running work would be the
     * thing to be afraid of here.
     */
    const started = await settings.get('rhythm.draftTopN');

    await settings.set('rhythm.draftTopN', 11, {
      type: 'admin',
      id: OWNER,
      role: 'admin',
    });

    expect(started).toBe(5);
    expect(await settings.get('rhythm.draftTopN')).toBe(11);
  });
});
